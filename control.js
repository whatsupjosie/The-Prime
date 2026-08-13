const hostOverrideEl = document.getElementById('host-override');
const refreshBtn = document.getElementById('refresh-btn');
const activeSessionsEl = document.getElementById('active-sessions');
const presetButtonsEl = document.getElementById('preset-buttons');
const sourceCheckboxesEl = document.getElementById('source-checkboxes');
const profileSelectEl = document.getElementById('profile-select');
const manualForm = document.getElementById('manual-form');
const manualStatus = document.getElementById('manual-status');
const storageStatusEl = document.getElementById('storage-status');
const roomStatusEl = document.getElementById('room-status');
const logEl = document.getElementById('control-log');
const perulousQuoteEl = document.getElementById('perulous-quote');
const inferenceStatusEl = document.getElementById('inference-status');
const performanceStatusEl = document.getElementById('performance-status');
// Pose capture elements
const poseRoomInput = document.getElementById('pose-room');
const poseSceneSelect = document.getElementById('pose-scene');
const poseRecStartBtn = document.getElementById('pose-rec-start');
const poseRecStopBtn = document.getElementById('pose-rec-stop');
const poseRecStatus = document.getElementById('pose-rec-status');

let presets = {};
let sources = [];
let cameras = [];
let profiles = [];
let privacy = {};
let sessions = [];

const PERULOUS_LINES = [
  '"The control room is where chaos learns choreography."',
  '"A clever host carries the show, but a clever control room keeps it alive."',
  '"Remember, cameras see everything. Even your hesitation."',
  '"I once salvaged a broadcast with duct tape and optimism."'
];

function randomQuote() {
  const line = PERULOUS_LINES[Math.floor(Math.random() * PERULOUS_LINES.length)];
  perulousQuoteEl.textContent = line;
}

function log(message, data) {
  const time = new Date().toLocaleTimeString();
  let entry = time + ' | ' + message + '\n';
  if (data) {
    entry += JSON.stringify(data, null, 2) + '\n';
  }
  logEl.textContent += entry;
  logEl.scrollTop = logEl.scrollHeight;
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

function renderSources() {
  sourceCheckboxesEl.innerHTML = '';
  sources.forEach((source) => {
    const label = document.createElement('label');
    label.className = 'source-entry';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = source.source_id;

    const status = source.status || {};
    if (status.online === false) {
      checkbox.disabled = true;
      label.classList.add('offline');
    }

    const title = document.createElement('span');
    title.className = 'source-name';
    title.textContent = `${source.name} - ${source.location}`;

    const meta = document.createElement('span');
    meta.className = 'source-meta';
    const info = [];
    if (source.transport) info.push(String(source.transport).toUpperCase());
    if (source.endpoint) info.push(source.endpoint);
    if (status && typeof status.latency_ms === 'number') info.push('latency ' + Math.round(status.latency_ms) + 'ms');
    meta.textContent = info.join(' | ');

    label.append(checkbox, title, meta);

    const roomPolicy = privacy[source.location] || {};
    if (roomPolicy.notice) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = roomPolicy.notice;
      label.appendChild(hint);
    }

    sourceCheckboxesEl.append(label);
  });
}

function renderProfiles() {
  if (!profileSelectEl) return;
  profileSelectEl.innerHTML = '';
  profiles.forEach((profile) => {
    const option = document.createElement('option');
    const profileId = profile.profile_id || profile.profileId || '';
    option.value = profileId;
    const container = profile.container ? String(profile.container).toUpperCase() : 'N/A';
    option.textContent = `${profile.name} (${container})`;
    profileSelectEl.append(option);
  });
  if (!profileSelectEl.value && profileSelectEl.options.length) {
    const fallback = profiles.find((p) => p.profile_id === 'broadcast_mp4' || p.profileId === 'broadcast_mp4');
    profileSelectEl.value = fallback ? (fallback.profile_id || fallback.profileId || '') : profileSelectEl.options[0].value;
  }
}

function renderPresets() {
  presetButtonsEl.innerHTML = '';
  Object.keys(presets).forEach((id) => {
    const preset = presets[id];
    const card = document.createElement('div');
    card.className = 'preset-card';
    const meta = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = preset.label;
    const summary = document.createElement('div');
    summary.className = 'muted';
    summary.textContent = 'Sources: ' + preset.sources.join(', ');
    meta.append(title, summary);
    const btn = document.createElement('button');
    btn.className = 'primary small';
    btn.textContent = 'Start';
    btn.addEventListener('click', function () {
      startPreset(id);
    });
    card.append(meta, btn);
    presetButtonsEl.append(card);
  });
}

function renderSessions() {
  if (!sessions.length) {
    activeSessionsEl.textContent = 'No active recordings.';
    return;
  }
  activeSessionsEl.innerHTML = '';
  sessions.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';
    const stateValue = (session.state || '').toLowerCase();
    if (stateValue === 'active') card.classList.add('active');
    if (stateValue === 'archived') card.classList.add('archived');

    const header = document.createElement('header');
    const name = document.createElement('span');
    name.textContent = 'Session ' + session.session_id;
    const stateLabel = document.createElement('span');
    stateLabel.textContent = stateValue ? stateValue.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
    header.append(name, stateLabel);

    const detail = document.createElement('div');
    detail.className = 'muted';
    const info = [];
    if (Array.isArray(session.sources)) info.push('Sources: ' + session.sources.join(', '));
    if (session.profile_id) info.push('Profile: ' + session.profile_id);
    if (session.operator) info.push('Operator: ' + session.operator);
    detail.textContent = info.join(' | ');

    const actions = document.createElement('div');
    actions.className = 'session-actions';

    const canControl = stateValue === 'active' || stateValue === 'paused';
    const isPaused = stateValue === 'paused';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'ghost small';
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    pauseBtn.disabled = !canControl;
    pauseBtn.addEventListener('click', function () {
      togglePause(session.session_id, !isPaused);
    });

    const stopBtn = document.createElement('button');
    stopBtn.className = 'ghost small';
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = stateValue === 'stopped' || stateValue === 'archived';
    stopBtn.addEventListener('click', function () {
      stopSession(session.session_id);
    });

    const markBtn = document.createElement('button');
    markBtn.className = 'ghost small';
    markBtn.textContent = 'Mark';
    markBtn.disabled = stateValue !== 'active';
    markBtn.addEventListener('click', function () {
      markMoment(session.session_id);
    });

    actions.append(pauseBtn, stopBtn, markBtn);

    const children = [header, detail, actions];

    if (Array.isArray(session.markers) && session.markers.length) {
      const markerList = document.createElement('ul');
      markerList.className = 'session-markers';
      session.markers.forEach((marker) => {
        const item = document.createElement('li');
        const ts = new Date(marker.timestamp).toLocaleTimeString();
        item.textContent = `${ts} - ${marker.label}`;
        markerList.appendChild(item);
      });
      children.push(markerList);
    }

    if (Array.isArray(session.artifacts) && session.artifacts.length) {
      const artifactList = document.createElement('div');
      artifactList.className = 'artifact-list';
      session.artifacts.forEach((artifact) => {
        const link = document.createElement('a');
        link.textContent = artifact.name || 'download';
        link.href =
          artifact.download_url ||
          `/api/recordings/${session.session_id}/artifacts/${encodeURIComponent(artifact.name || '')}`;
        link.target = '_blank';
        const meta = document.createElement('span');
        meta.className = 'muted';
        const sizeMb = artifact.size_bytes ? (artifact.size_bytes / (1024 * 1024)).toFixed(1) + ' MB' : '';
        meta.textContent = `${artifact.format || ''} ${sizeMb}`.trim();
        const row = document.createElement('div');
        row.className = 'artifact-row';
        row.append(link, meta);
        artifactList.append(row);
      });
      children.push(artifactList);
    }

    children.forEach((child) => card.appendChild(child));
    activeSessionsEl.append(card);
  });
}

function renderPoseScenes(list) {
  if (!poseSceneSelect) return;
  poseSceneSelect.innerHTML = '';
  if (!list || !list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No scenes';
    poseSceneSelect.append(opt);
    return;
  }
  list.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.scene_id;
    opt.textContent = s.name || s.scene_id;
    poseSceneSelect.append(opt);
  });
}

function renderStorage(storage) {
  storageStatusEl.innerHTML = '';
  Object.keys(storage).forEach((key) => {
    const line = document.createElement('div');
    if (key === 'ffmpeg_available') {
      line.textContent = 'FFmpeg: ' + (storage[key] ? 'available' : 'missing');
      line.className = storage[key] ? 'status-ok' : 'status-error';
    } else if (key === 'ffmpeg_path' && storage.ffmpeg_available) {
      line.textContent = 'FFmpeg path: ' + storage[key];
      line.className = 'muted';
    } else {
      line.textContent = key.replace(/_/g, ' ') + ': ' + storage[key];
    }
    storageStatusEl.append(line);
  });
}

function renderRooms() {
  roomStatusEl.innerHTML = '';
  const rooms = Object.keys(privacy);
  if (!rooms.length) {
    roomStatusEl.textContent = 'No room policy defined.';
    return;
  }
  rooms.forEach((room) => {
    const policy = privacy[room];
    const card = document.createElement('div');
    card.className = 'room-card';
    if (policy.recording === 'never') card.classList.add('forbidden');
    const title = document.createElement('strong');
    title.textContent = room.replace('_', ' ');
    const notice = document.createElement('span');
    notice.textContent = policy.notice || '';
    card.append(title, notice);
    roomStatusEl.append(card);
  });
}

function renderInferenceStatus(payload) {
  if (!inferenceStatusEl) return;
  const status = (payload && payload.status) || {};
  const stats = status.stats || {};
  inferenceStatusEl.innerHTML = '';

  const statusLine = document.createElement('div');
  statusLine.textContent = 'Worker: ' + (status.worker_alive ? 'Online' : 'Offline');
  statusLine.className = status.worker_alive ? 'status-ok' : 'status-warn';
  inferenceStatusEl.append(statusLine);

  const pendingLine = document.createElement('div');
  pendingLine.textContent = 'Pending jobs: ' + (status.pending_jobs ?? 0);
  inferenceStatusEl.append(pendingLine);

  const totalsLine = document.createElement('div');
  totalsLine.textContent = 'Completed: ' + (stats.jobs_completed ?? 0) + ' · Failed: ' + (stats.jobs_failed ?? 0);
  inferenceStatusEl.append(totalsLine);

  if (stats.last_duration != null) {
    const durationLine = document.createElement('div');
    durationLine.textContent = 'Last job: ' + stats.last_duration.toFixed(2) + 's';
    inferenceStatusEl.append(durationLine);
  }

  if (stats.last_error) {
    const errorLine = document.createElement('div');
    errorLine.textContent = 'Last error: ' + stats.last_error;
    errorLine.className = 'status-error';
    inferenceStatusEl.append(errorLine);
  }
}

async function renderPerformanceStatus(payload) {
  if (!performanceStatusEl) return;
  const scenes = (payload && payload.scenes) || [];
  if (!scenes.length) {
    performanceStatusEl.textContent = 'No scenes configured yet.';
    return;
  }
  performanceStatusEl.innerHTML = '';
  const sample = scenes.slice(0, 4);
  const plans = await Promise.all(
    sample.map(async (scene) => {
      try {
        return await fetchJSON(`/api/pubworld/scenes/${scene.scene_id}/performance`);
      } catch (err) {
        return { error: err.message };
      }
    })
  );
  sample.forEach((scene, index) => {
    const entry = document.createElement('div');
    entry.className = 'perf-entry';
    const name = document.createElement('strong');
    name.textContent = scene.name || scene.scene_id;
    const updated = document.createElement('div');
    const timestamp = scene.updated_at ? new Date(scene.updated_at * 1000) : new Date();
    updated.textContent = 'Updated: ' + timestamp.toLocaleString();
    const planInfo = document.createElement('div');
    const planPayload = plans[index];
    if (planPayload && planPayload.plan) {
      const visemeCount = planPayload.plan.viseme_track ? planPayload.plan.viseme_track.length : 0;
      const animCount = planPayload.plan.animation_track ? planPayload.plan.animation_track.length : 0;
      planInfo.textContent = `Plan: ${planPayload.plan.avatar_pack} · ${visemeCount} visemes · ${animCount} animations`;
    } else {
      planInfo.textContent = 'Plan unavailable';
      planInfo.className = 'status-warn';
    }
    entry.append(name, updated, planInfo);
    performanceStatusEl.append(entry);
  });
  if (scenes.length > sample.length) {
    const more = document.createElement('div');
    more.className = 'muted';
    more.textContent = `+ ${scenes.length - sample.length} more scenes in library`;
    performanceStatusEl.append(more);
  }
}

async function loadControlData() {
  try {
    const responses = await Promise.all([
      fetchJSON('/api/recordings/sources'),
      fetchJSON('/api/recordings/sessions'),
      fetchJSON('/api/recordings/storage'),
      fetchJSON('/api/recordings/presets'),
      fetchJSON('/api/recordings/profiles'),
      fetchJSON('/api/inference/status'),
      fetchJSON('/api/pubworld/scenes'),
    ]);
    sources = responses[0].sources || [];
    privacy = responses[0].privacy || {};
    sessions = responses[1].sessions || [];
    presets = responses[3].presets || {};
    profiles = (responses[4].profiles || []);
    renderSources();
    renderPresets();
    renderProfiles();
    renderSessions();
    renderStorage(responses[2]);
    renderRooms();
    renderInferenceStatus(responses[5]);
    await renderPerformanceStatus(responses[6]);
    renderPoseScenes((responses[6].scenes || []));
    log('Status refreshed');
  } catch (err) {
    log('Error loading control data', { error: err.message });
  }
}

async function startPreset(presetId) {
  try {
    await startRecording({ preset: presetId });
    log('Started preset', { preset: presetId });
  } catch (err) {
    log('Preset start failed', { preset: presetId, error: err.message });
  }
}

async function startRecording(params) {
  const payload = {
    preset: params.preset || null,
    sources: params.sources || [],
    session_id: params.sessionId || null,
    host_override: hostOverrideEl.checked,
    profile_id: params.profileId || (profileSelectEl ? profileSelectEl.value || null : null),
    operator: 'control-room',
    countdown_seconds: params.countdown ?? 5,
  };
  const resp = await fetchJSON('/api/recordings/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  sessions.push(resp.session);
  renderSessions();
  return resp.session;
}

async function stopSession(sessionId) {
  try {
    await fetchJSON('/api/recordings/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    sessions = sessions.filter((s) => s.session_id !== sessionId);
    renderSessions();
    log('Stopped session', { sessionId: sessionId });
  } catch (err) {
    log('Failed to stop session', { sessionId: sessionId, error: err.message });
  }
}

async function togglePause(sessionId, paused) {
  try {
    const resp = await fetchJSON('/api/recordings/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, paused: paused }),
    });
    sessions = sessions.map((s) => (s.session_id === sessionId ? resp.session : s));
    renderSessions();
    log(paused ? 'Paused session' : 'Resumed session', { sessionId: sessionId });
  } catch (err) {
    log('Failed to toggle pause', { sessionId: sessionId, error: err.message });
  }
}

async function markMoment(sessionId) {
  try {
    const label = window.prompt('Label this moment:', 'highlight');
    if (!label) return;
    await fetchJSON('/api/recordings/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, label: label }),
    });
    log('Marked moment', { sessionId: sessionId, label: label });
  } catch (err) {
    log('Failed to mark moment', { sessionId: sessionId, error: err.message });
  }
}

manualForm.addEventListener('submit', function (event) {
  event.preventDefault();
  const checked = Array.from(sourceCheckboxesEl.querySelectorAll('input[type="checkbox"]:checked')).map(function (cb) {
    return cb.value;
  });
  if (!checked.length) {
    manualStatus.textContent = 'Select at least one source to record.';
    return;
  }
  manualStatus.textContent = 'Starting...';
  startRecording({ sources: checked, sessionId: manualSessionId() })
    .then(function (session) {
      manualStatus.textContent = 'Recording ' + session.session_id + ' started.';
    })
    .catch(function (err) {
      manualStatus.textContent = err.message;
    });
});

function manualSessionId() {
  const input = document.getElementById('manual-session');
  const value = input.value.trim();
  if (value) return value;
  const generated = 'rec_manual_' + Math.random().toString(36).slice(2, 8);
  input.value = generated;
  return generated;
}

function bulkAction(action) {
  sessions.slice().forEach(function (session) {
    if (action === 'stop') stopSession(session.session_id);
    if (action === 'pause' && !session.paused) togglePause(session.session_id, true);
    if (action === 'resume' && session.paused) togglePause(session.session_id, false);
  });
}

refreshBtn.addEventListener('click', loadControlData);

poseRecStartBtn?.addEventListener('click', async () => {
  const room = (poseRoomInput?.value || 'green').trim();
  const scene = (poseSceneSelect?.value || '').trim();
  if (!scene) { poseRecStatus.textContent = 'Select a scene first.'; return; }
  try {
    await fetchJSON('/api/pose/record/start', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ room_id: room, scene_id: scene }) });
    poseRecStatus.textContent = `Recording in room '${room}'...`;
  } catch (e) {
    poseRecStatus.textContent = 'Error: ' + (e?.message||e);
  }
});

poseRecStopBtn?.addEventListener('click', async () => {
  const room = (poseRoomInput?.value || 'green').trim();
  const scene = (poseSceneSelect?.value || '').trim();
  try {
    const resp = await fetchJSON('/api/pose/record/stop', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ room_id: room, scene_id: scene, sample_ms: 500 }) });
    const n = (resp.steps || []).length;
    poseRecStatus.textContent = `Saved ${n} steps to ${scene}.`;
  } catch (e) {
    poseRecStatus.textContent = 'Error: ' + (e?.message||e);
  }
});

const ACTION_MAP = { 'pause-all': 'pause', 'resume-all': 'resume', 'stop-all': 'stop' };

document.querySelectorAll('.quick-group button').forEach(function (btn) {
  let action = btn.dataset.action;
  if (!action) {
    const label = btn.textContent || '';
    if (label.indexOf('Pause') !== -1) action = 'pause';
    if (label.indexOf('Resume') !== -1) action = 'resume';
    if (label.indexOf('Stop') !== -1) action = 'stop';
  }
  action = ACTION_MAP[action] || action;
  btn.addEventListener('click', function () {
    bulkAction(action);
  });
});

loadControlData();
randomQuote();







