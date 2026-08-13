async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const el = (sel) => document.querySelector(sel);

// Simple voxel preview renderer (2.5D CSS grid)
function renderPreview(blocks) {
  const root = el('#preview');
  root.innerHTML = '';
  if (!Array.isArray(blocks) || !blocks.length) return;

  const xs = blocks.map(b => b.x), ys = blocks.map(b => b.y), zs = blocks.map(b => b.z);
  const minx = Math.min(...xs), miny = Math.min(...ys), minz = Math.min(...zs);
  const maxx = Math.max(...xs), maxy = Math.max(...ys), maxz = Math.max(...zs);
  const w = (maxx - minx + 1);
  const d = (maxz - minz + 1);

  // Draw layer by layer (top-down)
  for (let y = maxy; y >= miny; y--) {
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.style.gridTemplateColumns = `repeat(${w}, 22px)`;
    const title = document.createElement('div');
    title.textContent = `y=${y}`;
    title.className = 'layer-title';
    root.appendChild(title);
    root.appendChild(layer);
    for (let z = minz; z <= maxz; z++) {
      for (let x = minx; x <= maxx; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const has = blocks.find(b => b.x === x && b.y === y && b.z === z);
        if (has) cell.classList.add('filled');
        layer.appendChild(cell);
      }
    }
  }
}

function logTo(id, obj) {
  const out = el(id);
  out.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

async function main() {
  let lastGenerated = [];

  el('#create-scene').addEventListener('click', async () => {
    try {
      const name = el('#scene-name').value.trim() || 'Builder Scene';
      const resp = await postJSON('/api/pubworld/scenes', { name, description: 'Built from Builder UI', grid: [], atmosphere: {}, triggers: [] });
      el('#scene-id').value = resp.scene.scene_id;
      logTo('#scenes-out', resp.scene);
    } catch (err) {
      logTo('#scenes-out', err.message || String(err));
    }
  });

  el('#list-scenes').addEventListener('click', async () => {
    try {
      const resp = await getJSON('/api/pubworld/scenes');
      logTo('#scenes-out', resp.scenes || []);
    } catch (err) {
      logTo('#scenes-out', err.message || String(err));
    }
  });

  el('#do-generate').addEventListener('click', async () => {
    try {
      const prompt = el('#prompt').value.trim();
      const sceneId = el('#scene-id').value.trim();
      const body = { prompt, scene_id: sceneId || null, label: null, description: '' };
      const resp = await postJSON('/api/pubworld/generate', body);
      const blocks = (resp.generated || resp.prop?.blocks || []).map(b => ({ x: b.x, y: b.y, z: b.z }));
      lastGenerated = blocks;
      renderPreview(blocks);
      // Populate 3D builder if present
      try { window.Builder3D?.loadBlocks(blocks); } catch (_) {}
      logTo('#gen-out', resp);
    } catch (err) {
      logTo('#gen-out', err.message || String(err));
    }
  });

  el('#save-prototype').addEventListener('click', async () => {
    try {
      const candidate = lastGenerated.length ? lastGenerated : (window.Builder3D?.exportBlocks() || []);
      if (!candidate.length) return logTo('#gen-out', 'Nothing to save as prototype.');
      const lbl = (el('#prompt').value.trim() || 'prototype');
      const links = window.Builder3D?.exportLinks?.() || [];
      const resp = await postJSON('/api/pubworld/prototypes', { label: lbl, description: '', blocks: candidate, links });
      logTo('#proto-out', resp.prototype);
    } catch (err) {
      logTo('#proto-out', err.message || String(err));
    }
  });

  el('#recognize-shape').addEventListener('click', async () => {
    try {
      const candidate = lastGenerated.length ? lastGenerated : (window.Builder3D?.exportBlocks() || []);
      if (!candidate.length) return logTo('#gen-out', 'Nothing to recognize.');
      const resp = await postJSON('/api/pubworld/recognize', { blocks: candidate });
      logTo('#gen-out', resp.match || { match: null });
    } catch (err) {
      logTo('#gen-out', err.message || String(err));
    }
  });

  // Optional: Save current blocks as Prop via non-3D button if we add one later
  const savePropBtn = el('#save-prop');
  if (savePropBtn) {
    savePropBtn.addEventListener('click', async () => {
      try {
        const sceneId = el('#scene-id').value.trim();
        if (!sceneId) return logTo('#props-out', 'Enter an active Scene ID first.');
        const candidate = lastGenerated.length ? lastGenerated : (window.Builder3D?.exportBlocks() || []);
        if (!candidate.length) return logTo('#props-out', 'No blocks to save.');
        const resp = await postJSON('/api/pubworld/props', { scene_id: sceneId, label: 'prop', description: '', blocks: candidate });
        logTo('#props-out', resp.prop || resp);
      } catch (err) {
        logTo('#props-out', err.message || String(err));
      }
    });
  }

  // Selection helpers for 3D builder
  el('#apply-paint')?.addEventListener('click', () => {
    try { window.Builder3D?.applyPaintToSelection(); } catch (_) {}
  });
  el('#clear-selection')?.addEventListener('click', () => {
    try { window.Builder3D?.clearSelection(); } catch (_) {}
  });

  // Links panel
  function refreshLinksPanel() {
    try {
      const links = window.Builder3D?.getLinks?.() || [];
      const listEl = el('#links-list');
      const countEl = el('#links-count');
      if (countEl) countEl.textContent = `${links.length} link(s)`;
      if (!listEl) return;
      if (!links.length) {
        listEl.textContent = 'No links.';
        return;
      }
      // Build a little table-like list
      const frag = document.createDocumentFragment();
      links.forEach((lnk, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '2px 0';
        const label = document.createElement('div');
        const extra = (lnk.kind === 'hinge' && lnk.params) ? ` [${lnk.params.axis || 'y'} ${lnk.params.minDeg ?? ''}°..${lnk.params.maxDeg ?? ''}°]` : '';
        label.textContent = `#${idx} ${lnk.kind}: (${lnk.a.join(',')}) ↔ (${lnk.b.join(',')})${extra}`;
        const btn = document.createElement('button');
        btn.className = 'ghost';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => {
          try { window.Builder3D?.removeLinkByIndex?.(idx); } catch (_) {}
        });
        row.append(label, btn);
        frag.appendChild(row);
      });
      listEl.innerHTML = '';
      listEl.appendChild(frag);
    } catch (_) {}
  }

  el('#links-refresh')?.addEventListener('click', refreshLinksPanel);
  document.addEventListener('builder:links-changed', refreshLinksPanel);
  refreshLinksPanel();

  el('#list-props').addEventListener('click', async () => {
    try {
      const sceneId = el('#scene-id').value.trim();
      const url = sceneId ? `/api/pubworld/props?scene_id=${encodeURIComponent(sceneId)}` : '/api/pubworld/props';
      const resp = await getJSON(url);
      logTo('#props-out', resp.props || []);
    } catch (err) {
      logTo('#props-out', err.message || String(err));
    }
  });

  el('#list-prototypes').addEventListener('click', async () => {
    try {
      const resp = await getJSON('/api/pubworld/prototypes');
      logTo('#proto-out', resp.prototypes || []);
    } catch (err) {
      logTo('#proto-out', err.message || String(err));
    }
  });

  // Assets panel
  async function refreshAssets() {
    const q = el('#assets-query')?.value.trim() || '';
    try {
      const imgs = await getJSON(`/api/assets/list?kind=image${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      const models = await getJSON(`/api/assets/list?kind=model${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      const imgRoot = el('#asset-images');
      const mdlRoot = el('#asset-models');
      if (imgRoot) {
        imgRoot.innerHTML = '';
        (imgs.assets || []).forEach(a => {
          const div = document.createElement('div'); div.className = 'asset';
          const img = document.createElement('img'); img.src = a.path; img.alt = a.name;
          const name = document.createElement('div'); name.className = 'name'; name.textContent = a.name;
          div.append(img, name);
          div.addEventListener('click', async () => {
            try { await window.Builder3D?.setCurrentTexture?.(a.path); } catch (_) {}
          });
          imgRoot.appendChild(div);
        });
      }
      if (mdlRoot) {
        mdlRoot.innerHTML = '';
        (models.assets || []).forEach((a, idx) => {
          const div = document.createElement('div'); div.className = 'asset';
          const img = document.createElement('img'); img.alt = a.name; img.style.objectFit='contain';
          const fallback = document.createElement('div'); fallback.style.height='90px'; fallback.style.display='flex'; fallback.style.alignItems='center'; fallback.style.justifyContent='center'; fallback.textContent = a.ext.toUpperCase().replace('.', ''); fallback.style.color='rgba(255,255,255,0.8)';
          const name = document.createElement('div'); name.className = 'name'; name.textContent = a.name;
          div.append(fallback, name);
          // Try to generate a thumbnail for first 6 items
          if (idx < 6) {
            window.Builder3D?.generateModelThumbnail?.(a.path, 120, 90).then(async (url) => {
              if (url) {
                img.src = url; div.insertBefore(img, name); fallback.remove();
                // Cache on server for future lists
                try { await fetch('/api/assets/thumbnail', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: a.name, data_url: url }) }); } catch(_){}
              }
            }).catch(()=>{});
          }
          mdlRoot.appendChild(div);
        });
      }
    } catch (err) {
      console.warn('Assets list failed', err);
    }
  }

  el('#assets-refresh')?.addEventListener('click', refreshAssets);
  el('#assets-query')?.addEventListener('input', () => { clearTimeout(window.__assetTimer); window.__assetTimer = setTimeout(refreshAssets, 300); });
  refreshAssets();

  // Minimal warning toast
  const toast = document.createElement('div');
  toast.style.position = 'fixed'; toast.style.right = '12px'; toast.style.bottom = '60px';
  toast.style.background = 'rgba(200,40,40,0.95)'; toast.style.color = '#fff'; toast.style.padding = '8px 12px';
  toast.style.borderRadius = '8px'; toast.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'; toast.style.display='none';
  toast.style.zIndex = '2000';
  document.body.appendChild(toast);
  function showToast(msg){ toast.textContent = msg; toast.style.display='block'; clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(()=>toast.style.display='none', 1800); }
  document.addEventListener('builder:warn', (e) => showToast(e.detail?.message || 'Warning'));

  // Project autosave wiring
  let autosaveTimer = null;
  function getBuilderSnapshot(){
    return {
      blocks: window.Builder3D?.exportBlocks?.() || [],
      links: window.Builder3D?.exportLinks?.() || [],
      tracker_id: (document.getElementById('tracker-id')?.value || '').trim() || null,
      ts: Date.now()/1000,
    };
  }
  async function saveAutosave(){
    const slug = (document.getElementById('builder-project-slug')?.value || '').trim();
    if (!slug) return;
    const snapshot = getBuilderSnapshot();
    try {
      const r = await fetch('/api/autosave', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ project_slug: slug, snapshot }) });
      if (!r.ok) throw new Error(await r.text());
      const when = new Date();
      const el = document.getElementById('builder-autosave-last'); if (el) el.textContent = when.toLocaleTimeString();
    } catch (_) {}
  }
  function startAutosave(){ if (autosaveTimer) clearInterval(autosaveTimer); autosaveTimer = setInterval(saveAutosave, 30000); }
  function stopAutosave(){ if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer=null; } }
  document.getElementById('builder-autosave-toggle')?.addEventListener('change', (e)=>{ if (e.target.checked) startAutosave(); else stopAutosave(); });
  document.getElementById('builder-restore-check')?.addEventListener('click', async ()=>{
    const slug = (document.getElementById('builder-project-slug')?.value || '').trim(); if (!slug) return;
    try {
      const r = await fetch(`/api/autosave/status?project_slug=${encodeURIComponent(slug)}`);
      const body = await r.json();
      const banner = document.getElementById('builder-restore-banner');
      if (body.autosave_newer && body.latest_autosave) {
        banner.style.display = 'block'; banner.dataset.url = body.latest_autosave;
      } else { banner.style.display = 'none'; banner.dataset.url = ''; }
    } catch (_) {}
  });
  document.getElementById('builder-restore-do')?.addEventListener('click', async ()=>{
    const banner = document.getElementById('builder-restore-banner'); const url=banner?.dataset.url; if (!url) return;
    try {
      const resp = await fetch(url); const snap = await resp.json();
      window.Builder3D?.clear?.();
      window.Builder3D?.loadBlocks?.(snap.blocks || []);
      window.Builder3D?.loadLinks?.(snap.links || []);
      if (snap.tracker_id) { const idEl=document.getElementById('tracker-id'); if (idEl) idEl.value = snap.tracker_id; try { window.Builder3D?.connectTracker?.(snap.tracker_id); } catch (_) {} }
      banner.style.display='none';
    } catch (_) {}
  });
  document.getElementById('builder-restore-dismiss')?.addEventListener('click', ()=>{ const b=document.getElementById('builder-restore-banner'); if (b) b.style.display='none'; });

  // Export / Import
  el('#builder-export')?.addEventListener('click', () => {
    const slug = el('#builder-project-slug')?.value.trim(); if (!slug) return;
    const url = `/api/builder/export?project_slug=${encodeURIComponent(slug)}`;
    window.open(url, '_blank');
  });
  el('#builder-import')?.addEventListener('change', async (e) => {
    try {
      const f = e.target.files?.[0]; if (!f) return;
      const form = new FormData(); form.append('file', f, f.name);
      const slug = el('#builder-project-slug')?.value.trim();
      const url = slug ? `/api/builder/import?target_slug=${encodeURIComponent(slug)}` : '/api/builder/import';
      const r = await fetch(url, { method:'POST', body: form });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const snap = body.snapshot || {};
      window.Builder3D?.clear?.();
      window.Builder3D?.loadBlocks?.(snap.blocks || []);
      window.Builder3D?.loadLinks?.(snap.links || []);
      if (snap.tracker_id) { const idEl=document.getElementById('tracker-id'); if (idEl) idEl.value = snap.tracker_id; try { window.Builder3D?.connectTracker?.(snap.tracker_id); } catch (_) {} }
      e.target.value = '';
    } catch (err) { console.warn('Import failed', err); }
  });

  // Presets
  async function refreshPresets() {
    try {
      const resp = await getJSON('/api/builder/presets');
      const sel = el('#preset-select');
      if (!sel) return;
      sel.innerHTML = '';
      (resp.presets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.preset_id; opt.textContent = p.name;
        opt.dataset.payload = JSON.stringify(p);
        sel.appendChild(opt);
      });
    } catch (err) { /* ignore */ }
  }
  el('#preset-save')?.addEventListener('click', async () => {
    try {
      const name = el('#preset-name').value.trim();
      if (!name) return;
      const blocks = window.Builder3D?.exportBlocks?.() || [];
      const links = window.Builder3D?.exportLinks?.() || [];
      const resp = await postJSON('/api/builder/presets', { name, blocks, links });
      el('#preset-name').value = '';
      await refreshPresets();
    } catch (_) {}
  });
  el('#preset-load')?.addEventListener('click', async () => {
    try {
      const sel = el('#preset-select');
      if (!sel) return;
      const opt = sel.options[sel.selectedIndex];
      if (!opt) return;
      const payload = JSON.parse(opt.dataset.payload || '{}');
      window.Builder3D?.clear?.();
      window.Builder3D?.loadBlocks?.(payload.blocks || []);
      window.Builder3D?.loadLinks?.(payload.links || []);
    } catch (_) {}
  });
  refreshPresets();

  // Transform apply
  el('#transform-apply')?.addEventListener('click', () => {
    const mode = el('#transform-mode')?.value || 'none';
    if (mode !== 'translate') return;
    const dx = Number(el('#transform-dx')?.value || 0);
    const dy = Number(el('#transform-dy')?.value || 0);
    const dz = Number(el('#transform-dz')?.value || 0);
    const snap = !!el('#transform-snap')?.checked;
    try { window.Builder3D?.translateSelection?.(dx, dy, dz, snap); } catch (_) {}
  });
  el('#transform-mode')?.addEventListener('change', () => {
    try { window.Builder3D?.refreshTransformGizmo?.(); } catch(_){}
  });
  el('#transform-snap')?.addEventListener('change', () => {
    try { window.Builder3D?.refreshTransformGizmo?.(); } catch(_){}
  });

  // Tracker controls
  el('#tracker-connect')?.addEventListener('click', () => {
    const id = el('#tracker-id')?.value.trim();
    try { window.Builder3D?.connectTracker?.(id); } catch (_) {}
  });
  el('#tracker-disconnect')?.addEventListener('click', () => {
    try { window.Builder3D?.disconnectTracker?.(); } catch (_) {}
  });
  el('#tracker-baseline')?.addEventListener('click', () => {
    try { window.Builder3D?.setTrackerBaseline?.(); } catch (_) {}
  });
}

// Minimal styles for preview cells
const style = document.createElement('style');
style.textContent = `
.builder-layout { display: grid; gap: 16px; padding: 20px; grid-template-columns: 1fr; }
.panel { background: rgba(16,21,33,0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.log { background: rgba(0,0,0,0.35); padding: 8px; border-radius: 8px; max-height: 240px; overflow: auto; }
.preview { display: grid; gap: 10px; }
.layer { display: grid; gap: 2px; }
.layer-title { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px; }
.cell { width: 22px; height: 22px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; background: rgba(255,255,255,0.03); }
.cell.filled { background: linear-gradient(135deg, rgba(255,155,66,0.8), rgba(64,217,255,0.8)); }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', main);
