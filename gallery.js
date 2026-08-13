const sceneListEl = document.getElementById('scene-list');
const presetGridEl = document.getElementById('preset-grid');
const refreshScenesBtn = document.getElementById('refresh-scenes');
const refreshPresetsBtn = document.getElementById('refresh-presets');

function renderScenes(scenes) {
  sceneListEl.innerHTML = '';
  if (!scenes.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No scenes saved yet.';
    sceneListEl.appendChild(li);
    return;
  }
  scenes.forEach((scene) => {
    const li = document.createElement('li');
    li.className = 'scene-item';
    const tags = scene.triggers?.length || 0;
    li.innerHTML = `
      <strong>${scene.name}</strong>
      <span class="muted">${scene.scene_id}</span>
      <span class="muted">Grid cells: ${(scene.grid || []).length}</span>
      <div>${scene.description || ''}</div>
      <div class="muted">Triggers: ${tags}</div>
    `;
    sceneListEl.appendChild(li);
  });
}

function renderPresets(presets) {
  presetGridEl.innerHTML = '';
  if (!presets.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No presets found.';
    presetGridEl.appendChild(empty);
    return;
  }
  presets.forEach((preset) => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    const swatch = document.createElement('div');
    swatch.className = 'preset-swatch';
    swatch.style.background = preset.base_state?.primary_color || '#00e0ff';
    const title = document.createElement('h3');
    title.textContent = preset.name || preset.preset_id;
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = preset.description || '';
    card.append(swatch, title, desc);
    presetGridEl.appendChild(card);
  });
}

async function loadScenes() {
  sceneListEl.innerHTML = '<li class="muted">Loading scenes…</li>';
  try {
    const resp = await fetch('/api/pubworld/scenes');
    if (!resp.ok) throw new Error('Unable to load scenes');
    const data = await resp.json();
    renderScenes(data.scenes || []);
  } catch (err) {
    sceneListEl.innerHTML = `<li class="muted">${err.message}</li>`;
  }
}

async function loadPresets() {
  presetGridEl.innerHTML = '<div class="muted">Loading presets…</div>';
  try {
    const resp = await fetch('/api/avatars/presets');
    if (!resp.ok) throw new Error('Unable to load presets');
    const data = await resp.json();
    renderPresets(data.presets || []);
  } catch (err) {
    presetGridEl.innerHTML = `<div class="muted">${err.message}</div>`;
  }
}

refreshScenesBtn?.addEventListener('click', loadScenes);
refreshPresetsBtn?.addEventListener('click', loadPresets);

loadScenes();
loadPresets();
