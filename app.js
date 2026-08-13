// Clean, UTF-8 app wiring for PubCast: chat, presence, control form, wardrobe, uploads, and status chips
(function () {
  // ---------- Helpers ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function toast(msg, type = 'info', timeout = 2200) {
    let host = document.getElementById('_toast_host');
    if (!host) {
      host = document.createElement('div');
      host.id = '_toast_host';
      host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'background:#111;color:#fff;border-radius:10px;padding:10px 14px;box-shadow:0 6px 22px rgba(0,0,0,.3);font:500 13px system-ui,Segoe UI,Roboto,Helvetica,Arial';
    if (type === 'ok') t.style.background = '#0c6';
    if (type === 'warn') t.style.background = '#f6b300';
    if (type === 'err') t.style.background = '#e23d3d';
    host.appendChild(t);
    setTimeout(() => t.remove(), timeout);
  }

  // ---------- Status chips ----------
  let wsChip, ffmpegChip, keysChip;
  function ensureStatusHeader() {
    const host = $('#view-control .room-nav');
    if (!host) return null;
    let header = host.querySelector('.status-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'status-header';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '8px';
      header.style.margin = '8px 0';
      host.appendChild(header);
    }
    return header;
  }
  function chip(text, ok) {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.marginLeft = '6px';
    s.style.background = ok ? '#0c6' : '#e23d3d';
    s.style.color = '#fff';
    s.style.borderRadius = '999px';
    s.style.padding = '2px 8px';
    s.style.fontSize = '11px';
    return s;
  }
  function setWS(ok) {
    const header = ensureStatusHeader();
    if (!header) return;
    if (!wsChip) { wsChip = chip('WS: OK', ok); header.appendChild(wsChip); }
    wsChip.textContent = ok ? 'WS: OK' : 'WS: Down';
    wsChip.style.background = ok ? '#0c6' : '#e23d3d';
  }
  function setFFmpeg(ok) {
    const header = ensureStatusHeader();
    if (!header) return;
    if (!ffmpegChip) { ffmpegChip = chip('FFmpeg: OK', ok); header.appendChild(ffmpegChip); }
    ffmpegChip.textContent = ok ? 'FFmpeg: OK' : 'FFmpeg: Missing';
    ffmpegChip.style.background = ok ? '#0c6' : '#e23d3d';
  }
  function setKeysStatus(ok) {
    const header = ensureStatusHeader();
    if (!header) return;
    if (!keysChip) { keysChip = chip('AI Keys: OK', ok); header.appendChild(keysChip); }
    keysChip.textContent = ok ? 'AI Keys: OK' : 'AI Keys: Missing';
    keysChip.style.background = ok ? '#0c6' : '#e23d3d';
  }

  // ---------- WebSocket hub ----------
  let wsHub;
  function connectWS(room = 'control') {
    try {
      wsHub = new window.WSHub(room, (msg) => {
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
          case 'production_state':\n            reflectProductionState(msg.payload || {});\n            try { window.dispatchEvent(new CustomEvent('pub:production_state', { detail: msg.payload||{} })); } catch{}\n            break;
          case 'history':
            renderHistory(msg.payload || []);
            break;
          case 'chat':
            if (msg.payload) appendChat(msg.payload);
            break;
          case 'presence':
            updatePresence(msg.payload || {});
            break;
          case 'typing':
            showTyping(msg.payload || {});
            break;
          default:
            break;
        }
      });
      wsHub.connect();
      window.wsHub = wsHub;
      setWS(true);
    } catch {
      setWS(false);
    }
  }

  // ---------- Production state reflect ----------
  function reflectProductionState(state) {
    $('#camera-mode') && ($('#camera-mode').textContent = state.camera || 'wide');
    $('#lighting-mode') && ($('#lighting-mode').textContent = state.lighting || 'normal');
    const onAirStudio = $('#studio-onair');
    if (onAirStudio) onAirStudio.classList.toggle('hidden', !state.on_air);
    const lowerStudio = $('#studio-lower-third');
    if (lowerStudio) lowerStudio.textContent = state.lower_third || '';
    const lowerGreen = $('#lower-third');
    if (lowerGreen) lowerGreen.textContent = state.lower_third || '';
    const liveBanner = $('#live-banner');
    if (liveBanner) liveBanner.classList.toggle('hidden', !state.on_air);
    const pb = $('#program-badge');
    if (pb) pb.textContent = state.mode === 'REPLAY' ? 'REPLAY' : 'LIVE';
  }

  // ---------- Control form ----------
  function wireControlForm() {
    const form = $('#control-form');
    if (!form) return;
    on(form, 'submit', async (e) => {
      e.preventDefault();
      const payload = {
        mode: $('#prod-mode')?.value || 'LIVE',
        on_air: ($('#prod-onair')?.value || 'false') === 'true',
        camera: $('#prod-camera')?.value || 'wide',
        lighting: $('#prod-lighting')?.value || 'normal',
        replay_asset: $('#prod-replay')?.value || '',
        lower_third: $('#prod-lower')?.value || '',
        profile_id: $('#rec-profile')?.value || null,
      };
      try {
        const res = await fetch('/api/state/production', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if (res.ok) toast('Production state updated', 'ok'); else throw new Error('bad');
      } catch {
        toast('Failed to update production', 'err');
      }
    });
  }

  // ---------- Chat UI ----------
  function renderHistory(items) {
    const log = $('#chat-log');
    if (!log) return;
    log.innerHTML = '';
    (items || []).forEach(appendChat);
    log.scrollTop = log.scrollHeight;
  }
  function appendChat(rec) {
    const log = $('#chat-log');
    if (!log || !rec) return;
    const row = document.createElement('div');
    row.className = 'chat-row';\n    try { const sid = rec.user_id || ''; if ((rec.badge && String(rec.badge).toUpperCase()==='BOT') || (typeof sid==='string' && sid.startsWith('bot-'))) { row.classList.add('bot'); } } catch {}
    const name = document.createElement('span');
    name.className = 'chat-user';
    name.textContent = rec.user || 'User';
    const text = document.createElement('span');
    text.className = 'chat-text';
    text.textContent = rec.text || '';
    row.appendChild(name);
    row.appendChild(document.createTextNode(': '));
    row.appendChild(text);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  function updatePresence(payload) {
    const el = $('#presence');
    if (el) el.textContent = `${payload.count || 0} online`;
    const roster = $('#roster');
    if (roster) {
      roster.innerHTML = '';
      (payload.users || []).forEach((u) => {
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = u.display_name || u.user || 'User';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = u.badge || '';
        li.appendChild(strong);
        if (u.badge) { li.appendChild(document.createTextNode(' ')); li.appendChild(badge); }
        roster.appendChild(li);
      });
    }
  }
  const typingMap = new Map();
  function showTyping(payload) {
    const id = payload.user_id || payload.user || String(Math.random());
    const name = payload.user || 'Someone';
    typingMap.set(id, { name, t: Date.now() });
    const el = $('#typing');
    if (!el) return;
    const now = Date.now();
    const active = Array.from(typingMap.values()).filter((v) => now - v.t < 2500).map((v) => v.name);
    if (!active.length) { el.textContent = ''; return; }
    const list = active.slice(0, 3).join(', ');
    el.textContent = `${list} typing...`;
    setTimeout(() => {
      const now2 = Date.now();
      const active2 = Array.from(typingMap.values()).filter((v) => now2 - v.t < 2500);
      if (!active2.length) el.textContent = '';
    }, 2600);
  }
  function wireChat() {
    const form = $('#chat-form');
    const input = $('#chat-input');
    const roomSel = $('#chat-room');
    const roomGo = $('#chat-switch');
    if (form && input) {
      on(form, 'submit', (e) => {
        e.preventDefault();
        const val = (input.value || '').trim();
        if (!val) return;
        try { window.wsHub && window.wsHub.send({ type: 'chat', payload: { text: val } }); } catch {}
        input.value = '';
      });
      on(input, 'input', () => { try { window.wsHub && window.wsHub.send({ type: 'typing' }); } catch {} });
    }
    if (roomGo && roomSel) {
      on(roomGo, 'click', () => {
        const r = roomSel.value || 'control';
        try { if (window.wsHub) window.wsHub.changeRoom(r); else connectWS(r); } catch { connectWS(r); }
      });
    }
    const tab = $('#drawer-tab');
    const drawer = $('#chat-drawer');
    if (tab && drawer) on(tab, 'click', () => drawer.classList.toggle('open'));
  }

  // ---------- Wardrobe (avatar) ----------
  async function loadMe() {
    try {
      const res = await fetch('/api/avatar/me');
      if (!res.ok) return;
      const me = await res.json();
      $('#displayName') && ($('#displayName').value = me.display_name || '');
      $('#avatarColor') && ($('#avatarColor').value = me.avatar_color || '#00e0ff');
      $('#badge') && ($('#badge').value = me.badge || '');
      mirror();
    } catch {}
  }
  function mirror() {
    const dn = $('#displayName')?.value || '';
    const ac = $('#avatarColor')?.value || '#00e0ff';
    $('#name-preview') && ($('#name-preview').textContent = dn || 'You');
    $('#avatar-preview') && ($('#avatar-preview').style.background = ac);
  }
  function wireWardrobe() {
    const form = $('#wardrobe-form');
    if (!form) return;
    on(form, 'input', mirror);
    on(form, 'submit', async (e) => {
      e.preventDefault();
      const body = {
        display_name: $('#displayName')?.value || '',
        primary_color: $('#avatarColor')?.value || '#00e0ff',
        badge: $('#badge')?.value || '',
      };
      try {
        const res = await fetch('/api/avatar/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) toast('Avatar saved', 'ok'); else toast('Save failed', 'err');
      } catch { toast('Save failed', 'err'); }
    });
  }

  // ---------- Uploads ----------
  function wireUpload() {
    const form = $('#upload-form');
    if (!form) return;
    on(form, 'submit', async (e) => {
      e.preventDefault();
      const file = $('#uploadFile')?.files?.[0];
      const target = $('#uploadTarget')?.value || '';
      if (!file) { toast('Choose a file', 'warn'); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('target', target);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const js = await res.json().catch(() => ({}));
        if (res.ok && js.path) {
          const out = $('#upload-result');
          if (out) { out.textContent = js.path; out.className = 'muted'; }
          toast('Uploaded', 'ok');
        } else { toast('Upload failed', 'err'); }
      } catch { toast('Upload failed', 'err'); }
    });
  }

  // ---------- Init ----------
  async function init() {
    // Start in Control room
    connectWS('control');
    wireChat();
    wireControlForm();
    wireWardrobe();
    wireUpload();
    loadMe();
    // Presence/status chips
    try {
      const r = await fetch('/status');
      if (r.ok) { const s = await r.json(); setFFmpeg(!!s.ffmpeg_ok); setKeysStatus(!!s.keys_ok); }
    } catch {}
    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      on(btn, 'click', () => {
        const room = btn.dataset.room;
        document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
        const view = document.getElementById('view-' + room);
        if (view) view.classList.remove('hidden');
        try { if (window.wsHub) window.wsHub.changeRoom(room); else connectWS(room); } catch { connectWS(room); }
      });
    });

    // Hook WS status updates from ws.js
    try { window.__pub_ws_status = (status) => { setWS(status === 'open'); }; } catch {}
  }

  document.addEventListener('DOMContentLoaded', init);
})();


