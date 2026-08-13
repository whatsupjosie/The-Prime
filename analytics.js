const modeEl = document.getElementById('metric-mode');
const onAirEl = document.getElementById('metric-onair');
const cameraEl = document.getElementById('metric-camera');
const lightingEl = document.getElementById('metric-lighting');
const providerList = document.getElementById('provider-list');
const roomsSummary = document.getElementById('rooms-summary');
const scenesSummary = document.getElementById('scenes-summary');
const refreshBtn = document.getElementById('refresh-analytics');

function setMetricText(el, value) {
  if (el) el.textContent = value;
}

function renderProviders(providers) {
  providerList.innerHTML = '';
  if (!providers.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No providers registered.';
    providerList.appendChild(li);
    return;
  }
  providers.forEach((entry) => {
    const li = document.createElement('li');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'badge';
    statusBadge.textContent = entry.status || 'pending';
    li.innerHTML = `<span>${entry.provider}</span>`;
    li.appendChild(statusBadge);
    providerList.appendChild(li);
  });
}

function renderRooms(rooms) {
  roomsSummary.innerHTML = '';
  if (!rooms.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No rooms created yet.';
    roomsSummary.appendChild(li);
    return;
  }
  rooms.forEach((room) => {
    const li = document.createElement('li');
    const agents = room.agents ? room.agents.length : 0;
    const humans = room.humans ? room.humans.length : 0;
    li.innerHTML = `<span>${room.room_name}</span><span>${agents} agents · ${humans} humans</span>`;
    roomsSummary.appendChild(li);
  });
}

function renderScenes(scenes) {
  scenesSummary.innerHTML = '';
  if (!scenes.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No scenes saved yet.';
    scenesSummary.appendChild(li);
    return;
  }
  scenes.forEach((scene) => {
    const li = document.createElement('li');
    const cellCount = scene.grid ? scene.grid.length : 0;
    li.innerHTML = `<span>${scene.name}</span><span>${cellCount} blocks</span>`;
    scenesSummary.appendChild(li);
  });
}

async function loadAnalytics() {
  try {
    const [prod, creds, rooms, scenes] = await Promise.all([
      fetch('/api/state/production').then((r) => r.json()),
      fetch('/api/credentials/summary').then((r) => r.json()),
      fetch('/api/rooms').then((r) => r.json()),
      fetch('/api/pubworld/scenes').then((r) => r.json()),
    ]);

    setMetricText(modeEl, prod.mode || '--');
    setMetricText(onAirEl, prod.on_air ? 'Yes' : 'No');
    setMetricText(cameraEl, prod.camera || '--');
    setMetricText(lightingEl, prod.lighting || '--');
    renderProviders(creds.providers || []);
    renderRooms(rooms.rooms || []);
    renderScenes(scenes.scenes || []);
  } catch (err) {
    console.error('Analytics load failed:', err);
  }
}

refreshBtn?.addEventListener('click', loadAnalytics);
loadAnalytics();
