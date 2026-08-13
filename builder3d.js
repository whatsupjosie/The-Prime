// Three.js 3D block builder with grid snapping
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

function $(sel) { return document.querySelector(sel); }

function logTo(selector, value) {
  const el = $(selector);
  if (!el) return;
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

class BlockBuilder3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f14);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(8, 10, 14);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(4, 0, 4);

    this.grid = new THREE.GridHelper(40, 40, 0x334455, 0x223344);
    this.grid.position.y = 0;
    this.scene.add(this.grid);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    this.scene.add(ambient, dir);

    // Raycast plane for XZ; we move it to current Y level
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.pickPlane.rotateX(-Math.PI / 2);
    this.scene.add(this.pickPlane);

    this.blockSize = 1; // unit cube per foot
    this.blockGeo = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
    this.blockMat = new THREE.MeshStandardMaterial({ color: 0xff9b42, roughness: 0.6, metalness: 0.1 });

    // Current style state
    this.currentColor = '#ff9b42';
    this.currentTexture = null; // THREE.Texture
    this.currentTexturePath = null; // server path
    this.uvScale = { x: 1, y: 1 };

    this.blocks = new Map(); // key "x,y,z" -> { mesh, color, texture, uv_scale, selected }
    this.links = []; // { kind, a:[x,y,z], b:[x,y,z] }
    this.linksGroup = new THREE.Group();
    this.scene.add(this.linksGroup);
    this.pendingLink = null; // first endpoint when in link mode
    this.maxLinkLength = 6; // units in block space

    this._setupRenderer();
    this._setupEvents();
    this._animate();

    // Tracker HUD
    this.tracker = { id: null, socket: null };
    const hud = document.createElement('div');
    hud.id = 'tracker-hud';
    hud.style.position = 'absolute';
    hud.style.right = '10px'; hud.style.top = '10px';
    hud.style.background = 'rgba(16,21,33,0.9)'; hud.style.border = '1px solid rgba(255,255,255,0.12)';
    hud.style.borderRadius = '8px'; hud.style.padding = '6px 8px'; hud.style.color = '#fff';
    hud.style.fontSize = '12px'; hud.textContent = 'Delta';
    // Position within viewport container
    this.container.style.position = 'relative';
    this.container.appendChild(hud);
    this._hudEl = hud;

    // Transform gizmo setup
    this.gizmoAnchor = new THREE.Object3D();
    this.scene.add(this.gizmoAnchor);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setMode('translate');
    this.gizmo.visible = false;
    this.gizmo.enabled = false;
    this.gizmo.addEventListener('mouseDown', () => { this._gizmoStart = this.gizmoAnchor.position.clone(); this._gizmoStartRotY = this.gizmoAnchor.rotation.y; });
    this.gizmo.addEventListener('mouseUp', () => {
      const mode = document.getElementById('transform-mode')?.value || 'none';
      if (mode === 'translate') {
        if (!this._gizmoStart) return;
        const end = this.gizmoAnchor.position.clone();
        const delta = end.clone().sub(this._gizmoStart);
        const dx = Math.round(delta.x / this.blockSize);
        const dy = Math.round(delta.y / this.blockSize);
        const dz = Math.round(delta.z / this.blockSize);
        if (dx || dy || dz) this.translateSelection(dx, dy, dz, true);
        this._gizmoStart = null;
      } else if (mode === 'rotate_y' || mode === 'rotate_x' || mode === 'rotate_z') {
        // Use anchor rotation; compute steps based on selected axis
        let d = 0;
        if (mode === 'rotate_y') {
          const endRot = this.gizmoAnchor.rotation.y; d = endRot - (this._gizmoStartRotY || 0);
        } else if (mode === 'rotate_x') {
          const endRot = this.gizmoAnchor.rotation.x; d = endRot - (this._gizmoStartRotX || 0);
        } else {
          const endRot = this.gizmoAnchor.rotation.z; d = endRot - (this._gizmoStartRotZ || 0);
        }
        const steps = Math.round(d / (Math.PI/2));
        if (steps) this._rotateSelectionAxis(mode.slice(-1), steps);
        // reset anchor rotation on all axes
        this.gizmoAnchor.rotation.set(0,0,0);
        this._gizmoStartRotY = this._gizmoStartRotX = this._gizmoStartRotZ = null;
      }
      this._refreshGizmo();
    });
    this.scene.add(this.gizmo);
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

  _setupEvents() {
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      // Box-select if Shift
      if (e.shiftKey) {
        this._beginBoxSelect(e);
        return;
      }
      this._onPointerDown(e);
    });
    // style controls
    $('#block-color')?.addEventListener('input', (e) => {
      this.currentColor = e.target.value || '#ff9b42';
    });
    $('#pattern-x')?.addEventListener('change', (e) => {
      this.uvScale.x = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
    });
    $('#pattern-y')?.addEventListener('change', (e) => {
      this.uvScale.y = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
    });
    $('#block-texture-file')?.addEventListener('change', (e) => this._uploadTexture(e.target.files?.[0]));
    $('#clear-texture')?.addEventListener('click', () => {
      this.currentTexture = null;
      this.currentTexturePath = null;
    });
    document.getElementById('clear-links')?.addEventListener('click', () => this.clearAllLinks());
    // drag & drop textures
    const prevent = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    this.renderer.domElement.addEventListener('dragover', prevent);
    this.renderer.domElement.addEventListener('dragenter', prevent);
    this.renderer.domElement.addEventListener('drop', (ev) => {
      prevent(ev);
      const file = ev.dataTransfer?.files?.[0];
      if (file && file.type && file.type.startsWith('image/')) {
        this._uploadTexture(file);
        return;
      }
      const path = ev.dataTransfer?.getData('text/plain') || '';
      if (path && /\.(png|jpe?g|gif|bmp|tiff?|webp|svg)$/i.test(path)) {
        this._loadTexture(path).then(tex => { this.currentTexture = tex; this.currentTexturePath = path; }).catch(()=>{});
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (ev) => {
      const setMode = (m) => {
        const el = document.querySelector(`input[name="edit-mode"][value="${m}"]`);
        if (el) { el.checked = true; }
      };
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable)) return;
      switch ((ev.key || '').toLowerCase()) {
        case 'e': setMode('eyedropper'); break;
        case 'p': setMode('paint'); break;
        case 'l': setMode('link'); break;
        case 'd': setMode('delete'); break;
        case 'a': setMode('add'); break;
        case 'm': {
          const cb = document.getElementById('multi-select'); if (cb) cb.checked = !cb.checked; break;
        }
        case 'g': this.grid.visible = !this.grid.visible; break;
        case 'r': document.getElementById('recognize-3d')?.click(); break;
        case 's': document.getElementById('save-prototype')?.click(); break;
        case 'c': document.getElementById('clear-selection')?.click(); break;
        case 'k': document.getElementById('clear-links')?.click(); break;
        default: break;
      }
    });
  }

  _onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // update plane Y to chosen layer
    const yLevel = parseInt($('#y-level')?.value || '0', 10) || 0;
    this.pickPlane.position.y = yLevel;
    const mode = (document.querySelector('input[name="edit-mode"]:checked')?.value || 'add');
    // Try select existing blocks first
    const blockMeshes = Array.from(this.blocks.values()).map(v => v.mesh || v);
    const hitsBlocks = this.raycaster.intersectObjects(blockMeshes, false);
    if (hitsBlocks.length) {
      const mesh = hitsBlocks[0].object;
      const pos = mesh.position;
      const bx = Math.round(pos.x / this.blockSize);
      const by = Math.round((pos.y - this.blockSize / 2) / this.blockSize);
      const bz = Math.round(pos.z / this.blockSize);
      if (mode === 'delete') return this.removeBlock(bx, by, bz);
      if (mode === 'paint') {
        const multi = document.getElementById('multi-select')?.checked;
        if (multi) return this.toggleSelect(bx, by, bz);
        return this.paintBlock(bx, by, bz);
      }
      if (mode === 'eyedropper') return this.pickBlockStyle(bx, by, bz);
      if (mode === 'link') return this.addLinkEndpoint(bx, by, bz);
    }
    // If delete mode, try click on a link line
    if (mode === 'delete') {
      const hitsLines = this.raycaster.intersectObjects(this.linksGroup.children, false);
      if (hitsLines.length) {
        const line = hitsLines[0].object;
        const link = line.userData.link;
        if (link) this.removeLinkByEnds(link);
        return;
      }
    }
    // Else use the plane for add/delete at grid
    const hits = this.raycaster.intersectObjects([this.pickPlane], false);
    if (!hits.length) return;
    const p = hits[0].point;
    const x = Math.round(p.x / this.blockSize);
    const z = Math.round(p.z / this.blockSize);
    const y = yLevel; // snapped layer
    if (mode === 'delete') return this.removeBlock(x, y, z);
    if (mode === 'paint') return; // nothing to paint on empty space
    if (mode === 'link') return; // links require clicking blocks
    this.addBlock(x, y, z);
  }

  _animate() {
    const tick = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    tick();
  }

  _key(x, y, z) { return `${x},${y},${z}`; }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.currentColor), roughness: 0.6, metalness: 0.1 });
    if (this.currentTexture) {
      mat.map = this.currentTexture;
      mat.map.wrapS = THREE.RepeatWrapping;
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(this.uvScale.x, this.uvScale.y);
      mat.needsUpdate = true;
    }
    return mat;
  }

  _beginBoxSelect(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const start = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.left = start.x + 'px'; box.style.top = start.y + 'px';
    box.style.border = '1px dashed rgba(255,255,255,0.6)';
    box.style.background = 'rgba(64,217,255,0.15)';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '1500';
    this.container.appendChild(box);
    const onMove = (e) => {
      const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      const minx = Math.min(start.x, x); const miny = Math.min(start.y, y);
      const w = Math.abs(start.x - x); const h = Math.abs(start.y - y);
      box.style.left = minx + 'px'; box.style.top = miny + 'px';
      box.style.width = w + 'px'; box.style.height = h + 'px';
    };
    const onUp = (e) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { this._commitBoxSelect(box); } finally { box.remove(); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  _commitBoxSelect(box) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sel = {
      x: parseFloat(box.style.left),
      y: parseFloat(box.style.top),
      w: parseFloat(box.style.width || '0'),
      h: parseFloat(box.style.height || '0'),
    };
    if (sel.w <= 1 || sel.h <= 1) return;
    const inside = (sx, sy) => sx >= sel.x && sx <= (sel.x + sel.w) && sy >= sel.y && sy <= (sel.y + sel.h);
    const additive = !!(window.event && (window.event.ctrlKey || window.event.metaKey));
    if (!additive) this.clearSelection();
    for (const [key, entry] of this.blocks) {
      const mesh = entry.mesh || entry;
      const p = mesh.position.clone();
      p.project(this.camera);
      const sx = (p.x * 0.5 + 0.5) * rect.width;
      const sy = (-p.y * 0.5 + 0.5) * rect.height;
      const hit = inside(sx, sy);
      if (!hit) continue;
      const [bx, by, bz] = key.split(',').map(n => parseInt(n, 10));
      if (additive) this.toggleSelect(bx, by, bz); else if (!entry.selected) this.toggleSelect(bx, by, bz);
    }
    document.dispatchEvent(new CustomEvent('builder:links-changed'));
  }

  addBlock(x, y, z) {
    const key = this._key(x, y, z);
    if (this.blocks.has(key)) return;
    const mesh = new THREE.Mesh(this.blockGeo, this._makeMaterial());
    mesh.position.set(x * this.blockSize, y * this.blockSize + this.blockSize / 2, z * this.blockSize);
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.scene.add(mesh);
    this.blocks.set(key, { mesh, color: this.currentColor, texture: this.currentTexturePath, uv_scale: { ...this.uvScale }, selected: false });
    document.dispatchEvent(new CustomEvent('builder:blocks-changed'));
  }

  removeBlock(x, y, z) {
    const key = this._key(x, y, z);
    const entry = this.blocks.get(key);
    if (!entry) return;
    const mesh = entry.mesh || entry;
    this.scene.remove(mesh);
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
    this.blocks.delete(key);
    document.dispatchEvent(new CustomEvent('builder:blocks-changed'));
  }

  clear() {
    for (const [key, entry] of this.blocks) {
      const mesh = entry.mesh || entry;
      this.scene.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    this.blocks.clear();
    this.clearAllLinks();
    document.dispatchEvent(new CustomEvent('builder:blocks-changed'));
  }

  exportBlocks() {
    const rows = [];
    for (const [key, entry] of this.blocks) {
      const [x, y, z] = key.split(',').map(n => parseInt(n, 10));
      const meta = entry || {};
      const uv = meta.uv_scale || { x: 1, y: 1 };
      rows.push({ x, y, z, kind: 'cube', color: meta.color || null, texture: meta.texture || null, uv_scale: [uv.x || 1, uv.y || 1] });
    }
    return rows;
  }

  exportLinks() {
    return this.links.slice();
  }

  loadBlocks(blocks) {
    if (!Array.isArray(blocks)) return;
    blocks.forEach(b => {
      const prevColor = this.currentColor;
      const prevTex = this.currentTexture;
      const prevPath = this.currentTexturePath;
      const prevUv = { ...this.uvScale };
      this.currentColor = b.color || this.currentColor;
      this.uvScale = { x: (b.uv_scale?.[0] || 1), y: (b.uv_scale?.[1] || 1) };
      const place = () => {
        this.addBlock(b.x|0, b.y|0, b.z|0);
        this.currentColor = prevColor;
        this.currentTexture = prevTex;
        this.currentTexturePath = prevPath;
        this.uvScale = prevUv;
      };
      if (b.texture) {
        this._loadTexture(b.texture).then(tex => {
          this.currentTexture = tex;
          this.currentTexturePath = b.texture;
          place();
        }).catch(() => place());
      } else {
        this.currentTexture = null;
        this.currentTexturePath = null;
        place();
      }
    });
  }

  loadLinks(links) {
    this.links = Array.isArray(links) ? links.slice() : [];
    this._redrawLinks();
    document.dispatchEvent(new CustomEvent('builder:links-changed'));
  }

  translateSelection(dx, dy, dz, snap=true) {
    dx = Number(dx||0); dy = Number(dy||0); dz = Number(dz||0);
    if (snap) { dx = Math.round(dx); dy = Math.round(dy); dz = Math.round(dz); }
    if (!dx && !dy && !dz) return;
    const selectedKeys = [];
    for (const [key, entry] of this.blocks) { if (entry.selected) selectedKeys.push(key); }
    if (!selectedKeys.length) return;
    // Move blocks
    const updates = [];
    for (const key of selectedKeys) {
      const entry = this.blocks.get(key);
      const [x,y,z] = key.split(',').map(n=>parseInt(n,10));
      const nx = x+dx, ny=y+dy, nz=z+dz;
      updates.push({ oldKey:key, entry, nx, ny, nz });
    }
    updates.forEach(u => {
      // remove old
      const mesh = u.entry.mesh || u.entry;
      this.scene.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.();
      this.blocks.delete(u.oldKey);
      // add new
      const key = this._key(u.nx, u.ny, u.nz);
      const mesh2 = new THREE.Mesh(this.blockGeo, this._makeMaterial());
      mesh2.position.set(u.nx*this.blockSize, u.ny*this.blockSize + this.blockSize/2, u.nz*this.blockSize);
      this.scene.add(mesh2);
      this.blocks.set(key, { mesh: mesh2, color: this.currentColor, texture: this.currentTexturePath, uv_scale: { ...this.uvScale }, selected: true });
    });
    // Update links endpoints if they are in moved set
    const movedSet = new Set(selectedKeys.map(k => k));
    const toKey = (x,y,z)=>`${x},${y},${z}`;
    this.links = this.links.map(l => {
      const [ax,ay,az]=l.a; const [bx,by,bz]=l.b;
      const akey = toKey(ax,ay,az), bkey = toKey(bx,by,bz);
      const na = movedSet.has(akey) ? [ax+dx, ay+dy, az+dz] : l.a;
      const nb = movedSet.has(bkey) ? [bx+dx, by+dy, bz+dz] : l.b;
      return { ...l, a: na, b: nb };
    });
    this._redrawLinks();
    this._updateSelectionIndicator?.();
  }

  // ----- Links -----
  addLinkEndpoint(x, y, z) {
    const pt = { x, y, z };
    if (!this.pendingLink) {
      this.pendingLink = pt;
      return;
    }
    const a = this.pendingLink; const b = pt;
    this.pendingLink = null;
    // avoid linking same point
    if (a.x === b.x && a.y === b.y && a.z === b.z) return;
    // dupe check
    const exists = this.links.some(l => {
      const sameA = l.a[0]===a.x && l.a[1]===a.y && l.a[2]===a.z && l.b[0]===b.x && l.b[1]===b.y && l.b[2]===b.z;
      const sameB = l.a[0]===b.x && l.a[1]===b.y && l.a[2]===b.z && l.b[0]===a.x && l.b[1]===a.y && l.b[2]===a.z;
      return sameA || sameB;
    });
    if (exists) {
      document.dispatchEvent(new CustomEvent('builder:warn', { detail: { message: 'Duplicate link ignored' } }));
      return;
    }
    // length cap
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > this.maxLinkLength) {
      document.dispatchEvent(new CustomEvent('builder:warn', { detail: { message: `Link too long (${dist.toFixed(1)} > ${this.maxLinkLength})` } }));
      return;
    }
    const kind = document.getElementById('link-kind')?.value || 'link';
    const link = { kind, a: [a.x, a.y, a.z], b: [b.x, b.y, b.z] };
    if (kind === 'hinge') {
      const axis = document.getElementById('hinge-axis')?.value || 'y';
      const minDeg = parseFloat(document.getElementById('hinge-min')?.value || '-90');
      const maxDeg = parseFloat(document.getElementById('hinge-max')?.value || '90');
      link.params = { axis, minDeg, maxDeg };
    }
    this.links.push(link);
    this._redrawLinks();
    document.dispatchEvent(new CustomEvent('builder:links-changed'));
  }

  _drawLink(link) {
    // Visual line between block centers
    const mat = new THREE.LineBasicMaterial({ color: link.kind === 'hinge' ? 0x66ccff : link.kind === 'brace' ? 0xff66aa : 0xffffff });
    // compute face-centered endpoints for visuals
    const aCenter = new THREE.Vector3(link.a[0] * this.blockSize, link.a[1] * this.blockSize + this.blockSize / 2, link.a[2] * this.blockSize);
    const bCenter = new THREE.Vector3(link.b[0] * this.blockSize, link.b[1] * this.blockSize + this.blockSize / 2, link.b[2] * this.blockSize);
    const dir = new THREE.Vector3().subVectors(bCenter, aCenter);
    // pick dominant axis
    const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
    let offsetA = new THREE.Vector3();
    let offsetB = new THREE.Vector3();
    const half = this.blockSize / 2;
    if (ax >= ay && ax >= az) {
      offsetA.set(Math.sign(dir.x) * half, 0, 0);
      offsetB.set(-Math.sign(dir.x) * half, 0, 0);
    } else if (ay >= ax && ay >= az) {
      offsetA.set(0, Math.sign(dir.y) * half, 0);
      offsetB.set(0, -Math.sign(dir.y) * half, 0);
    } else {
      offsetA.set(0, 0, Math.sign(dir.z) * half);
      offsetB.set(0, 0, -Math.sign(dir.z) * half);
    }
    const a = aCenter.clone().add(offsetA);
    const b = bCenter.clone().add(offsetB);
    const pts = [a, b];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geom, mat);
    // tag so we can hit-test and remove later
    line.userData.link = link;
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
    const arcPts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const deg = minDeg + (maxDeg - minDeg) * t;
      const rad = (deg * Math.PI) / 180;
      let p = new THREE.Vector3();
      if (axis === 'x') {
        // rotate in YZ plane
        p.set(0, Math.cos(rad) * radius, Math.sin(rad) * radius);
      } else if (axis === 'y') {
        // rotate in XZ plane
        p.set(Math.cos(rad) * radius, 0, Math.sin(rad) * radius);
      } else {
        // 'z' rotate in XY plane
        p.set(Math.cos(rad) * radius, Math.sin(rad) * radius, 0);
      }
      p.add(center);
      arcPts.push(p);
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.computeLineDistances?.();
    this.linksGroup.add(arc);
  }

  clearAllLinks() {
    this.links = [];
    while (this.linksGroup.children.length) {
      const c = this.linksGroup.children.pop();
      this.linksGroup.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    document.dispatchEvent(new CustomEvent('builder:links-changed'));
  }

  exportLinks() {
    return this.links.slice();
  }

  getLinks() {
    return this.links.slice();
  }

  _redrawLinks() {
    // wipe
    while (this.linksGroup.children.length) {
      const c = this.linksGroup.children.pop();
      this.linksGroup.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    // draw
    for (const link of this.links) this._drawLink(link);
  }

  removeLinkByIndex(index) {
    if (index < 0 || index >= this.links.length) return;
    this.links.splice(index, 1);
    this._redrawLinks();
    document.dispatchEvent(new CustomEvent('builder:links-changed'));
  }

  removeLinkByEnds(link) {
    const idx = this.links.findIndex(l => l.kind === link.kind && l.a[0]===link.a[0] && l.a[1]===link.a[1] && l.a[2]===link.a[2] && l.b[0]===link.b[0] && l.b[1]===link.b[1] && l.b[2]===link.b[2]);
    if (idx >= 0) this.removeLinkByIndex(idx);
  }

  paintBlock(x, y, z) {
    const key = this._key(x, y, z);
    const entry = this.blocks.get(key);
    if (!entry) return;
    const mesh = entry.mesh || entry;
    mesh.material?.dispose?.();
    mesh.material = this._makeMaterial();
    this.blocks.set(key, { mesh, color: this.currentColor, texture: this.currentTexturePath, uv_scale: { ...this.uvScale } });
  }

  toggleSelect(x, y, z) {
    const key = this._key(x, y, z);
    const entry = this.blocks.get(key);
    if (!entry) return;
    entry.selected = !entry.selected;
    const mesh = entry.mesh || entry;
    if (mesh.material && mesh.material.isMeshStandardMaterial) {
      mesh.material.emissive = new THREE.Color(entry.selected ? 0x2266ff : 0x000000);
      mesh.material.emissiveIntensity = entry.selected ? 0.35 : 0.0;
    }
    this._updateSelectionIndicator?.();
  }

  clearSelection() {
    for (const entry of this.blocks.values()) {
      if (!entry.selected) continue;
      entry.selected = false;
      const mesh = entry.mesh || entry;
      if (mesh.material && mesh.material.isMeshStandardMaterial) {
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0.0;
      }
    }
    this._updateSelectionIndicator?.();
  }

  applyPaintToSelection() {
    for (const [key, entry] of this.blocks) {
      if (!entry.selected) continue;
      const [x, y, z] = key.split(',').map(n => parseInt(n, 10));
      this.paintBlock(x, y, z);
    }
  }

  pickBlockStyle(x, y, z) {
    const key = this._key(x, y, z);
    const entry = this.blocks.get(key);
    if (!entry) return;
    this.currentColor = entry.color || this.currentColor;
    const colorEl = document.getElementById('block-color');
    if (colorEl) colorEl.value = this.currentColor;
    const uv = entry.uv_scale || { x: 1, y: 1 };
    this.uvScale = { x: uv.x || uv[0] || 1, y: uv.y || uv[1] || 1 };
    if (entry.texture) {
      this._loadTexture(entry.texture).then(tex => {
        this.currentTexture = tex;
        this.currentTexturePath = entry.texture;
      }).catch(() => {
        this.currentTexture = null;
        this.currentTexturePath = null;
      });
    } else {
      this.currentTexture = null;
      this.currentTexturePath = null;
    }
  }

  async _uploadTexture(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: form });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const path = body.path || body.url || body.location;
      if (!path) throw new Error('Upload response missing path');
      const tex = await this._loadTexture(path);
      this.currentTexture = tex;
      this.currentTexturePath = path;
    } catch (err) {
      console.warn('Texture upload failed', err);
    }
  }

  _loadTexture(path) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(path, (tex) => resolve(tex), undefined, (e) => reject(e));
    });
  }
  _updateSelectionIndicator() {
    try {
      const el = document.getElementById('selection-count');
      if (!el) return;
      let count = 0;
      for (const entry of this.blocks.values()) if (entry.selected) count++;
      el.textContent = String(count);
    } catch (_) {}
  }

  _selectionBoundingCenter() {
    const rect = new THREE.Box3();
    let has = false;
    for (const [key, entry] of this.blocks) {
      if (!entry.selected) continue;
      const [x,y,z] = key.split(',').map(n=>parseInt(n,10));
      const min = new THREE.Vector3(x*this.blockSize - this.blockSize/2, y*this.blockSize, z*this.blockSize - this.blockSize/2);
      const max = new THREE.Vector3(x*this.blockSize + this.blockSize/2, y*this.blockSize + this.blockSize, z*this.blockSize + this.blockSize/2);
      if (!has) { rect.min.copy(min); rect.max.copy(max); has=true; }
      else { rect.expandByPoint(min); rect.expandByPoint(max); }
    }
    if (!has) return null;
    const center = new THREE.Vector3();
    rect.getCenter(center);
    return center;
  }

  _refreshGizmo() {
    if (!this.gizmo) return;
    const mode = document.getElementById('transform-mode')?.value || 'none';
    if (mode === 'none') { this._hideGizmo(); return; }
    const center = this._selectionBoundingCenter();
    if (!center) { this._hideGizmo(); return; }
    this.gizmoAnchor.position.copy(center);
    if (!this.gizmo.object) this.gizmo.attach(this.gizmoAnchor);
    this.gizmo.visible = true; this.gizmo.enabled = true;
    if (mode === 'translate') {
      this.gizmo.setMode('translate');
      const snap = !!document.getElementById('transform-snap')?.checked;
      this.gizmo.setTranslationSnap(snap ? this.blockSize : null);
      this.gizmo.setRotationSnap(null);
    } else if (mode.startsWith('rotate_')) {
      this.gizmo.setMode('rotate');
      const snap = !!document.getElementById('transform-snap')?.checked;
      this.gizmo.setRotationSnap(snap ? (Math.PI/2) : null);
      this.gizmo.setTranslationSnap(null);
    }
  }

  _hideGizmo() {
    this.gizmo.visible = false; this.gizmo.enabled = false;
    try { this.gizmo.detach(); } catch(_){}
  }

  _rotateSelectionAxis(axis, steps) {
    const center = this._selectionBoundingCenter(); if (!center) return;
    const cx = Math.round(center.x / this.blockSize);
    const cy = Math.round(center.y / this.blockSize);
    const cz = Math.round(center.z / this.blockSize);
    const selectedKeys = [];
    for (const [key, entry] of this.blocks) if (entry.selected) selectedKeys.push(key);
    if (!selectedKeys.length) return;
    const s = ((steps%4)+4)%4;
    const newEntries = [];
    selectedKeys.forEach(key => {
      const entry = this.blocks.get(key);
      const [x,y,z] = key.split(',').map(n=>parseInt(n,10));
      let nx=x, ny=y, nz=z;
      if (axis === 'y') {
        let dx = x - cx, dz = z - cz; let rx = dx, rz = dz;
        if (s === 1) { rx = dz; rz = -dx; }
        else if (s === 2) { rx = -dx; rz = -dz; }
        else if (s === 3) { rx = -dz; rz = dx; }
        nx = cx + rx; nz = cz + rz; ny = y;
      } else if (axis === 'x') {
        let dy = y - cy, dz = z - cz; let ry = dy, rz = dz;
        if (s === 1) { ry = dz; rz = -dy; }
        else if (s === 2) { ry = -dy; rz = -dz; }
        else if (s === 3) { ry = -dz; rz = dy; }
        ny = cy + ry; nz = cz + rz; nx = x;
      } else { // 'z'
        let dx = x - cx, dy = y - cy; let rx = dx, ry = dy;
        if (s === 1) { rx = dy; ry = -dx; }
        else if (s === 2) { rx = -dx; ry = -dy; }
        else if (s === 3) { rx = -dy; ry = dx; }
        nx = cx + rx; ny = cy + ry; nz = z;
      }
      newEntries.push({ oldKey:key, entry, nx, ny, nz });
    });
    newEntries.forEach(u => {
      const mesh = u.entry.mesh || u.entry;
      this.scene.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.();
      this.blocks.delete(u.oldKey);
      const key = this._key(u.nx, u.ny, u.nz);
      const mesh2 = new THREE.Mesh(this.blockGeo, this._makeMaterial());
      mesh2.position.set(u.nx*this.blockSize, u.ny*this.blockSize + this.blockSize/2, u.nz*this.blockSize);
      this.scene.add(mesh2);
      this.blocks.set(key, { mesh: mesh2, color: this.currentColor, texture: this.currentTexturePath, uv_scale: { ...this.uvScale }, selected: true });
    });
    const toKey = (x,y,z)=>`${x},${y},${z}`;
    const movedSet = new Set(selectedKeys.map(k=>k));
    this.links = this.links.map(l => {
      const akey = toKey(l.a[0], l.a[1], l.a[2]);
      const bkey = toKey(l.b[0], l.b[1], l.b[2]);
      const na = movedSet.has(akey) ? this._applyStepsAxis(l.a, s, axis, cx, cy, cz) : l.a;
      const nb = movedSet.has(bkey) ? this._applyStepsAxis(l.b, s, axis, cx, cy, cz) : l.b;
      return { ...l, a: na, b: nb };
    });
    this._redrawLinks();
    this._updateSelectionIndicator?.();
  }

  _applyStepsAxis(p, s, axis, cx, cy, cz) {
    if (axis === 'y') {
      let dx = p[0]-cx, dz = p[2]-cz; let rx = dx, rz = dz;
      if (s === 1) { rx = dz; rz = -dx; }
      else if (s === 2) { rx = -dx; rz = -dz; }
      else if (s === 3) { rx = -dz; rz = dx; }
      return [cx+rx, p[1], cz+rz];
    } else if (axis === 'x') {
      let dy = p[1]-cy, dz = p[2]-cz; let ry = dy, rz = dz;
      if (s === 1) { ry = dz; rz = -dy; }
      else if (s === 2) { ry = -dy; rz = -dz; }
      else if (s === 3) { ry = -dz; rz = dy; }
      return [p[0], cy+ry, cz+rz];
    } else { // 'z'
      let dx = p[0]-cx, dy = p[1]-cy; let rx = dx, ry = dy;
      if (s === 1) { rx = dy; ry = -dx; }
      else if (s === 2) { rx = -dx; ry = -dy; }
      else if (s === 3) { rx = -dy; ry = dx; }
      return [cx+rx, cy+ry, p[2]];
    }
  }

  async _generateModelThumbnail(url, width = 120, height = 90) {
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d0f14);
      const amb = new THREE.AmbientLight(0xffffff, 0.8);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(5, 8, 6);
      scene.add(amb, dir);
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) return null;
      scene.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      // Center model
      root.position.sub(center);
      const fov = 45 * Math.PI / 180;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.4;
      const cam = new THREE.PerspectiveCamera(45, width/height, 0.1, 1000);
      cam.position.set(distance, distance * 0.6, distance);
      cam.lookAt(new THREE.Vector3(0, 0, 0));
      cam.updateProjectionMatrix();
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height, false);
      renderer.render(scene, cam);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      renderer.dispose();
      return dataUrl;
    } catch (e) {
      return null;
    }
  }

  _connectTracker(id) {
    try { this._disconnectTracker(); } catch (_) {}
    if (!id) return;
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/tracker/${encodeURIComponent(id)}`);
    ws.onopen = () => { this.tracker = { id, socket: ws }; };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data || '{}');
        if (msg.type === 'delta') {
          const val = (msg.delta == null) ? null : Number(msg.delta);
          const v = (val == null) ? '—' : val.toFixed(3);
          if (this._hudEl) {
            this._hudEl.textContent = `Δ ${v}`;
            // thresholds
            const warn = Number(document.getElementById('tracker-warn')?.value || 0.05);
            const alert = Number(document.getElementById('tracker-alert')?.value || 0.15);
            let bg = 'rgba(16,21,33,0.9)';
            if (val != null) {
              if (val >= alert) bg = 'rgba(200,40,40,0.95)';
              else if (val >= warn) bg = 'rgba(200,160,40,0.95)';
              else bg = 'rgba(40,160,80,0.95)';
            }
            this._hudEl.style.background = bg;
          }
        }
      } catch (_) {}
    };
    ws.onclose = () => {
      if (this.tracker && this.tracker.socket === ws) this.tracker = { id: null, socket: null };
    };
  }

  _disconnectTracker() {
    if (this.tracker?.socket) {
      try { this.tracker.socket.close(); } catch (_) {}
    }
    this.tracker = { id: null, socket: null };
    if (this._hudEl) this._hudEl.textContent = 'Δ —';
  }

  _sendTrackerBaseline() {
    const ws = this.tracker?.socket;
    if (!ws || ws.readyState !== ws.OPEN) return;
    const now = performance.now()/1000;
    ws.send(JSON.stringify({ set_baseline: true, samples: [{ t: now, pos: [0,0,0], rot:[0,0,0,1] }] }));
  }
}

// Wire panel controls
function setup3DBuilder() {
  const container = $('#viewport3d');
  if (!container) return;
  const builder = new BlockBuilder3D(container);

  $('#clear-3d')?.addEventListener('click', () => builder.clear());

  async function postJSON(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  $('#save-prop-3d')?.addEventListener('click', async () => {
    try {
      const sceneId = $('#scene-id')?.value.trim();
      if (!sceneId) return logTo('#props-out', 'Enter an active Scene ID first.');
      const blocks = builder.exportBlocks();
      const links = builder.exportLinks?.() || [];
      if (!blocks.length) return logTo('#props-out', 'No blocks to save.');
      const resp = await postJSON('/api/pubworld/props', { scene_id: sceneId, label: 'prop', description: '', blocks, links });
      logTo('#props-out', resp.prop || resp);
    } catch (err) {
      logTo('#props-out', err.message || String(err));
    }
  });

  $('#save-prototype-3d')?.addEventListener('click', async () => {
    try {
      const blocks = builder.exportBlocks();
      const links = builder.exportLinks?.() || [];
      if (!blocks.length) return logTo('#proto-out', 'No blocks to save as prototype.');
      const label = ($('#prompt')?.value.trim()) || 'prototype';
      const resp = await postJSON('/api/pubworld/prototypes', { label, description: '', blocks, links });
      logTo('#proto-out', resp.prototype || resp);
    } catch (err) {
      logTo('#proto-out', err.message || String(err));
    }
  });

  $('#recognize-3d')?.addEventListener('click', async () => {
    try {
      const blocks = builder.exportBlocks();
      if (!blocks.length) return logTo('#gen-out', 'Nothing to recognize.');
      const r = await postJSON('/api/pubworld/recognize', { blocks });
      logTo('#gen-out', r.match || { match: null });
    } catch (err) {
      logTo('#gen-out', err.message || String(err));
    }
  });

  // Expose integration API for the existing builder.js
  window.Builder3D = {
    loadBlocks: (blocks) => builder.loadBlocks(blocks),
    loadLinks: (links) => builder.loadLinks(links),
    exportBlocks: () => builder.exportBlocks(),
    clear: () => builder.clear(),
    applyPaintToSelection: () => builder.applyPaintToSelection?.(),
    clearSelection: () => builder.clearSelection?.(),
    getLinks: () => builder.getLinks?.(),
    removeLinkByIndex: (i) => builder.removeLinkByIndex?.(i),
    exportLinks: () => builder.exportLinks?.(),
    setCurrentTexture: async (path) => {
      try {
        const tex = await builder._loadTexture(path);
        builder.currentTexture = tex;
        builder.currentTexturePath = path;
      } catch (e) {
        console.warn('Failed setting texture', e);
      }
    },
    generateModelThumbnail: (path, w, h) => builder._generateModelThumbnail(path, w, h),
    connectTracker: (id) => builder._connectTracker(id),
    disconnectTracker: () => builder._disconnectTracker(),
    setTrackerBaseline: () => builder._sendTrackerBaseline(),
    refreshTransformGizmo: () => builder._refreshGizmo?.(),
  };
}

// Minimal styles for better visuals
const style = document.createElement('style');
style.textContent = `
#viewport3d canvas { display:block; width:100%; height:100%; border-radius:10px; }
.asset-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px; }
.asset-grid .asset { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:6px; cursor:pointer; display:flex; flex-direction:column; gap:6px; }
.asset-grid .asset img { width:100%; height:90px; object-fit:cover; border-radius:6px; }
.asset-grid .asset .name { font-size:12px; color:rgba(255,255,255,0.8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', setup3DBuilder);
