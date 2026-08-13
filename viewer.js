import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

function $(sel) { return document.querySelector(sel); }

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); }

class PropViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f14);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(8, 8, 12);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(4, 2, 4);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(6, 10, 8);
    this.scene.add(ambient, dir);

    this.blockSize = 1;
    this.blockGeo = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
    this.texLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this.proxyGroup = new THREE.Group();
    this.skinGroup = new THREE.Group();
    this.scene.add(this.proxyGroup);
    this.linksGroup = new THREE.Group();
    this.scene.add(this.linksGroup);
    this.scene.add(this.skinGroup);

    this._setupRenderer();
    this._overlay = document.getElementById('viewer-prop-delta');
    this._lastDelta = null;
    this._overlays = new Map(); // tracker_id -> { el, lastDelta, prop }
    this._animate();
  }

  _setupRenderer() {
    this.container.appendChild(this.renderer.domElement);
    const resize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = Math.max(0.01, w / Math.max(1, h));
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    resize();
    new ResizeObserver(resize).observe(this.container);
  }

  _animate() {
    const tick = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._updateOverlay();
      requestAnimationFrame(tick);
    };
    tick();
  }

  clear() {
    // remove proxy and skin children only
    const zap = (group) => {
      while (group.children.length) {
        const obj = group.children.pop();
        group.remove(obj);
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) obj.material.dispose?.();
        if (obj.isGroup || obj.isObject3D) {
          // dispose textures/materials recursively
          obj.traverse((n) => {
            if (n.geometry) n.geometry.dispose?.();
            if (n.material) n.material.dispose?.();
          });
        }
      }
    };
    zap(this.proxyGroup);
    zap(this.skinGroup);
  }

  async loadPropBlocks(prop) {
    this.clear();
    this.currentProp = prop;
    const blocks = prop.blocks || [];
    let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
    for (const b of blocks) {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color || '#ff9b42'), roughness: 0.6, metalness: 0.1 });
      if (b.texture) {
        try {
          const tex = await new Promise((resolve, reject) => this.texLoader.load(b.texture, resolve, undefined, reject));
          tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
          const uvs = b.uv_scale || [1,1];
          tex.repeat.set(uvs[0] || 1, uvs[1] || 1);
          mat.map = tex; mat.needsUpdate = true;
        } catch {}
      }
      const mesh = new THREE.Mesh(this.blockGeo, mat);
      mesh.position.set(b.x * this.blockSize, b.y * this.blockSize + this.blockSize/2, b.z * this.blockSize);
      this.proxyGroup.add(mesh);
      // track bounds in block space
      minx = Math.min(minx, b.x); maxx = Math.max(maxx, b.x);
      miny = Math.min(miny, b.y); maxy = Math.max(maxy, b.y);
      minz = Math.min(minz, b.z); maxz = Math.max(maxz, b.z);
    }
    // Compute proxy AABB center/size
    if (!isFinite(minx)) { minx=miny=minz=0; maxx=maxy=maxz=0; }
    const size = new THREE.Vector3(
      (maxx - minx + 1) * this.blockSize,
      (maxy - miny + 1) * this.blockSize,
      (maxz - minz + 1) * this.blockSize,
    );
    const center = new THREE.Vector3(
      ((minx + maxx + 1) / 2) * this.blockSize,
      ((miny + maxy + 1) / 2) * this.blockSize,
      ((minz + maxz + 1) / 2) * this.blockSize,
    );
    this.proxyBounds = { size, center, min: new THREE.Vector3(minx, miny, minz), max: new THREE.Vector3(maxx, maxy, maxz) };
    // Draw links overlay
    const links = prop.links || [];
    for (const lnk of links) this._drawLink(lnk);
    // Optionally load active skin
    if (prop.active_variant && Array.isArray(prop.variants)) {
      const active = prop.variants.find(v => (v.id || v.variant_id || v.name) === prop.active_variant);
      if (active) await this.loadSkin(active);
    }
  }

  _drawLink(link) {
    const mat = new THREE.LineBasicMaterial({ color: link.kind === 'hinge' ? 0x66ccff : link.kind === 'brace' ? 0xff66aa : 0xffffff });
    const a = new THREE.Vector3(link.a[0] * this.blockSize, link.a[1] * this.blockSize + this.blockSize/2, link.a[2] * this.blockSize);
    const b = new THREE.Vector3(link.b[0] * this.blockSize, link.b[1] * this.blockSize + this.blockSize/2, link.b[2] * this.blockSize);
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geom, mat);
    line.userData = { kind: link.kind };
    this.linksGroup.add(line);
    if (link.kind === 'hinge' && link.params && (link.params.minDeg != null) && (link.params.maxDeg != null)) {
      this._drawHingeArc(link, a);
    }
  }

  _drawHingeArc(link, center) {
    const axis = (link.params?.axis || 'y').toLowerCase();
    const minDeg = Number(link.params?.minDeg ?? -90);
    const maxDeg = Number(link.params?.maxDeg ?? 90);
    const radius = this.blockSize * 0.7;
    const segments = 32;
    const arcMat = new THREE.LineDashedMaterial({ color: 0x66ccff, dashSize: 0.15, gapSize: 0.1 });
    const pts = [];
    for (let i=0; i<=segments; i++) {
      const t = i/segments;
      const deg = minDeg + (maxDeg-minDeg)*t;
      const rad = (deg*Math.PI)/180;
      let p = new THREE.Vector3();
      if (axis === 'x') p.set(0, Math.cos(rad)*radius, Math.sin(rad)*radius);
      else if (axis === 'y') p.set(Math.cos(rad)*radius, 0, Math.sin(rad)*radius);
      else p.set(Math.cos(rad)*radius, Math.sin(rad)*radius, 0);
      p.add(center);
      pts.push(p);
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.userData = { kind: 'hinge-arc' };
    arc.computeLineDistances?.();
    this.linksGroup.add(arc);
  }

  _updateOverlay() {
    // Current prop overlay
    if (this._overlay) {
      const blocks = (this.currentProp && this.currentProp.blocks) || [];
      if (!blocks.length) { this._overlay.style.display='none'; }
      else {
        const center = this._computeCenter(blocks);
        this._positionOverlayEl(this._overlay, center);
        this._styleOverlayEl(this._overlay, this._lastDelta);
      }
    }
    // Additional overlays
    for (const [tid, ctx] of this._overlays.entries()) {
      const prop = ctx.prop; const blocks = prop.blocks || [];
      if (!blocks.length) { ctx.el.style.display='none'; continue; }
      const center = this._computeCenter(blocks);
      this._positionOverlayEl(ctx.el, center);
      this._styleOverlayEl(ctx.el, ctx.lastDelta);
    }
  }

  _computeCenter(blocks) {
    let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
    blocks.forEach(b=>{ minx=Math.min(minx,b.x); miny=Math.min(miny,b.y); minz=Math.min(minz,b.z); maxx=Math.max(maxx,b.x); maxy=Math.max(maxy,b.y); maxz=Math.max(maxz,b.z); });
    const center = new THREE.Vector3(((minx+maxx+1)/2), ((miny+maxy+1)/2), ((minz+maxz+1)/2));
    center.set(center.x*this.blockSize, center.y*this.blockSize, center.z*this.blockSize);
    return center;
  }

  _positionOverlayEl(el, worldCenter) {
    const p = worldCenter.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = (p.x * 0.5 + 0.5) * rect.width;
    const sy = (-p.y * 0.5 + 0.5) * rect.height;
    el.style.left = `${sx}px`; el.style.top = `${sy}px`; el.style.display = 'block';
  }

  _styleOverlayEl(el, val) {
    const warn = Number(document.getElementById('viewer-warn')?.value || 0.05);
    const alert = Number(document.getElementById('viewer-alert')?.value || 0.15);
    let bg = 'rgba(16,21,33,0.9)';
    if (val != null) {
      if (val>=alert) bg = 'rgba(200,40,40,0.95)';
      else if (val>=warn) bg = 'rgba(200,160,40,0.95)';
      else bg = 'rgba(40,160,80,0.95)';
    }
    el.style.background = bg; el.textContent = `Δ ${val==null?'—':val.toFixed(3)}`;
  }

  async loadSkin(variant) {
    // Find model URL on common keys
    const url = variant.modelFile || variant.model || variant.file || variant.url;
    if (!url) return;
    // Clear existing skin
    while (this.skinGroup.children.length) {
      const obj = this.skinGroup.children.pop();
      this.skinGroup.remove(obj);
    }
    // Load GLB and fit to proxy bounds
    const gltf = await this.gltfLoader.loadAsync(url);
    const skin = gltf.scene || gltf.scenes?.[0];
    if (!skin) return;
    // Compute model bounds
    const box = new THREE.Box3().setFromObject(skin);
    const modelSize = new THREE.Vector3();
    box.getSize(modelSize);
    const modelCenter = new THREE.Vector3();
    box.getCenter(modelCenter);
    // Compute uniform scale to fit within proxy size
    const target = this.proxyBounds?.size || new THREE.Vector3(1,1,1);
    const sx = target.x / (modelSize.x || 1);
    const sy = target.y / (modelSize.y || 1);
    const sz = target.z / (modelSize.z || 1);
    const s = Math.min(sx, sy, sz);
    skin.scale.setScalar(s);
    // Center to proxy center and align bottoms
    // Move model so that its center is at origin, then apply target transform
    const wrapper = new THREE.Group();
    wrapper.add(skin);
    skin.position.sub(modelCenter); // center at origin
    const proxyCenter = this.proxyBounds?.center || new THREE.Vector3(0,0,0);
    // Lift to align base: move up by half of target height minus half unit (blocks sit on y+0.5)
    const baseOffset = new THREE.Vector3(0, -(box.min.y) * s, 0);
    skin.position.add(baseOffset);
    wrapper.position.copy(proxyCenter);
    this.skinGroup.add(wrapper);
  }
}

async function main() {
  const viewer = new PropViewer($('#viewer3d'));
  const sceneIdInput = $('#viewer-scene-id');
  const listBtn = $('#viewer-list-props');
  const select = $('#viewer-prop-select');
  const loadBtn = $('#viewer-load-prop');
  const showProxy = $('#viewer-show-proxy');
  const showLinks = $('#viewer-show-links');
  const showLinkKind = $('#viewer-show-link-kind');
  const showHingeKind = $('#viewer-show-hinge-kind');
  const showBraceKind = $('#viewer-show-brace-kind');
  const variantSelect = $('#viewer-variant-select');
  const variantApply = $('#viewer-variant-apply');
  const variantName = $('#viewer-variant-name');
  const variantUrl = $('#viewer-variant-url');
  const variantAdd = $('#viewer-variant-add');
  const assetsQ = $('#viewer-assets-query');
  const assetsRefresh = $('#viewer-assets-refresh');
  const assetsGrid = $('#viewer-asset-models');
  const vTrackerId = $('#viewer-tracker-id');
  const vTrackerAttach = $('#viewer-tracker-attach');
  const vTrackerConnect = $('#viewer-tracker-connect');
  const vTrackerDelta = $('#viewer-tracker-delta');

  listBtn.addEventListener('click', async () => {
    try {
      const sceneId = sceneIdInput.value.trim();
      const url = sceneId ? `/api/pubworld/props?scene_id=${encodeURIComponent(sceneId)}` : '/api/pubworld/props';
      const resp = await getJSON(url);
      const props = resp.props || [];
      select.innerHTML = '';
      props.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.prop_id;
        opt.textContent = `${p.label} (${p.prop_id})`;
        opt.dataset.payload = JSON.stringify(p);
        select.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
    }
  });

  loadBtn.addEventListener('click', async () => {
    try {
      const opt = select.options[select.selectedIndex];
      if (!opt) return;
      const payload = JSON.parse(opt.dataset.payload || '{}');
      await viewer.loadPropBlocks(payload);
      // Populate variants UI
      variantSelect.innerHTML = '';
      const list = payload.variants || [];
      list.forEach(v => {
        const vid = v.id || v.variant_id || v.name || v.modelFile || v.file || v.url;
        const name = v.name || vid;
        const optV = document.createElement('option');
        optV.value = vid;
        optV.textContent = name;
        optV.dataset.payload = JSON.stringify(v);
        if (payload.active_variant && payload.active_variant === vid) optV.selected = true;
        variantSelect.appendChild(optV);
      });
      // Show/hide proxy & links
      viewer.proxyGroup.visible = showProxy.checked;
      viewer.linksGroup.visible = showLinks.checked;
    } catch (err) {
      console.error(err);
    }
  });

  showProxy.addEventListener('change', () => {
    viewer.proxyGroup.visible = showProxy.checked;
  });
  showLinks.addEventListener('change', () => {
    viewer.linksGroup.visible = showLinks.checked;
  });

  function updateKindFilters() {
    const lk = showLinkKind?.checked !== false;
    const hk = showHingeKind?.checked !== false;
    const bk = showBraceKind?.checked !== false;
    viewer.linksGroup.children.forEach(line => {
      const kind = line.userData?.kind || 'link';
      if (kind === 'hinge-arc') {
        line.visible = hk && showLinks.checked;
      } else if (kind === 'hinge') {
        line.visible = hk && showLinks.checked;
      } else if (kind === 'brace') {
        line.visible = bk && showLinks.checked;
      } else {
        line.visible = lk && showLinks.checked;
      }
    });
  }
  showLinkKind?.addEventListener('change', updateKindFilters);
  showHingeKind?.addEventListener('change', updateKindFilters);
  showBraceKind?.addEventListener('change', updateKindFilters);

  variantApply.addEventListener('click', async () => {
    try {
      const pOpt = select.options[select.selectedIndex];
      if (!pOpt) return;
      const prop = JSON.parse(pOpt.dataset.payload || '{}');
      const vOpt = variantSelect.options[variantSelect.selectedIndex];
      if (!vOpt) return;
      const vPayload = JSON.parse(vOpt.dataset.payload || '{}');
      await viewer.loadSkin(vPayload);
      // persist as active variant
      await fetch(`/api/pubworld/props/${encodeURIComponent(prop.prop_id)}/variants/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: vOpt.value }) });
    } catch (err) {
      console.error(err);
    }
  });

  variantAdd.addEventListener('click', async () => {
    try {
      const pOpt = select.options[select.selectedIndex];
      if (!pOpt) return;
      const prop = JSON.parse(pOpt.dataset.payload || '{}');
      const name = variantName.value.trim();
      const url = variantUrl.value.trim();
      if (!name || !url) return;
      const variants = (prop.variants || []).slice();
      const variant = { id: name.toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,48), name, modelFile: url };
      variants.push(variant);
      const resp = await fetch(`/api/pubworld/props/${encodeURIComponent(prop.prop_id)}/variants`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variants }) });
      if (!resp.ok) throw new Error(await resp.text());
      const updated = await resp.json();
      // refresh prop in select
      pOpt.dataset.payload = JSON.stringify(updated.prop);
      // add to dropdown
      const optV = document.createElement('option');
      optV.value = variant.id;
      optV.textContent = name;
      optV.dataset.payload = JSON.stringify(variant);
      variantSelect.appendChild(optV);
      variantName.value = '';
      variantUrl.value = '';
    } catch (err) {
      console.error(err);
    }
  });

  // Per-prop tracker association + HUD
  let ws = null;
  function connectTracker(id) {
    try { if (ws) ws.close(); } catch(_){}
    if (!id) return;
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/tracker/${encodeURIComponent(id)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data||'{}');
        if (msg.type==='delta') {
          const val = (msg.delta==null)?null:Number(msg.delta);
          viewer._lastDelta = val;
          vTrackerDelta.textContent = (val==null)?'—':val.toFixed(3);
          const warn = Number(document.getElementById('viewer-warn')?.value || 0.05);
          const alert = Number(document.getElementById('viewer-alert')?.value || 0.15);
          let color = 'inherit';
          if (val != null) {
            if (val>=alert) color = '#e74c3c';
            else if (val>=warn) color = '#f1c40f';
            else color = '#2ecc71';
          }
          vTrackerDelta.style.color = color;
        }
      } catch(_){}
    };
    ws.onclose = ()=>{ ws=null; };
  }
  vTrackerAttach.addEventListener('click', async () => {
    try {
      const opt = select.options[select.selectedIndex]; if (!opt) return;
      const prop = JSON.parse(opt.dataset.payload||'{}');
      const id = vTrackerId.value.trim(); if (!id) return;
      const ids = Array.isArray(prop.tracker_ids) ? prop.tracker_ids.slice() : [];
      if (!ids.includes(id)) ids.push(id);
      const r = await fetch(`/api/pubworld/props/${encodeURIComponent(prop.prop_id)}/trackers`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tracker_ids: ids }) });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json();
      opt.dataset.payload = JSON.stringify(updated.prop);
    } catch (e) { console.error(e); }
  });
  vTrackerConnect.addEventListener('click', ()=>{
    const id = vTrackerId.value.trim(); connectTracker(id);
  });

  const overlaysToggle = $('#viewer-overlays-toggle');
  let overlaySockets = new Map(); // tracker_id -> WebSocket
  overlaysToggle?.addEventListener('change', async () => {
    // cleanup
    overlaySockets.forEach(ws => { try { ws.close(); } catch(_){} });
    overlaySockets.clear();
    viewer._overlays.forEach(ctx => { try { ctx.el.remove(); } catch(_){} });
    viewer._overlays.clear();
    if (!overlaysToggle.checked) return;
    // fetch props for scene
    const sceneId = $('#viewer-scene-id')?.value.trim(); if (!sceneId) return;
    try {
      const resp = await getJSON(`/api/pubworld/props?scene_id=${encodeURIComponent(sceneId)}`);
      const props = resp.props || [];
      const root = document.getElementById('viewer3d');
      props.forEach(p => {
        const tids = Array.isArray(p.tracker_ids) ? p.tracker_ids : [];
        tids.forEach(tid => {
          if (!tid || overlaySockets.has(tid)) return;
          const el = document.createElement('div');
          el.style.position='absolute'; el.style.display='none'; el.style.transform='translate(-50%,-50%)';
          el.style.background='rgba(16,21,33,0.9)'; el.style.border='1px solid rgba(255,255,255,0.12)'; el.style.borderRadius='8px'; el.style.padding='4px 8px'; el.style.fontSize='12px'; el.style.color='#fff';
          el.textContent='Δ —'; root.appendChild(el);
          viewer._overlays.set(tid, { el, lastDelta: null, prop: p });
          const proto = (location.protocol==='https:')?'wss':'ws';
          const ws = new WebSocket(`${proto}://${location.host}/ws/tracker/${encodeURIComponent(tid)}`);
          ws.onmessage = (ev) => {
            try { const m = JSON.parse(ev.data||'{}'); if (m.type==='delta') { const ctx = viewer._overlays.get(tid); if (ctx) ctx.lastDelta = (m.delta==null)?null:Number(m.delta); } } catch(_){}
          };
          ws.onclose = ()=>{ overlaySockets.delete(tid); const ctx=viewer._overlays.get(tid); if (ctx) { try { ctx.el.remove(); } catch(_){} viewer._overlays.delete(tid);} };
          overlaySockets.set(tid, ws);
        });
      });
    } catch (e) { console.error(e); }
  });

  async function refreshModelAssets() {
    try {
      const q = assetsQ?.value.trim() || '';
      const resp = await fetch(`/api/assets/list?kind=model${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (!resp.ok) throw new Error(await resp.text());
      const body = await resp.json();
      if (!assetsGrid) return;
      assetsGrid.innerHTML = '';
      (body.assets || []).forEach(a => {
        const div = document.createElement('div'); div.className = 'asset';
        const icon = document.createElement('div'); icon.style.height='90px'; icon.style.display='flex'; icon.style.alignItems='center'; icon.style.justifyContent='center'; icon.textContent = a.ext.toUpperCase().replace('.', ''); icon.style.color='rgba(255,255,255,0.8)';
        const name = document.createElement('div'); name.className = 'name'; name.textContent = a.name;
        div.append(icon, name);
        div.addEventListener('click', async () => {
          try {
            const pOpt = select.options[select.selectedIndex];
            if (!pOpt) return;
            const prop = JSON.parse(pOpt.dataset.payload || '{}');
            const variants = (prop.variants || []).slice();
            const v = { id: a.name.toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,48), name: a.name, modelFile: a.path };
            variants.push(v);
            const resp2 = await fetch(`/api/pubworld/props/${encodeURIComponent(prop.prop_id)}/variants`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ variants }) });
            if (!resp2.ok) throw new Error(await resp2.text());
            const updated = await resp2.json();
            // refresh variants dropdown
            const p = updated.prop;
            select.options[select.selectedIndex].dataset.payload = JSON.stringify(p);
            variantSelect.innerHTML = '';
            (p.variants || []).forEach(vx => {
              const vid = vx.id || vx.variant_id || vx.name || vx.modelFile || vx.file || vx.url;
              const nm = vx.name || vid;
              const optV = document.createElement('option');
              optV.value = vid; optV.textContent = nm; optV.dataset.payload = JSON.stringify(vx);
              if (p.active_variant && p.active_variant === vid) optV.selected = true;
              variantSelect.appendChild(optV);
            });
          } catch (e) {
            console.error('Add variant failed', e);
          }
        });
        assetsGrid.appendChild(div);
      });
    } catch (err) {
      console.error('Assets list failed', err);
    }
  }

  assetsRefresh?.addEventListener('click', refreshModelAssets);
  assetsQ?.addEventListener('input', () => { clearTimeout(window.__vAssetTimer); window.__vAssetTimer = setTimeout(refreshModelAssets, 300); });
  refreshModelAssets();
}

document.addEventListener('DOMContentLoaded', main);
