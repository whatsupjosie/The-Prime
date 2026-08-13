/**
 * @file A professional-grade engine for the side-scrolling backstage map.
 * This refactors the original prototype into a more robust, object-oriented
 * structure to serve as a stable foundation for future features.
 */

// --- CORE ENGINE ---

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(this.canvas);
    this.input = new InputManager();
    this.entities = [];
    this.hotspots = [];
    this.trackMarkers = [];
    this.showTracking = true;
    this.lastTime = 0;
    this.isRunning = false;

    this.setupCanvas();
    window.addEventListener('resize', () => this.setupCanvas());
    // Hotspot click handling
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left + this.camera.x;
      const py = e.clientY - rect.top + this.camera.y;
      const spot = this.findHotspot(px, py);
      if (spot && window.__worldPlayer) {
        const action = (spot.actions && spot.actions[0]) || { label: spot.label || 'Use', kind: 'pose' };
        window.__worldPlayer.useAction(action);
      }
    });
  }

  setupCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  addEntity(entity) {
    entity.engine = this;
    this.entities.push(entity);
  }

  addHotspot(spot) {
    this.hotspots.push(spot);
  }

  clearHotspots() {
    this.hotspots.length = 0;
  }

  // Update hotspots that are bound to a given track id
  updateHotspotsForTrack(trackId, newX) {
    if (!trackId) return;
    for (const s of this.hotspots) {
      if (s && s.bind_track_id === trackId) {
        s.x = newX;
      }
    }
  }

  setTrackMarkers(markers) {
    this.trackMarkers = Array.isArray(markers) ? markers : [];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  stop() {
    this.isRunning = false;
  }

  loop(currentTime) {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000; // seconds
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame((time) => this.loop(time));
  }

  update(deltaTime) {
    for (const entity of this.entities) {
      if (entity.update) {
        entity.update(deltaTime);
      }
    }
    this.camera.update(deltaTime);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera transformations
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // Sort entities by depth (y-position) for 2.5D effect
    this.entities.sort((a, b) => a.y - b.y);

    for (const entity of this.entities) {
      if (entity.draw) {
        entity.draw(this.ctx);
      }
    }

    // Draw hotspots
    for (const s of this.hotspots) {
      const y = [220, 300, 380][Math.max(0, Math.min(2, s.lane || 1))];
      const x = s.x;
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255, 230, 80, 0.9)';
      this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      this.ctx.beginPath();
      this.ctx.arc(x, y - 18, 8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      if (s.label) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.font = '11px "Segoe UI", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(String(s.label).toUpperCase(), x, y - 34);
      }
      this.ctx.restore();
    }

    // Draw tracking markers (confidence-colored)
    if (this.showTracking) for (const s of this.trackMarkers) {
      const y = [220, 300, 380][Math.max(0, Math.min(2, s.lane || 1))];
      const x = s.x;
      const conf = Math.max(0, Math.min(1, s.conf || 0));
      const col = `rgba(${Math.round(255*(1-conf))}, ${Math.round(180*conf)}, 80, 0.95)`;
      this.ctx.save();
      this.ctx.fillStyle = col;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      this.ctx.beginPath();
      this.ctx.arc(x, y - 18, 7, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  findHotspot(px, py) {
    for (const s of this.hotspots) {
      const y = [220, 300, 380][Math.max(0, Math.min(2, s.lane || 1))];
      const x = s.x;
      const dx = px - x;
      const dy = py - (y - 18);
      if (dx * dx + dy * dy <= 12 * 12) return s;
    }
    return null;
  }
}

// --- CAMERA & INPUT ---

class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.target = null;
    this.lerpFactor = 0.08; // Smoothness of camera follow
  }

  follow(target) {
    this.target = target;
  }

  update(deltaTime) {
    if (!this.target) return;

    // Smoothly follow the target on the x-axis
    const targetX = this.target.x - this.canvas.width / 2;
    this.x += (targetX - this.x) * this.lerpFactor;

    // Clamp camera to world bounds (if any)
    // For now, we'll let it follow freely.
  }
}

class InputManager {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  isDown(key) {
    return this.keys.has(key);
  }
}

// --- ENTITIES ---

class Entity {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.engine = null;
  }
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.speed = 200; // pixels per second
    this.radius = 22;
    this.color = '#4dffc6';
    this.lane = 1;
    this.lanes = [220, 300, 380];
    this.y = this.lanes[this.lane];
    this.poseLabel = '';
    this.poseTimer = 0;
  }

  update(deltaTime) {
    const input = this.engine.input;
    let dx = 0;

    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) {
      dx -= 1;
    }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) {
      dx += 1;
    }

    this.x += dx * this.speed * deltaTime;

    // Lane switching (handle this with a cooldown to prevent rapid switching)
    // For now, we'll keep it simple
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) {
        this.lane = Math.max(0, this.lane - 1);
        this.y = this.lanes[this.lane];
    }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) {
        this.lane = Math.min(this.lanes.length - 1, this.lane + 1);
        this.y = this.lanes[this.lane];
    }

    // Clamp to world bounds
    this.x = Math.max(this.radius, Math.min(this.engine.canvas.width - this.radius, this.x));

    // Pose status decay
    if (this.poseTimer > 0) {
      this.poseTimer -= deltaTime;
      if (this.poseTimer <= 0) {
        this.poseTimer = 0;
        this.poseLabel = '';
      }
    }
  }

  draw(ctx) {
    const laneY = this.y;
    const glowGradient = ctx.createRadialGradient(this.x, laneY - 16, 10, this.x, laneY - 16, 60);
    glowGradient.addColorStop(0, 'rgba(77, 255, 198, 0.6)');
    glowGradient.addColorStop(1, 'rgba(77, 255, 198, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(this.x, laneY - 16, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#0a111b';
    ctx.arc(this.x, laneY - 16, this.radius + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(this.x, laneY - 16, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0a111b';
    ctx.beginPath();
    ctx.arc(this.x - 8, laneY - 22, 4, 0, Math.PI * 2);
    ctx.arc(this.x + 8, laneY - 22, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#0a111b';
    ctx.lineWidth = 3;
    ctx.arc(this.x, laneY - 10, 10, 0, Math.PI);
    ctx.stroke();

    // Pose label overlay
    if (this.poseLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.poseLabel, this.x, laneY - 56);
    }
  }

  useAction(action) {
    // Snap to center to simulate aligning with an anchor
    const canvas = this.engine.canvas;
    this.x = canvas.width / 2;
    // Choose lane by action kind for simple demo
    if (action?.kind === 'lie') this.lane = 0;
    else if (action?.kind === 'sit') this.lane = 1;
    else this.lane = 2;
    this.y = this.lanes[this.lane];
    this.poseLabel = `Using: ${action?.label || 'Action'}`;
    this.poseTimer = 3.0;
  }
}

class Door extends Entity {
    constructor(config) {
        const laneY = [220, 300, 380][config.lane];
        super(config.x, laneY);
        this.config = config;
    }

    draw(ctx) {
        const { name, x, color, target, description } = this.config;
        const laneY = this.y;

        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 4;
        const width = 70;
        const height = 120;
        
        // Custom rounded rectangle drawing logic
        this.drawRoundedRect(ctx, x - width / 2, laneY - height, width, height, 12);
        
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name.toUpperCase(), x, laneY - height - 10);
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}


// --- DATA & UI HELPERS ---

const statusEls = {
  mode: document.getElementById('status-mode'),
  onair: document.getElementById('status-onair'),
  camera: document.getElementById('status-camera'),
  lighting: document.getElementById('status-lighting'),
};
const roomsOverviewEl = document.getElementById('rooms-overview');
const refreshRoomsBtn = document.getElementById('refresh-rooms');

async function loadProductionStatus() {
  try {
    const resp = await fetch('/api/state/production');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    applyProductionStatus(payload);
  } catch (err) {
    console.warn('Failed to load production status', err);
    applyProductionStatus(null);
  }
}

function applyProductionStatus(prod) {
  const mode = prod?.mode ?? '--';
  const onAir = prod?.on_air ? 'Yes' : 'No';
  const camera = prod?.camera ?? '--';
  const lighting = prod?.lighting ?? '--';
  if (statusEls.mode) statusEls.mode.textContent = mode;
  if (statusEls.onair) statusEls.onair.textContent = onAir;
  if (statusEls.camera) statusEls.camera.textContent = camera;
  if (statusEls.lighting) statusEls.lighting.textContent = lighting;
}

async function loadRoomsOverview() {
  if (!roomsOverviewEl) return;
  try {
    const resp = await fetch('/api/rooms');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    renderRoomsOverview(payload.rooms || []);
  } catch (err) {
    console.warn('Failed to load rooms', err);
    renderRoomsOverview(null, err);
  }
}

function renderRoomsOverview(rooms, error) {
  roomsOverviewEl.innerHTML = '';
  if (error) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `Error loading rooms: ${error.message || error}`;
    roomsOverviewEl.appendChild(li);
    return;
  }
  if (!rooms || rooms.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No orchestrator rooms yet.';
    roomsOverviewEl.appendChild(li);
    return;
  }
  rooms.forEach((room) => {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = room.room_name || room.room_id;
    const meta = document.createElement('span');
    meta.className = 'room-meta';
    const agentCount = room.agents ? room.agents.length : 0;
    const humanCount = room.humans ? room.humans.length : 0;
    meta.textContent = `${agentCount} agents â€¢ ${humanCount} humans`;
    li.appendChild(title);
    li.appendChild(meta);
    roomsOverviewEl.appendChild(li);
  });
}

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panes = Array.from(document.querySelectorAll('.tab-panel'));
  const transportForm = document.getElementById('transport-form');
  const refreshInteractablesBtn = document.getElementById('refresh-interactables');
  const allowAdultToggle = document.getElementById('allow-adult');

  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((btn) => btn.classList.remove('active'));
      panes.forEach((pane) => pane.classList.remove('active'));
      tab.classList.add('active');
      const paneId = tab.getAttribute('data-tab');
      const pane = document.querySelector(`.tab-panel[data-pane="${paneId}"]`);
      if (pane) pane.classList.add('active');
    });
  });

  transportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const dest = document.getElementById('transport-destination').value;
    const mode = transportForm.querySelector('input[name="travel-mode"]:checked').value;
    console.log(`Transport requested to ${dest} via ${mode}`);
    if (dest) {
      window.location.href = dest;
    }
  });

  if (refreshRoomsBtn) {
    refreshRoomsBtn.addEventListener('click', () => loadRoomsOverview());
  }

  if (refreshInteractablesBtn) {
    refreshInteractablesBtn.addEventListener('click', () => loadInteractables());
  }
  if (allowAdultToggle) {
    allowAdultToggle.addEventListener('change', () => loadInteractables());
  }
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('backstage-canvas');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  const engine = new Engine(canvas);
  const player = new Player(canvas.width / 2, 300);
  engine.addEntity(player);
  engine.camera.follow(player);
  // Expose for interactable actions
  window.__worldEngine = engine;
  window.__worldPlayer = player;

  const doorConfigs = [
    { name: 'Dressing Room', x: 80, lane: 1, color: '#ffd84d', target: '/dressing-room', description: 'Return to private prep space.' },
    { name: 'Conference Room', x: 480, lane: 0, color: '#90b5ff', target: '#', description: 'Collaborate with the crew.' },
    { name: 'Studio Door', x: 880, lane: 0, color: '#ff4fe2', target: '#', description: 'Live stage entrance.' },
    { name: 'Control Room', x: 1080, lane: 2, color: '#4d6cff', target: '/admin', description: 'Directors and producers hub.' },
    { name: 'Pub Entrance', x: 640, lane: 2, color: '#ff8a5a', target: '/bar', description: 'Unwind in the social hub.' },
  ];
  doorConfigs.forEach((config) => engine.addEntity(new Door(config)));

  engine.start();
  setupSidebar();
  loadProductionStatus();
  loadRoomsOverview();
  loadInteractables();
  loadTracking();
  setInterval(loadProductionStatus, 15000);
  setInterval(loadRoomsOverview, 20000);
  // Keep a light fallback poll; WS will deliver real-time updates
  setInterval(loadTracking, 10000);
  connectTrackingWS();
  const toggle = document.getElementById('show-tracking');
  if (toggle) {
    toggle.addEventListener('change', () => {
      if (window.__worldEngine) window.__worldEngine.showTracking = !!toggle.checked;
    });
  }
});

// --- Interactables ---

const interactablesListEl = document.getElementById('interactables-list');
const allowAdultToggle = document.getElementById('allow-adult');

async function loadInteractables() {
  if (!interactablesListEl) return;
  interactablesListEl.innerHTML = '<li class="muted">Loading interactables...</li>';
  try {
    const headers = {};
    if (allowAdultToggle?.checked) headers['x-allow-adult'] = '1';
    const scenesResp = await fetch('/api/pubworld/scenes');
    if (!scenesResp.ok) throw new Error(`HTTP ${scenesResp.status}`);
    const scenes = await scenesResp.json();
    const list = scenes.scenes || [];
    if (!list.length) {
      interactablesListEl.innerHTML = '<li class="muted">No scenes available.</li>';
      return;
    }
    const sceneId = list[0].scene_id;
    const resp = await fetch(`/api/pubworld/scenes/${sceneId}/interactables`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    if (window.__worldEngine) {
      window.__worldEngine.clearHotspots();
      for (const it of (payload.items || [])) {
        window.__worldEngine.addHotspot({
          placement_id: it.placement_id,
          item_id: it.item_id,
          x: it.x,
          lane: it.lane,
          label: it.label,
          actions: it.actions || [],
          bind_track_id: it.bind_track_id || null,
        });
      }
    }
    renderInteractables(payload.items || []);
  } catch (err) {
    console.warn('Failed to load interactables', err);
    interactablesListEl.innerHTML = `<li class="muted">Error: ${err.message || err}</li>`;
  }
}

function renderInteractables(items) {
  interactablesListEl.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No interactables available.';
    interactablesListEl.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.innerHTML = `<strong>${item.label}</strong><span class="room-meta">${item.description || ''}</span>`;
    const actionsWrap = document.createElement('div');
    actionsWrap.style.display = 'flex';
    actionsWrap.style.gap = '6px';
    (item.actions || []).forEach((action) => {
      const btn = document.createElement('button');
      btn.className = 'ghost-btn';
      btn.textContent = action.label || action.kind || 'Use';
      btn.addEventListener('click', () => {
        const canvas = document.getElementById('backstage-canvas');
        // Find the engine/player from a stored reference
        // For simplicity in this prototype, walk globals
        // We attached player via closure in init; expose on window
        if (window.__worldPlayer) {
          window.__worldPlayer.useAction(action);
        }
      });
      actionsWrap.appendChild(btn);
    });
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.appendChild(info);
    row.appendChild(actionsWrap);
    li.appendChild(row);
    interactablesListEl.appendChild(li);
  });
}

// --- Tracking overlay (simple mapping to canvas) ---

async function loadTracking() {
  // Fetch tracks and map to canvas coordinates (prototype scale)
  try {
    const resp = await fetch('/api/tracking/tracks');
    if (!resp.ok) return;
    const payload = await resp.json();
    const rows = payload.tracks || [];
    applyTrackRows(rows);
  } catch (err) {
    // ignore
  }
}

// Apply track rows to engine markers and any bound hotspots
function applyTrackRows(rows) {
  const markers = rows.map((t) => {
    const pos = t.last_pose?.position || [0,0,0];
    const x = Math.max(40, Math.min(window.innerWidth - 40, Math.round(pos[0] * 100)));
    const lane = t.kind === 'furniture' ? 0 : (t.state === 'bound' ? 1 : 2);
    const conf = t.last_pose?.confidence || 0;
    return { track_id: t.track_id, x, lane, conf };
  });
  if (window.__worldEngine) {
    window.__worldEngine.setTrackMarkers(markers.map(m => ({ x: m.x, lane: m.lane, conf: m.conf })));
    // Update bound hotspots
    markers.forEach(m => window.__worldEngine.updateHotspotsForTrack(m.track_id, m.x));
  }
}

// Real-time tracking updates via Hub WebSocket (room=green by default)
function connectTrackingWS() {
  const params = new URLSearchParams(location.search);
  const chosen = params.get('room');
  const chooseRoom = async () => {
    if (chosen && chosen !== 'auto') return chosen;
    try {
      const resp = await fetch('/api/presence/state');
      if (resp.ok) {
        const body = await resp.json();
        const rooms = (body.rooms || []).filter(r => (r.count || 0) > 0);
        if (rooms.length) return rooms[0].room || 'green';
      }
    } catch {}
    return 'green';
  };
  chooseRoom().then((room) => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/${encodeURIComponent(room)}`;
    try {
      const ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const t = msg?.type || '';
          if (t === 'tracking.update' || t === 'tracking.bound' || t === 'tracking.lost') {
            const payload = msg.payload || {};
            applyTrackRows([payload]);
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connectTrackingWS, 1500);
      ws.onerror = () => { try { ws.close(); } catch {} };
    } catch {
      setTimeout(connectTrackingWS, 2000);
    }
  });
}



