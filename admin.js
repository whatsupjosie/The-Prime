const agentListEl = document.getElementById('agents-list');
const agentCheckboxesEl = document.getElementById('agent-checkboxes');
const roomsListEl = document.getElementById('rooms-list');
const credentialStatusEl = document.getElementById('credential-status');
const inferenceSummaryEl = document.getElementById('inference-summary');
const sceneSummaryEl = document.getElementById('scene-summary');
const refreshButton = document.getElementById('refresh-button');
const createRoomForm = document.getElementById('create-room-form');
const roomNameInput = document.getElementById('room-name');
const createRoomStatus = document.getElementById('create-room-status');
const diagnosticForm = document.getElementById('diagnostic-form');
const diagnosticRoomInput = document.getElementById('diagnostic-room');
const eventLogEl = document.getElementById('event-log');
const wsStatusEl = document.getElementById('ws-status');
const disconnectButton = document.getElementById('disconnect-ws');
// Gemini quick-add controls
const geminiForm = document.getElementById('gemini-bot-form');
const geminiEnvInput = document.getElementById('gemini-env');
const geminiBotIdInput = document.getElementById('gemini-bot-id');
const geminiNameInput = document.getElementById('gemini-name');
const geminiModelInput = document.getElementById('gemini-model');
const geminiRoomsInput = document.getElementById('gemini-rooms');
const geminiAutoInput = document.getElementById('gemini-auto');
const geminiMentionOnlyInput = document.getElementById('gemini-mention-only');
const adminKeyInput = document.getElementById('admin-key');
const geminiStatus = document.getElementById('gemini-status');
// OpenAI (ChatGPT) quick-add controls
const openaiForm = document.getElementById('openai-bot-form');
const openaiEnvInput = document.getElementById('openai-env');
const openaiBotIdInput = document.getElementById('openai-bot-id');
const openaiNameInput = document.getElementById('openai-name');
const openaiModelInput = document.getElementById('openai-model');
const openaiRoomsInput = document.getElementById('openai-rooms');
const openaiAutoInput = document.getElementById('openai-auto');
const openaiMentionOnlyInput = document.getElementById('openai-mention-only');
const openaiStatus = document.getElementById('openai-status');
// Qwen quick-add controls
const qwenForm = document.getElementById('qwen-bot-form');
const qwenEnvInput = document.getElementById('qwen-env');
const qwenBotIdInput = document.getElementById('qwen-bot-id');
const qwenNameInput = document.getElementById('qwen-name');
const qwenModelInput = document.getElementById('qwen-model');
const qwenRoomsInput = document.getElementById('qwen-rooms');
const qwenAutoInput = document.getElementById('qwen-auto');
const qwenMentionOnlyInput = document.getElementById('qwen-mention-only');
const qwenStatus = document.getElementById('qwen-status');
// Bots list
const botsListEl = document.getElementById('bots-list');
// Tracking controls
const tplForm = document.getElementById('tracking-template-form');
const tplIdInput = document.getElementById('tpl-id');
const tplLabelInput = document.getElementById('tpl-label');
const tplStatus = document.getElementById('tpl-status');
const tplListEl = document.getElementById('tpl-list');
const trkListEl = document.getElementById('trk-list');
const trkAssignDemoBtn = document.getElementById('trk-assign-demo');
const trkSimTickBtn = document.getElementById('trk-sim-tick');
// Template editor elements
const tplEditSelect = document.getElementById('tpl-edit-select');
const tplMarkersEl = document.getElementById('tpl-markers');
const tplAttachEl = document.getElementById('tpl-attach');
const tplAddMarkerBtn = document.getElementById('tpl-add-marker');
const tplAddAttachBtn = document.getElementById('tpl-add-attach');
const tplSaveFullBtn = document.getElementById('tpl-save-full');
const tplSaveStatus = document.getElementById('tpl-save-status');
const tplPrintBtn = document.getElementById('tpl-print-tags');
const tplPrintSize = document.getElementById('tpl-print-size');
const detInput = document.getElementById('det-input');
const detSendBtn = document.getElementById('det-send');
const detStatus = document.getElementById('det-status');
// Binding controls
const bindSceneSel = document.getElementById('bind-scene');
const bindPlacementSel = document.getElementById('bind-placement');
const bindTrackSel = document.getElementById('bind-track');
const bindApplyBtn = document.getElementById('bind-apply');
const bindClearBtn = document.getElementById('bind-clear');
const bindStatus = document.getElementById('bind-status');

let agents = [];
let rooms = [];
let credentials = [];
let bots = [];
let templates = [];
let tracks = [];
let scenes = [];
const placementsByScene = new Map(); // scene_id -> items
let ws;

function setWsStatus(status, online = false) {
  wsStatusEl.textContent = 'WS: ' + status;
  wsStatusEl.classList.toggle('online', online);
}

function appendEvent(message, payload) {
  const time = new Date().toLocaleTimeString();
  let formatted = time + ' | ' + message + '\n';
  if (payload) {
    try {
      formatted += JSON.stringify(payload, null, 2) + '\n';
    } catch (err) {
      formatted += String(payload) + '\n';
    }
  }
  eventLogEl.textContent += formatted;
  eventLogEl.scrollTop = eventLogEl.scrollHeight;
}

async function fetchJSON(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    let detail = {};
    try {
      detail = await resp.json();
    } catch (err) {
      detail = {};
    }
    throw new Error(detail.detail || detail.error || String(resp.status));
  }
  return resp.json();
}

async function postJSON(url, body, { adminKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    let detail = {};
    try { detail = await resp.json(); } catch {}
    throw new Error(detail.detail || detail.error || String(resp.status));
  }
  return resp.json();
}

function renderAgents() {
  if (!agents.length) {
    agentListEl.textContent = 'No agents registered.';
    agentCheckboxesEl.innerHTML = '<p class="status-line">No agents available.</p>';
    return;
  }

  agentListEl.innerHTML = '';
  agentCheckboxesEl.innerHTML = '';

  agents.forEach((agent) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = '<strong>' + agent.display_name + '</strong>' +
      '<small>ID: ' + agent.agent_id + '</small>' +
      '<small>Provider: ' + agent.provider + ' | Model: ' + agent.model + '</small>' +
      '<small>Priority: ' + agent.priority + ' | Cooldown: ' + agent.cooldown_ms + 'ms</small>';
    agentListEl.append(item);

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = agent.agent_id;
    label.append(checkbox, document.createTextNode(agent.display_name));
    agentCheckboxesEl.append(label);
  });
}

function renderRooms() {
  if (!rooms.length) {
    roomsListEl.textContent = 'No rooms created yet.';
    return;
  }
  roomsListEl.innerHTML = '';
  rooms.forEach((room) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const agentsSummary = room.agents && room.agents.length ? room.agents.join(', ') : 'none';
    const createdAt = room.created_at ? new Date(room.created_at * 1000).toLocaleString() : 'unknown';
    item.innerHTML = '<strong>' + room.room_name + '</strong>' +
      '<small>ID: ' + room.room_id + '</small>' +
      '<small>Agents: ' + agentsSummary + '</small>' +
      '<small>Created: ' + createdAt + '</small>';
    roomsListEl.append(item);
  });
}

function renderCredentialStatus() {
  if (!credentialStatusEl) return;
  credentialStatusEl.innerHTML = '';
  if (!credentials.length) {
    credentialStatusEl.textContent = 'No providers registered yet.';
    return;
  }
  credentials.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const status = entry.status || 'pending';
    const verified = entry.last_verified ? new Date(entry.last_verified * 1000).toLocaleString() : 'â€”';
    item.innerHTML = '<strong>' + entry.provider + '</strong>' +
      '<small>Status: ' + status + '</small>' +
      '<small>Configured: ' + (entry.configured ? 'Yes' : 'No') + '</small>' +
      '<small>Last verified: ' + verified + '</small>';
    credentialStatusEl.append(item);
  });
}

function renderInferenceSummary(payload) {
  if (!inferenceSummaryEl) return;
  const status = (payload && payload.status) || {};
  const stats = status.stats || {};
  inferenceSummaryEl.innerHTML = '';
  const statusLine = document.createElement('div');
  statusLine.textContent = 'Worker: ' + (status.worker_alive ? 'Online' : 'Offline');
  statusLine.className = status.worker_alive ? 'status-ok' : 'status-warn';
  inferenceSummaryEl.append(statusLine);

  const pendingLine = document.createElement('div');
  pendingLine.textContent = 'Pending jobs: ' + (status.pending_jobs ?? 0);
  inferenceSummaryEl.append(pendingLine);

  const totalsLine = document.createElement('div');
  totalsLine.textContent = 'Completed: ' + (stats.jobs_completed ?? 0) + ' Â· Failed: ' + (stats.jobs_failed ?? 0);
  inferenceSummaryEl.append(totalsLine);

  if (stats.last_error) {
    const errLine = document.createElement('div');
    errLine.textContent = 'Last error: ' + stats.last_error;
    errLine.className = 'status-error';
    inferenceSummaryEl.append(errLine);
  }
}

async function renderSceneSummary(payload) {
  if (!sceneSummaryEl) return;
  const scenes = (payload && payload.scenes) || [];
  if (!scenes.length) {
    sceneSummaryEl.textContent = 'No scenes configured.';
    return;
  }
  sceneSummaryEl.innerHTML = '';
  const sample = scenes.slice(0, 5);
  const plans = await Promise.all(
    sample.map(async (scene) => {
      try {
        return await fetchJSON('/api/pubworld/scenes/' + scene.scene_id + '/performance');
      } catch (err) {
        return { error: err.message };
      }
    })
  );
  sample.forEach((scene, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'scene-entry';
    const name = document.createElement('strong');
    name.textContent = scene.name || scene.scene_id;
    const updated = document.createElement('small');
    const updatedAt = scene.updated_at ? new Date(scene.updated_at * 1000) : new Date();
    updated.textContent = 'Updated: ' + updatedAt.toLocaleString();
    const planInfo = document.createElement('small');
    const planPayload = plans[index];
    if (planPayload && planPayload.plan) {
      const visemes = planPayload.plan.viseme_track ? planPayload.plan.viseme_track.length : 0;
      const anims = planPayload.plan.animation_track ? planPayload.plan.animation_track.length : 0;
      planInfo.textContent = `Plan ${planPayload.plan.avatar_pack} Â· ${visemes} visemes Â· ${anims} animations`;
    } else {
      planInfo.textContent = 'Plan unavailable';
      planInfo.classList.add('status-warn');
    }
    wrapper.append(name, updated, planInfo);
    // Sanitize any odd separators caused by encoding issues
    try {
      [updated, planInfo].forEach((el) => {
        el.textContent = (el.textContent || '').replace(/[^\x20-\x7E]+/g, ' | ');
      });
    } catch (e) {}
    sceneSummaryEl.append(wrapper);
  });
  if (scenes.length > sample.length) {
    const more = document.createElement('small');
    more.className = 'muted';
    more.textContent = `+ ${scenes.length - sample.length} more scenes`;
    sceneSummaryEl.append(more);
  }
}

async function loadData() {
  try {
    const [agentsResp, roomsResp, credsResp, inferenceResp, scenesResp, botsResp, tplsResp, trksResp] = await Promise.all([
      fetchJSON('/api/agents'),
      fetchJSON('/api/rooms'),
      fetchJSON('/api/credentials/summary'),
      fetchJSON('/api/inference/status'),
      fetchJSON('/api/pubworld/scenes'),
      fetchJSON('/api/bots'),
      fetchJSON('/api/tracking/templates'),
      fetchJSON('/api/tracking/tracks'),
    ]);
    agents = agentsResp.agents || [];
    rooms = (roomsResp.rooms || []).map((room) => ({
      ...room,
      created_at: room.created_at || Date.now() / 1000,
    }));
    credentials = credsResp.providers || [];
    bots = (botsResp && botsResp.bots) || [];
    scenes = (scenesResp && scenesResp.scenes) || [];
    templates = (tplsResp && tplsResp.templates) || [];
    tracks = (trksResp && trksResp.tracks) || [];
    renderAgents();
    renderRooms();
    renderCredentialStatus();
    renderInferenceSummary(inferenceResp);
    await renderSceneSummary(scenesResp);
    renderBots();
    renderTemplates();
    renderTemplateEditor();
    renderTracks();
    updateBindingOptions();
    createRoomStatus.textContent = '';
  } catch (err) {
    console.error(err);
    createRoomStatus.textContent = 'Error loading data: ' + err.message;
    if (credentialStatusEl) {
      credentialStatusEl.textContent = 'Error loading credentials: ' + err.message;
    }
    if (inferenceSummaryEl) {
      inferenceSummaryEl.textContent = 'Error loading inference status: ' + err.message;
    }
    if (sceneSummaryEl) {
      sceneSummaryEl.textContent = 'Error loading scenes: ' + err.message;
    }
  }
}

function renderTemplates() {
  if (!tplListEl) return;
  tplListEl.innerHTML = '';
  if (!templates.length) {
    tplListEl.textContent = 'No templates.';
    return;
  }
  templates.forEach((tpl) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = '<strong>' + tpl.template_id + '</strong>' +
      '<small>Label: ' + (tpl.label || '') + '</small>' +
      '<small>Markers: ' + Object.keys(tpl.marker_set || {}).length + '</small>' +
      '<small>Mesh: ' + (tpl.mesh_id || '-') + '</small>';
    tplListEl.append(item);
  });
}

function renderTemplateEditor() {
  if (!tplEditSelect) return;
  tplEditSelect.innerHTML = '';
  if (!templates.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No templates';
    tplEditSelect.appendChild(opt);
    return;
  }
  const choose = document.createElement('option');
  choose.value = '';
  choose.textContent = 'Select a template';
  tplEditSelect.appendChild(choose);
  templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.template_id;
    opt.textContent = `${t.template_id} — ${t.label || ''}`;
    tplEditSelect.appendChild(opt);
  });
}

function _row(fields) {
  const wrap = document.createElement('div');
  wrap.className = 'list-item';
  fields.forEach(f => wrap.appendChild(f));
  return wrap;
}

function _mkInput(value, placeholder, width='80px') {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.placeholder = placeholder || '';
  input.style.width = width;
  return input;
}

function _renderMarkerRows(tpl) {
  tplMarkersEl.innerHTML = '';
  const markers = tpl.marker_set || {};
  const ids = Object.keys(markers);
  if (!ids.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No markers defined.';
    tplMarkersEl.appendChild(empty);
    return;
  }
  ids.forEach(id => {
    const pos = markers[id] || [0,0,0];
    const idInput = _mkInput(id, 'id', '90px');
    const x = _mkInput(String(pos[0] ?? 0), 'x');
    const y = _mkInput(String(pos[1] ?? 0), 'y');
    const z = _mkInput(String(pos[2] ?? 0), 'z');
    const del = document.createElement('button'); del.className = 'ghost danger'; del.textContent = 'Delete';
    del.addEventListener('click', () => { delete markers[id]; _renderMarkerRows(tpl); });
    const row = _row([idInput, x, y, z, del]);
    row.dataset.kind = 'marker';
    row.dataset.id = id;
    row._get = () => ({ id: idInput.value.trim(), pos: [Number(x.value||0), Number(y.value||0), Number(z.value||0)] });
    tplMarkersEl.appendChild(row);
  });
}

function _renderAttachRows(tpl) {
  tplAttachEl.innerHTML = '';
  const points = tpl.attach_points || {};
  const names = Object.keys(points);
  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No attach points.';
    tplAttachEl.appendChild(empty);
    return;
  }
  names.forEach(name => {
    const p = points[name] || [0,0,0];
    const nameInput = _mkInput(name, 'name', '120px');
    const x = _mkInput(String(p[0] ?? 0), 'x');
    const y = _mkInput(String(p[1] ?? 0), 'y');
    const z = _mkInput(String(p[2] ?? 0), 'z');
    const del = document.createElement('button'); del.className = 'ghost danger'; del.textContent = 'Delete';
    del.addEventListener('click', () => { delete points[name]; _renderAttachRows(tpl); });
    const row = _row([nameInput, x, y, z, del]);
    row.dataset.kind = 'attach';
    row.dataset.name = name;
    row._get = () => ({ name: nameInput.value.trim(), pos: [Number(x.value||0), Number(y.value||0), Number(z.value||0)] });
    tplAttachEl.appendChild(row);
  });
}

tplEditSelect?.addEventListener('change', () => {
  tplSaveStatus.textContent = '';
  const tid = tplEditSelect.value;
  const tpl = templates.find(t => t.template_id === tid);
  if (!tpl) { tplMarkersEl.innerHTML=''; tplAttachEl.innerHTML=''; return; }
  _renderMarkerRows(tpl);
  _renderAttachRows(tpl);
});

tplAddMarkerBtn?.addEventListener('click', () => {
  const tid = tplEditSelect?.value; if (!tid) return;
  const tpl = templates.find(t => t.template_id === tid); if (!tpl) return;
  tpl.marker_set = tpl.marker_set || {};
  let i=0; let id;
  do { id = `m${++i}`; } while (Object.prototype.hasOwnProperty.call(tpl.marker_set, id));
  tpl.marker_set[id] = [0,0,0];
  _renderMarkerRows(tpl);
});

tplAddAttachBtn?.addEventListener('click', () => {
  const tid = tplEditSelect?.value; if (!tid) return;
  const tpl = templates.find(t => t.template_id === tid); if (!tpl) return;
  tpl.attach_points = tpl.attach_points || {};
  let i=0; let name;
  do { name = `ap_${++i}`; } while (Object.prototype.hasOwnProperty.call(tpl.attach_points, name));
  tpl.attach_points[name] = [0,0,0];
  _renderAttachRows(tpl);
});

tplSaveFullBtn?.addEventListener('click', async () => {
  const tid = tplEditSelect?.value; if (!tid) { tplSaveStatus.textContent='Select a template'; return; }
  const tpl = templates.find(t => t.template_id === tid); if (!tpl) return;
  // Read back from DOM rows
  const markers = {};
  tplMarkersEl.querySelectorAll('.list-item').forEach((row) => {
    const getter = row._get; if (!getter) return;
    const { id, pos } = getter(); if (id) markers[id] = pos;
  });
  const attach = {};
  tplAttachEl.querySelectorAll('.list-item').forEach((row) => {
    const getter = row._get; if (!getter) return;
    const { name, pos } = getter(); if (name) attach[name] = pos;
  });
  try {
    await postJSON('/api/tracking/templates', {
      template_id: tpl.template_id,
      label: tpl.label,
      marker_set: markers,
      attach_points: attach,
    }, { adminKey: adminKeyInput?.value });
    tplSaveStatus.textContent = 'Saved.';
    await loadData();
    // Reselect
    tplEditSelect.value = tid; tplEditSelect.dispatchEvent(new Event('change'));
  } catch (e) {
    tplSaveStatus.textContent = 'Error: ' + (e?.message||e);
  }
});

tplPrintBtn?.addEventListener('click', () => {
  const tid = tplEditSelect?.value; if (!tid) return;
  const tpl = templates.find(t => t.template_id === tid); if (!tpl) return;
  const ids = Object.keys(tpl.marker_set||{});
  const mm = Number(tplPrintSize?.value || 50) || 50;
  const url = `/tracking/print-tags?ids=${encodeURIComponent(ids.join(','))}&size_mm=${encodeURIComponent(mm)}`;
  window.open(url, '_blank');
});

function renderTracks() {
  if (!trkListEl) return;
  trkListEl.innerHTML = '';
  if (!tracks.length) {
    trkListEl.textContent = 'No tracks.';
    return;
  }
  tracks.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const conf = Math.round((t.last_pose?.confidence || 0) * 100);
    const lastSeen = t.last_pose?.last_seen_ms ? new Date(t.last_pose.last_seen_ms).toLocaleTimeString() : 'â€”';
    const info = document.createElement('div');
    info.innerHTML = '<strong>' + (t.label || t.track_id) + '</strong>' +
      '<small>ID: ' + t.track_id + '</small>' +
      '<small>State: ' + t.state + ' | Confidence: ' + conf + '%</small>' +
      '<small>Last seen: ' + lastSeen + '</small>';
    const del = document.createElement('button');
    del.className = 'ghost danger';
    del.textContent = 'Unassign';
    del.addEventListener('click', async () => {
      try {
        await postJSON('/api/tracking/unassign', { track_id: t.track_id }, { adminKey: adminKeyInput?.value });
        await loadData();
      } catch (err) {
        alert('Failed to unassign: ' + (err?.message || String(err)));
      }
    });
    const row = document.createElement('div');
    row.className = 'flex-row';
    row.append(info, del);
    item.append(row);
    trkListEl.append(item);
  });
}

function renderBots() {
  if (!botsListEl) return;
  if (!bots.length) {
    botsListEl.textContent = 'No bots registered.';
    return;
  }
  botsListEl.innerHTML = '';
  bots.forEach((bot) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const info = document.createElement('div');
    info.innerHTML = '<strong>' + bot.bot_id + '</strong>' +
      '<small>Name: ' + (bot.display_name || bot.name || bot.bot_id) + '</small>' +
      '<small>Provider: ' + bot.provider + ' | Model: ' + bot.model + '</small>' +
      '<small>Rooms: ' + (bot.rooms || bot.enabled_rooms || []).join(', ') + '</small>';
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'ghost danger';
    del.dataset.botId = bot.bot_id;
    const row = document.createElement('div');
    row.className = 'flex-row';
    row.append(info, del);
    item.append(row);
    botsListEl.append(item);
  });
}

async function createRoom(event) {
  event.preventDefault();
  createRoomStatus.textContent = 'Creating room...';
  try {
    const body = { room_name: roomNameInput.value.trim() || 'untitled-room' };
    const createResp = await fetchJSON('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const createdRoom = createResp.room;
    const selectedAgents = Array.from(
      agentCheckboxesEl.querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    if (selectedAgents.length) {
      await fetchJSON('/api/rooms/' + createdRoom.room_id + '/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_ids: selectedAgents }),
      });
    }

    createRoomStatus.textContent = 'Room ' + createdRoom.room_id + ' ready.';
    roomNameInput.value = '';
    agentCheckboxesEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
    await loadData();
  } catch (err) {
    createRoomStatus.textContent = 'Error: ' + err.message;
  }
}

function connectWebSocket(roomId) {
  if (ws) {
    ws.close();
  }
  setWsStatus('connecting');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws/' + roomId);

  ws.addEventListener('open', () => {
    setWsStatus('connected (' + roomId + ')', true);
    disconnectButton.disabled = false;
    appendEvent('connected', { roomId: roomId });
  });

  ws.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      const src = payload && payload.source ? `[${payload.source}] ` : '';
      appendEvent(src + (payload.type || 'message'), payload);
    } catch (err) {
      appendEvent('message', { raw: event.data });
    }
  });

  ws.addEventListener('close', () => {
    setWsStatus('disconnected');
    disconnectButton.disabled = true;
    appendEvent('disconnected');
  });

  ws.addEventListener('error', (err) => {
    appendEvent('error', { message: err.message || 'unknown error' });
  });
}

function disconnectWebSocket() {
  if (ws) {
    ws.close(1000, 'operator disconnect');
    ws = undefined;
  }
}

refreshButton.addEventListener('click', () => {
  loadData();
});

createRoomForm.addEventListener('submit', createRoom);

diagnosticForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!diagnosticRoomInput.value.trim()) return;
  connectWebSocket(diagnosticRoomInput.value.trim());
});

disconnectButton.addEventListener('click', disconnectWebSocket);

loadData();

// ---------- Gemini quick add ----------
if (geminiForm) {
  geminiForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    geminiStatus.textContent = 'Registering bot...';
    const envVar = (geminiEnvInput?.value || 'PUBCAST_GEMINI_KEY').trim();
    const botId = (geminiBotIdInput?.value || 'gemini').trim();
    const name = (geminiNameInput?.value || 'Gemini').trim();
    const model = (geminiModelInput?.value || 'gemini-1.5-flash').trim();
    const rooms = (geminiRoomsInput?.value || 'green')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const autoReply = !!geminiAutoInput?.checked;
    const mentionOnly = !!geminiMentionOnlyInput?.checked;
    const adminKey = (adminKeyInput?.value || '').trim();

    try {
      await postJSON('/api/bots', {
        bot_id: botId,
        name,
        provider: 'gemini',
        model,
        api_key_env: envVar,
        enabled_rooms: rooms,
        auto_reply: autoReply,
        mention_only: mentionOnly,
        shadow_presence: true,
      }, { adminKey });
      geminiStatus.textContent = `Bot '${botId}' registered.`;
      await loadData();
    } catch (err) {
      geminiStatus.textContent = 'Error: ' + (err?.message || String(err));
    }
  });
}

// ---------- OpenAI quick add ----------
if (openaiForm) {
  openaiForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    openaiStatus.textContent = 'Registering bot...';
    const envVar = (openaiEnvInput?.value || 'PUBCAST_OPENAI_KEY').trim();
    const botId = (openaiBotIdInput?.value || 'chatgpt').trim();
    const name = (openaiNameInput?.value || 'ChatGPT').trim();
    const model = (openaiModelInput?.value || 'gpt-4o-mini').trim();
    const rooms = (openaiRoomsInput?.value || 'green').split(',').map(s => s.trim()).filter(Boolean);
    const autoReply = !!openaiAutoInput?.checked;
    const mentionOnly = !!openaiMentionOnlyInput?.checked;
    const adminKey = (adminKeyInput?.value || '').trim();

    try {
      await postJSON('/api/bots', {
        bot_id: botId,
        name,
        provider: 'openai',
        model,
        api_key_env: envVar,
        enabled_rooms: rooms,
        auto_reply: autoReply,
        mention_only: mentionOnly,
        shadow_presence: true,
      }, { adminKey });
      openaiStatus.textContent = `Bot '${botId}' registered.`;
      await loadData();
    } catch (err) {
      openaiStatus.textContent = 'Error: ' + (err?.message || String(err));
    }
  });
}

// ---------- Qwen quick add ----------
if (qwenForm) {
  qwenForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    qwenStatus.textContent = 'Registering bot...';
    const envVar = (qwenEnvInput?.value || 'QWEN_API_KEY').trim();
    const botId = (qwenBotIdInput?.value || 'qwen').trim();
    const name = (qwenNameInput?.value || 'Qwen').trim();
    const model = (qwenModelInput?.value || 'qwen2.5-7b-instruct').trim();
    const rooms = (qwenRoomsInput?.value || 'green').split(',').map(s => s.trim()).filter(Boolean);
    const autoReply = !!qwenAutoInput?.checked;
    const mentionOnly = !!qwenMentionOnlyInput?.checked;
    const adminKey = (adminKeyInput?.value || '').trim();

    try {
      await postJSON('/api/bots', {
        bot_id: botId,
        name,
        provider: 'qwen',
        model,
        api_key_env: envVar,
        enabled_rooms: rooms,
        auto_reply: autoReply,
        mention_only: mentionOnly,
        shadow_presence: true,
      }, { adminKey });
      qwenStatus.textContent = `Bot '${botId}' registered.`;
      await loadData();
    } catch (err) {
      qwenStatus.textContent = 'Error: ' + (err?.message || String(err));
    }
  });
}

// ---------- Delete bot actions ----------
if (botsListEl) {
  botsListEl.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.botId) {
      const botId = target.dataset.botId;
      const adminKey = (adminKeyInput?.value || '').trim();
      try {
        const headers = adminKey ? { 'X-Admin-Key': adminKey } : {};
        const resp = await fetch('/api/bots/' + encodeURIComponent(botId), { method: 'DELETE', headers });
        if (!resp.ok) {
          let detail = {};
          try { detail = await resp.json(); } catch {}
          throw new Error(detail.detail || detail.error || String(resp.status));
        }
        await loadData();
      } catch (err) {
        alert('Failed to delete bot: ' + (err?.message || String(err)));
      }
    }
  });
}

// ---------- Tracking actions ----------
if (tplForm) {
  tplForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    tplStatus.textContent = 'Saving template...';
    try {
      const body = {
        template_id: (tplIdInput?.value || '').trim() || undefined,
        label: (tplLabelInput?.value || '').trim(),
        marker_set: {},
      };
      await postJSON('/api/tracking/templates', body, { adminKey: adminKeyInput?.value });
      tplStatus.textContent = 'Template saved.';
      tplIdInput.value = '';
      tplLabelInput.value = '';
      await loadData();
    } catch (err) {
      tplStatus.textContent = 'Error: ' + (err?.message || String(err));
    }
  });
}

if (trkAssignDemoBtn) {
  trkAssignDemoBtn.addEventListener('click', async () => {
    try {
      // Prefer first template; fallback to generic
      const tplId = (templates[0] && templates[0].template_id) || 'tpl_demo';
      if (!templates.length) {
        await postJSON('/api/tracking/templates', { template_id: tplId, label: 'Demo' }, { adminKey: adminKeyInput?.value });
      }
      await postJSON('/api/tracking/assign', { template_id: tplId, label: 'DemoTrack' }, { adminKey: adminKeyInput?.value });
      await loadData();
    } catch (err) {
      alert('Assign failed: ' + (err?.message || String(err)));
    }
  });
}

if (trkSimTickBtn) {
  trkSimTickBtn.addEventListener('click', async () => {
    try {
      await postJSON('/api/tracking/sim/tick', {}, { adminKey: adminKeyInput?.value });
      await loadData();
    } catch (err) {
      alert('Sim tick failed: ' + (err?.message || String(err)));
    }
  });
}

// Ingest detections (manual paste)
if (detSendBtn) {
  detSendBtn.addEventListener('click', async () => {
    detStatus.textContent = 'Sending detections...';
    try {
      let body = {};
      const raw = (detInput?.value || '').trim();
      if (raw) {
        try { body = JSON.parse(raw); } catch (err) { throw new Error('Invalid JSON'); }
      }
      if (!body || typeof body !== 'object' || !Array.isArray(body.detections)) {
        throw new Error('Expected {"detections": [...]}');
      }
      await postJSON('/api/tracking/ingest/detections', body, { adminKey: adminKeyInput?.value });
      detStatus.textContent = 'Detections sent.';
      await loadData();
    } catch (err) {
      detStatus.textContent = 'Error: ' + (err?.message || String(err));
    }
  });
}

// ---------- Binding UI ----------
function option(el, value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  el.appendChild(opt);
}

function updateBindingOptions() {
  if (!bindSceneSel || !bindTrackSel || !bindPlacementSel) return;
  // Scenes
  bindSceneSel.innerHTML = '';
  if (!scenes.length) {
    option(bindSceneSel, '', 'No scenes');
  } else {
    option(bindSceneSel, '', 'Select scene');
    scenes.forEach((s) => option(bindSceneSel, s.scene_id, `${s.name || s.scene_id}`));
  }
  // Tracks
  bindTrackSel.innerHTML = '';
  if (!tracks.length) {
    option(bindTrackSel, '', 'No tracks');
  } else {
    option(bindTrackSel, '', 'Select track');
    tracks.forEach((t) => option(bindTrackSel, t.track_id, `${t.label || t.track_id} (${t.state})`));
  }
  // Reset placements list until a scene is chosen
  bindPlacementSel.innerHTML = '';
  option(bindPlacementSel, '', 'Select scene first');
}

async function loadPlacementsForScene(sceneId) {
  if (!sceneId) {
    bindPlacementSel.innerHTML = '';
    option(bindPlacementSel, '', 'Select scene first');
    return [];
  }
  if (placementsByScene.has(sceneId)) {
    const cached = placementsByScene.get(sceneId) || [];
    renderPlacementOptions(cached);
    return cached;
  }
  try {
    const payload = await fetchJSON(`/api/pubworld/scenes/${encodeURIComponent(sceneId)}/interactables`);
    const items = payload.items || [];
    placementsByScene.set(sceneId, items);
    renderPlacementOptions(items);
    return items;
  } catch (err) {
    bindPlacementSel.innerHTML = '';
    option(bindPlacementSel, '', 'Failed to load placements');
    return [];
  }
}

function renderPlacementOptions(items) {
  bindPlacementSel.innerHTML = '';
  if (!items.length) {
    option(bindPlacementSel, '', 'No placements');
  } else {
    option(bindPlacementSel, '', 'Select placement');
    items.forEach((p) => option(bindPlacementSel, p.placement_id, `${p.label || p.item_id} @${p.x}`));
  }
}

if (bindSceneSel) {
  bindSceneSel.addEventListener('change', async () => {
    const sceneId = bindSceneSel.value;
    bindStatus.textContent = '';
    await loadPlacementsForScene(sceneId);
  });
}

async function applyBinding(clear = false) {
  const sceneId = bindSceneSel?.value || '';
  const placementId = bindPlacementSel?.value || '';
  const trackId = bindTrackSel?.value || '';
  if (!sceneId || !placementId) {
    bindStatus.textContent = 'Select a scene and placement first.';
    return;
  }
  bindStatus.textContent = clear ? 'Unbinding...' : 'Binding...';
  try {
    const body = { scene_id: sceneId, placement_id: placementId };
    if (!clear) body.bind_track_id = trackId || null;
    await postJSON('/api/pubworld/placement/bind', body, { adminKey: adminKeyInput?.value });
    bindStatus.textContent = clear ? 'Unbound.' : 'Bound.';
    // refresh cache for scene and UI
    placementsByScene.delete(sceneId);
    await loadPlacementsForScene(sceneId);
  } catch (err) {
    bindStatus.textContent = 'Error: ' + (err?.message || String(err));
  }
}

if (bindApplyBtn) bindApplyBtn.addEventListener('click', () => applyBinding(false));
if (bindClearBtn) bindClearBtn.addEventListener('click', () => applyBinding(true));


