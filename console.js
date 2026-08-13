// Unified Operator Console overlay (works across pages)
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // State
  let wsHub = null; // local console hub
  let wsState = 'down';
  const ROOMS = ['dressing','green','studio','control','conference','pub'];
  const ROOM_LABELS = {
    dressing: 'Dressing',
    green: 'Green Room',
    studio: 'Studio',
    control: 'Control Room',
    conference: 'Co-Lab',
    pub: 'Pub',
  };

  function adminKey(){ try { return localStorage.getItem('pubcast_admin_key') || ''; } catch{ return ''; } }
  function setAdminKey(k){ try { localStorage.setItem('pubcast_admin_key', k || ''); } catch{} }

  async function jfetch(url, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    const key = adminKey(); if (key) headers['X-Admin-Key'] = key;
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) { const t = await res.text().catch(()=>" "); throw new Error(`${res.status} ${t}`); }
    return res.json();
  }

  function mount(){
    if ($('#pc-toggle') || $('#pc-console')) return;
    const toggle = document.createElement('button'); toggle.id='pc-toggle'; toggle.className='pc-console-toggle'; toggle.textContent='Console';
    const wrap = document.createElement('div'); wrap.id='pc-console'; wrap.className='pc-console';
    wrap.innerHTML = `
      <div class="pc-header">
        <strong>Operator Console</strong>
        <div>
          <span id="pc-ws" class="pc-chip">WS: down</span>
          <button id="pc-close" class="pc-console-toggle" style="padding:4px 8px;">×</button>
        </div>
      </div>
      <div class="pc-tabs">
        <button data-tab="prod" class="active">Prod</button>
        <button data-tab="chat">Chat</button>
        <button data-tab="audio">Audio</button>
        <button data-tab="edit">Edit</button>
        <button data-tab="media">Media</button>
        <button data-tab="bots">Bots</button>
        <button data-tab="status">Status</button>
      </div>
      <div class="pc-body">
        <div id="pc-tab-prod"></div>
        <div id="pc-tab-chat" style="display:none;"></div>
        <div id="pc-tab-audio" style="display:none;"></div>
        <div id="pc-tab-edit" style="display:none;"></div>
        <div id="pc-tab-media" style="display:none;"></div>
        <div id="pc-tab-bots" style="display:none;"></div>
        <div id="pc-tab-status" style="display:none;"></div>
      </div>`;
    document.body.appendChild(toggle); document.body.appendChild(wrap);

    on(toggle,'click',()=> wrap.classList.toggle('open'));
    on($('#pc-close'),'click',()=> wrap.classList.remove('open'));
    document.querySelectorAll('.pc-tabs button').forEach(btn=>on(btn,'click',()=>switchTab(btn.dataset.tab)));

    renderProd(); renderChat(); renderAudio(); renderEdit(); renderMedia(); renderBots(); renderStatus();
    updateWSChip();
  }

  function switchTab(id){
    document.querySelectorAll('.pc-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
    ['prod','chat','audio','edit','media','bots','status'].forEach(t=>{ const el=$('#pc-tab-'+t); if(el) el.style.display = (t===id)?'block':'none'; });
  }

  // Prod tab
  function renderProd(){
    const host = $('#pc-tab-prod'); if (!host) return;
    host.innerHTML = `
      <div class="pc-row"><span class="pc-label">Mode</span>
        <select id="pc-prod-mode" class="pc-input"><option>LIVE</option><option>REPLAY</option></select>
        <span class="pc-label">OnAir</span>
        <select id="pc-prod-onair" class="pc-input"><option value="false">OFF</option><option value="true">ON</option></select>
      </div>
      <div class="pc-row"><span class="pc-label">Camera</span>
        <select id="pc-prod-camera" class="pc-input"><option>wide</option><option>closeup</option><option>overhead</option></select>
        <span class="pc-label">Lighting</span>
        <select id="pc-prod-lighting" class="pc-input"><option>normal</option><option>warm</option><option>cool</option></select>
      </div>
      <div class="pc-row"><span class="pc-label">Replay</span><input id="pc-prod-replay" class="pc-input" placeholder="vod file" style="flex:1"></div>
      <div class="pc-row"><span class="pc-label">Lower</span><input id="pc-prod-lower" class="pc-input" placeholder="Guest / Title" style="flex:1"></div>
      <div class="pc-row"><button id="pc-prod-apply">Apply</button></div>`;
    on($('#pc-prod-apply'),'click',async()=>{
      const body={
        mode: $('#pc-prod-mode').value,
        on_air: ($('#pc-prod-onair').value==='true'),
        camera: $('#pc-prod-camera').value,
        lighting: $('#pc-prod-lighting').value,
        replay_asset: $('#pc-prod-replay').value,
        lower_third: $('#pc-prod-lower').value,
      };
      try { await fetch('/api/state/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); toast('Production updated','ok'); } catch{ toast('Failed','err'); }
    });
  }

  // Chat tab
  function renderChat(){
    const host = $('#pc-tab-chat'); if (!host) return;
    host.innerHTML = `
      <div class="pc-row"><span class="pc-label">Room</span>
        <select id="pc-chat-room" class="pc-input">${ROOMS.map(r=>`<option value="${r}">${ROOM_LABELS[r]||r}</option>`).join('')}</select>
        <button id="pc-chat-connect">Connect</button>
        <span id="pc-presence" class="pc-small">0 online</span>
      </div>
      <div id="pc-chat-log" class="pc-list"></div>
      <div class="pc-row"><input id="pc-chat-input" class="pc-input" placeholder="Type to chat…" style="flex:1"><button id="pc-chat-send">Send</button></div>
      <div class="pc-row"><span class="pc-label">Shepard</span>
        <button id="pc-sh-stall" class="pc-input">Stall</button>
        <input id="pc-sh-ms" class="pc-input" type="number" value="800" style="width:90px">ms
        <input id="pc-sh-msg" class="pc-input" placeholder="Optional message" style="flex:1">
        <button id="pc-sh-invite" class="pc-input">Invite</button>
      </div>`;
    on($('#pc-chat-connect'),'click',()=>connectWS($('#pc-chat-room').value||'control'));
    on($('#pc-chat-send'),'click',()=>{
      const val = ($('#pc-chat-input').value||'').trim(); if(!val) return;
      try { wsHub && wsHub.send({ type:'chat', payload:{ text: val } }); $('#pc-chat-input').value=''; } catch{}
    });
    on($('#pc-sh-stall'),'click', async()=>{
      const room=$('#pc-chat-room').value||'control'; const ms = Number($('#pc-sh-ms').value||'800'); const msg = ($('#pc-sh-msg').value||'').trim()||undefined;
      try{ await jfetch('/api/shepard/stall',{ method:'POST', body: JSON.stringify({ room, ms, message: msg }) }); toast('Shepard stall sent','ok'); }catch{ toast('Shepard stall failed','err'); }
    });
    on($('#pc-sh-invite'),'click', async()=>{
      const room=$('#pc-chat-room').value||'control'; const msg = ($('#pc-sh-msg').value||'').trim()||undefined;
      try{ await jfetch('/api/shepard/invite',{ method:'POST', body: JSON.stringify({ room, message: msg }) }); toast('Invite sent','ok'); }catch{ toast('Invite failed','err'); }
    });
  }

  function appendChat(rec){
    const log = $('#pc-chat-log'); if(!log || !rec) return;
    const row = document.createElement('div');
    row.className='pc-mono'; row.textContent = `${rec.user||'User'}: ${rec.text||''}`;
    log.appendChild(row); log.scrollTop = log.scrollHeight;
  }

  // Audio tab
  async function renderAudio(){
    const host = $('#pc-tab-audio'); if (!host) return;
    host.innerHTML = `
      <div class="pc-row"><span class="pc-label">Admin Key</span><input id="pc-admin-key" class="pc-input" placeholder="X-Admin-Key" style="min-width:220px"><button id="pc-admin-save">Save</button></div>
      <div class="pc-row"><span class="pc-label">Source</span><input id="pc-au-src" class="pc-input" placeholder="uploads/audio.wav" style="flex:1"></div>
      <div class="pc-row"><span class="pc-label">Preset</span><select id="pc-au-preset" class="pc-input" style="min-width:200px"></select>
        <span class="pc-label">Start</span><input id="pc-au-start" class="pc-input" type="number" min="0" style="width:100px">
        <span class="pc-label">End</span><input id="pc-au-end" class="pc-input" type="number" min="0" style="width:100px">
        <button id="pc-au-run">Patch</button>
      </div>
      <div id="pc-au-jobs" class="pc-list"></div>`;
    try{ const k=adminKey(); if(k) $('#pc-admin-key').value=k; }catch{}
    on($('#pc-admin-save'),'click',()=>{ setAdminKey($('#pc-admin-key').value||''); toast('Admin saved','ok'); });
    on($('#pc-au-run'),'click', async()=>{
      const body={ path: $('#pc-au-src').value||'', preset: $('#pc-au-preset').value||'', start_ms: Number($('#pc-au-start').value||'')||undefined, end_ms: Number($('#pc-au-end').value||'')||undefined };
      if(!body.path||!body.preset) return toast('Source & preset required','warn');
      try{ await jfetch('/api/audio/patch', { method:'POST', body: JSON.stringify(body) }); toast('Patch started','ok'); refreshAudioJobs(); }catch{ toast('Patch failed','err'); }
    });
    // load presets
    try{ const ps = await fetch('/api/audio/presets').then(r=>r.ok?r.json():{presets:{}}); const sel=$('#pc-au-preset'); if(sel){ sel.innerHTML=''; Object.entries(ps.presets||{}).forEach(([id,meta])=>{ const o=document.createElement('option'); o.value=id; o.textContent=meta.label||id; sel.appendChild(o); }); } }catch{}
    refreshAudioJobs(); setInterval(refreshAudioJobs, 4000);
  }

  async function refreshAudioJobs(){
    try{ const host=$('#pc-au-jobs'); if(!host) return; const js = await fetch('/api/audio/status').then(r=>r.ok?r.json():{jobs:[]}); host.innerHTML=''; (js.jobs||[]).slice().sort((a,b)=>(b.started||0)-(a.started||0)).forEach(j=>{ const row=document.createElement('div'); row.className='pc-mono'; row.textContent = `${j.type||'job'} ${j.status||''} ${j.progress!=null?j.progress+'%':''} ${j.output||''}`; host.appendChild(row); }); }catch{}
  }

  // Edit tab (Trim / Merge)
  function renderEdit(){
    const host=$('#pc-tab-edit'); if(!host) return;
    host.innerHTML = `
      <div class="pc-row"><span class="pc-label">Admin Key</span><input id="pc-ed-admin" class="pc-input" placeholder="X-Admin-Key" style="min-width:220px"><button id="pc-ed-save">Save</button></div>
      <h4>Trim</h4>
      <div class="pc-row"><span class="pc-label">Path</span><input id="pc-ed-path" class="pc-input" placeholder="uploads/clip.mp4" style="flex:1"></div>
      <div class="pc-row"><span class="pc-label">Start</span><input id="pc-ed-start" class="pc-input" type="number" min="0" style="width:100px"><span class="pc-label">End</span><input id="pc-ed-end" class="pc-input" type="number" min="1" style="width:100px"><span class="pc-label">Out</span><input id="pc-ed-out" class="pc-input" placeholder="optional name" style="min-width:200px"><button id="pc-ed-trim">Run</button></div>
      <h4>Merge</h4>
      <div class="pc-row"><span class="pc-label">Paths</span><textarea id="pc-ed-paths" class="pc-input" placeholder="uploads/a.mp4\nuploads/b.mp4" style="flex:1; min-height:80px"></textarea></div>
      <div class="pc-row"><label class="pc-small"><input id="pc-ed-re" type="checkbox"> Re-encode</label><span class="pc-label">Out</span><input id="pc-ed-merge-out" class="pc-input" placeholder="merged.mp4" style="min-width:200px"><button id="pc-ed-merge">Run</button></div>
      <div id="pc-ed-jobs" class="pc-list"></div>`;
    try{ const k=adminKey(); if(k) $('#pc-ed-admin').value=k; }catch{}
    on($('#pc-ed-save'),'click',()=>{ setAdminKey($('#pc-ed-admin').value||''); toast('Admin saved','ok'); });
    on($('#pc-ed-trim'),'click', async()=>{
      const body={ path: $('#pc-ed-path').value||'', start_ms: Number($('#pc-ed-start').value||'0'), end_ms: Number($('#pc-ed-end').value||'0'), output_name: ($('#pc-ed-out').value||'').trim()||undefined };
      if(!body.path || body.end_ms<=body.start_ms) return toast('Path and valid range required','warn');
      try{ await jfetch('/api/edit/trim',{ method:'POST', body: JSON.stringify(body) }); toast('Trim started','ok'); refreshEditJobs(); }catch{ toast('Trim failed','err'); }
    });
    on($('#pc-ed-merge'),'click', async()=>{
      const lines = ($('#pc-ed-paths').value||'').split(/\n|,/).map(s=>s.trim()).filter(Boolean);
      if(lines.length<2) return toast('Need at least 2 clips','warn');
      const body={ paths: lines, re_encode: !!$('#pc-ed-re').checked, output_name: ($('#pc-ed-merge-out').value||'').trim()||undefined };
      try{ await jfetch('/api/edit/concatenate',{ method:'POST', body: JSON.stringify(body) }); toast('Merge started','ok'); refreshEditJobs(); }catch{ toast('Merge failed','err'); }
    });
    refreshEditJobs(); setInterval(refreshEditJobs, 5000);
  }

  async function refreshEditJobs(){
    try{ const host=$('#pc-ed-jobs'); if(!host) return; const js = await fetch('/api/edit/status').then(r=>r.ok?r.json():{jobs:[]}); host.innerHTML=''; (js.jobs||[]).slice().sort((a,b)=>(b.started||0)-(a.started||0)).forEach(j=>{ const row=document.createElement('div'); row.className='pc-mono'; row.textContent = `${j.type||'job'} ${j.status||''} ${j.progress!=null?j.progress+'%':''} ${j.output||''}`; host.appendChild(row); }); }catch{}
  }

  // Media tab
  function renderMedia(){
    const host=$('#pc-tab-media'); if(!host) return;
    host.innerHTML = `
      <div class="pc-row"><button id="pc-md-refresh">Refresh</button><label class="pc-small"><input id="pc-md-meta" type="checkbox"> metadata</label></div>
      <div id="pc-md-list" class="pc-list"></div>
      <div id="pc-md-actions" class="pc-row" style="display:none;">
        <span class="pc-label">Tag</span><input id="pc-md-tag" class="pc-input" style="min-width:160px"><button id="pc-md-addtag">Add</button>
        <span class="pc-label">Rating</span><select id="pc-md-rate" class="pc-input"><option value="">-</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select><button id="pc-md-applyrate">Set</button>
        <span class="pc-small" id="pc-md-msg"></span>
      </div>`;
    on($('#pc-md-refresh'),'click',()=>refreshMedia($('#pc-md-meta').checked));
    refreshMedia(false);
  }

  async function refreshMedia(withMeta){
    try{
      const list=$('#pc-md-list'); if(!list) return; list.innerHTML='Loading…';
      const js = await fetch(`/api/media?include_metadata=${withMeta?'true':'false'}`).then(r=>r.ok?r.json():{items:[]});
      list.innerHTML='';
      (js.items||[]).forEach(it=>{
        const row=document.createElement('div'); row.style.padding='4px 0'; row.style.cursor='pointer';
        const bits=[]; bits.push(`<strong>${it.name}</strong>`); if(it.size) bits.push(`<span class="pc-small">${it.size}</span>`); if(it.duration_str) bits.push(`<span class="pc-small">${it.duration_str}</span>`); if(it.rating!=null) bits.push(`<span class="pc-chip">★ ${it.rating}</span>`);
        if (it.tags && it.tags.length) bits.push(`<span class="pc-small">${it.tags.join(', ')}</span>`);
        row.innerHTML = bits.join(' ');
        row.addEventListener('click',()=>selectMedia(it));
        list.appendChild(row);
      });
    }catch{}
  }

  let _mdSel=null;
  function selectMedia(it){
    _mdSel = it;
    const bar=$('#pc-md-actions'); if(!bar) return; bar.style.display='flex';
    const msg=$('#pc-md-msg'); if(msg) msg.textContent = it.path || it.name;
    on($('#pc-md-addtag'),'click', async()=>{
      const tag = ($('#pc-md-tag').value||'').trim(); if(!tag) return;
      try{ await jfetch(`/api/media/${encodeURIComponent(it.path)}/tag`, { method:'POST', body: JSON.stringify({ tags:[tag] }) }); toast('Tag added','ok'); refreshMedia($('#pc-md-meta').checked); }catch{ toast('Tag failed','err'); }
    });
    on($('#pc-md-applyrate'),'click', async()=>{
      const v = ($('#pc-md-rate').value||'').trim(); if(!v) { try{ await jfetch(`/api/media/${encodeURIComponent(it.path)}/rate`, { method:'DELETE' }); toast('Rating cleared','ok'); }catch{ toast('Rate failed','err'); } } else { try{ await jfetch(`/api/media/${encodeURIComponent(it.path)}/rate`, { method:'POST', body: JSON.stringify({ rating: Number(v) }) }); toast('Rated','ok'); }catch{ toast('Rate failed','err'); } }
      refreshMedia($('#pc-md-meta').checked);
    });
  }

  // Bots tab
  async function renderBots(){
    const host=$('#pc-tab-bots'); if(!host) return;
    host.innerHTML = `
      <div class="pc-row"><span class="pc-label">Bot</span><select id="pc-bot-id" class="pc-input" style="min-width:160px"></select>
      <span class="pc-label">Room</span><select id="pc-bot-room" class="pc-input">${ROOMS.map(r=>`<option>${r}</option>`).join('')}</select></div>
      <div class="pc-row"><input id="pc-bot-text" class="pc-input" placeholder="Speak as bot…" style="flex:1"><button id="pc-bot-send">Send</button></div>`;
    try{ const js = await fetch('/api/bots').then(r=>r.ok?r.json():{bots:[]}); const sel=$('#pc-bot-id'); if(sel){ sel.innerHTML=''; (js.bots||[]).forEach(b=>{ const o=document.createElement('option'); o.value=b.bot_id||b.agent_id; o.textContent = `${b.display_name} (${b.provider})`; sel.appendChild(o); }); } }catch{}
    on($('#pc-bot-send'),'click', async()=>{
      const botId = $('#pc-bot-id').value||''; const room=$('#pc-bot-room').value||'control'; const text=($('#pc-bot-text').value||'').trim(); if(!botId||!text) return;
      try{ await jfetch('/api/bots/say',{ method:'POST', body: JSON.stringify({ bot_id: botId, room, text })}); toast('Bot spoke','ok'); }catch{ toast('Bot speak failed','err'); }
    });
  }

  // Status tab
  async function renderStatus(){
    const host=$('#pc-tab-status'); if(!host) return;
    host.innerHTML = `
      <div class="pc-row">
        <span class="pc-label">Admin Key</span>
        <input id="pc-st-admin" class="pc-input" placeholder="X-Admin-Key" style="min-width:220px">
        <button id="pc-st-save">Save</button>
        <button id="pc-refresh-status">Refresh</button>
        <button id="pc-refresh-jobs">Jobs</button>
      </div>
      <div class="pc-split">
        <div style="flex:1;min-width:280px;">
          <h4>Server Status</h4>
          <div id="pc-status" class="pc-mono"></div>
        </div>
        <div style="flex:1;min-width:280px;">
          <h4>Jobs</h4>
          <div id="pc-jobs" class="pc-list"></div>
        </div>
      </div>`;
    try{ const k=adminKey(); if(k) $('#pc-st-admin').value=k; }catch{}
    on($('#pc-st-save'),'click',()=>{ setAdminKey($('#pc-st-admin').value||''); toast('Admin saved','ok'); });
    on($('#pc-refresh-status'),'click', refreshStatus);
    on($('#pc-refresh-jobs'),'click', refreshJobs);
    refreshStatus();
    refreshJobs();
    setInterval(()=>{ refreshJobs(); }, 5000);
  }

  async function refreshStatus(){
    try{ const js = await fetch('/status').then(r=>r.ok?r.json():{}); const el=$('#pc-status'); if(el) el.textContent = JSON.stringify(js,null,2); }catch{}
  }

  async function refreshJobs(){
    try{
      const host=$('#pc-jobs'); if(!host) return;
      const js = await fetch('/api/jobs/all').then(r=>r.ok?r.json():{jobs:[]});
      const items = (js.jobs||[]).slice().sort((a,b)=>(b.started||0)-(a.started||0));
      host.innerHTML='';
      items.forEach(j=>{
        const row=document.createElement('div'); row.className='pc-mono';
        const meta = [j.type||'job', j.status||'', (j.progress!=null? (j.progress+'%') : ''), (j.output||j.source||'')].filter(Boolean).join(' ');
        const idSpan=document.createElement('span'); idSpan.textContent=meta; row.appendChild(idSpan);
        if (j.running && j.job_id){
          const btn=document.createElement('button'); btn.textContent='Cancel'; btn.style.marginLeft='8px';
          btn.addEventListener('click', async()=>{
            try{ await jfetch(`/api/jobs/${encodeURIComponent(j.job_id)}/cancel`, { method:'POST' }); toast('Cancelled','ok'); refreshJobs(); }catch(e){ toast('Cancel failed','err'); }
          });
          row.appendChild(btn);
        }
        host.appendChild(row);
      });
    }catch{}
  }

  // WS handling
  function connectWS(room){
    try { if (wsHub) wsHub.close && wsHub.close(); } catch{}
    wsHub = new window.WSHub(room, (msg)=>{
      if(!msg||typeof msg!=='object') return;
      if(msg.type==='history') (msg.payload||[]).forEach(appendChat);
      else if(msg.type==='chat' && msg.payload) appendChat(msg.payload);
      else if(msg.type==='presence' && msg.payload){ const p=$('#pc-presence'); if(p) p.textContent=`${msg.payload.count||0} online`; }
    });
    wsHub.connect();
    wsState='open'; updateWSChip();
  }

  function updateWSChip(){ const chip=$('#pc-ws'); if(!chip) return; chip.textContent = `WS: ${wsState}`; chip.style.background = (wsState==='open')?'#0c6':'#7a1b1b'; }

  // Toast bridge (reuse existing one if present)
  function toast(msg,type){ try{ if(window.toast) return window.toast(msg,type); } catch{} }

  // Keyboard mappings
  function setupHotkeys(){
    document.addEventListener('keydown', (e)=>{
      // Ignore when typing unless using ctrl/meta combos
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const typing = tag==='input' || tag==='textarea' || tag==='select' || e.isComposing;
      // Toggle console with backtick or Ctrl+;
      if ((e.key==='`' && !e.ctrlKey && !e.metaKey && !typing) || (e.ctrlKey && e.key===';')){
        const wrap=$('#pc-console'); if (wrap){ wrap.classList.toggle('open'); e.preventDefault(); return; }
      }
      // Switch tabs Ctrl+1..7
      if (e.ctrlKey && !e.shiftKey && !e.altKey){
        const map=['prod','chat','audio','edit','media','bots','status'];
        const n = Number(e.key);
        if (n>=1 && n<=map.length){ switchTab(map[n-1]); e.preventDefault(); return; }
      }
      // Esc closes console
      if (e.key==='Escape'){
        const wrap=$('#pc-console'); if(wrap && wrap.classList.contains('open')){ wrap.classList.remove('open'); e.preventDefault(); return; }
      }
      // Ctrl+Enter sends chat when Chat tab visible
      if (e.ctrlKey && e.key==='Enter'){
        const chatHost=$('#pc-tab-chat'); if (chatHost && chatHost.style.display!=='none'){ const btn=$('#pc-chat-send'); if(btn){ btn.click(); e.preventDefault(); return; } }
      }
    });
  }

  // load
  document.addEventListener('DOMContentLoaded', ()=>{
    // ensure ws script present
    if (!window.WSHub) { console.warn('WSHub not present; include /static/ws.js for live Chat tab'); }
    mount();
    setupHotkeys();
  });
})();
