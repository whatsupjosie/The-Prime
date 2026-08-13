// Vision Mixer: Program/Preview monitors, crosspoints, tally + hotkeys
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  let lkRoom = null; let LC=null;
  const sources = new Map(); // id -> { kind, track, stream, videoEl, participant }
  let previewId = null; let programId = null;
  let keyOrder = []; // stable order for 1..N mapping

  async function loadLiveKit(){
    if (window.LivekitClient) return window.LivekitClient;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.min.js';
      s.onload = () => resolve(window.LivekitClient);
      s.onerror = () => reject(new Error('LiveKit load failed'));
      document.head.appendChild(s);
    });
  }

  async function join(){
    try {
      LC = await loadLiveKit();
      const { Room, RoomEvent } = LC;
      lkRoom = new Room();
      lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        attachSource(track, participant);
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => { detachSource(track); });
      const res = await fetch('/api/video/token', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ room: 'conference' }) });
      if (!res.ok) throw new Error('Token failed');
      const data = await res.json();
      await lkRoom.connect(data.url, data.token);
    } catch(e) { console.warn('VM join failed', e); }
  }

  function attachSource(track, participant){
    try {
      if (track.kind !== 'video') return;
      const id = `${participant.identity||participant.sid}:${track.sid}`;
      const stream = new MediaStream([track.mediaStreamTrack]);
      const el = document.createElement('video'); el.autoplay=true; el.playsInline=true; el.muted=true; el.srcObject=stream; el.style.width='100%'; el.style.background='#000'; el.style.borderRadius='8px'; el.style.border='2px solid transparent';
      el.addEventListener('click', ()=> setPreview(id));
      const box = document.createElement('div');
      box.className='src-box';
      box.dataset.srcId = id;
      const label = document.createElement('div'); label.className='xpoint-label'; label.textContent = '?'; box.appendChild(label);
      box.appendChild(el);
      const cap=document.createElement('div'); cap.className='muted small'; cap.textContent = participant.name || participant.identity || 'Remote'; box.appendChild(cap);
      const host = $('#cam-list'); if (host) host.appendChild(box);
      sources.set(id, { kind:'video', track, stream, videoEl: el, participant });
      keyOrder = Array.from(sources.keys());
      if (!previewId) setPreview(id);
      applyTally();
      renderCrosspointNumbers();
    } catch{}
  }

  function detachSource(track){
    try {
      const entry = Array.from(sources.entries()).find(([,v])=>v.track===track);
      if (!entry) return; const [id, v] = entry;
      try { v.videoEl && v.videoEl.parentElement && v.videoEl.parentElement.remove(); } catch{}
      sources.delete(id);
      if (previewId===id) previewId=null; if (programId===id) programId=null;
      keyOrder = Array.from(sources.keys());
      applyTally();
    } catch{}
  }

  function setPreview(id){
    previewId = id; const v = sources.get(id); const pvw=$('#pvw-monitor'); if (v && pvw) pvw.srcObject = v.stream; applyTally();
  }

  function cut(){ programId = previewId; const v = sources.get(programId); const pgm=$('#pgm-monitor'); if (v && pgm) { pgm.srcObject = v.stream; try { if (window.pubcastAddMonitorElement) window.pubcastAddMonitorElement(pgm,'hosts'); } catch{} } applyTally(); }

  function takeFade(ms){
    const dur = Math.max(50, Math.min(4000, Number(ms)||400));
    const pvw=$('#pvw-monitor'); const pgm=$('#pgm-monitor');
    if (!pvw || !pgm || !pvw.srcObject) { cut(); return; }
    // overlay element to fade
    let overlay = pgm.cloneNode();
    overlay.muted = true; overlay.autoplay=true; overlay.playsInline=true; overlay.srcObject = pvw.srcObject;
    overlay.style.position='absolute'; overlay.style.inset='0'; overlay.style.borderRadius='8px'; overlay.style.opacity='0'; overlay.style.transition=`opacity ${dur}ms linear`;
    const wrap = pgm.parentElement || pgm;
    wrap.style.position='relative'; wrap.appendChild(overlay);
    requestAnimationFrame(()=>{ overlay.style.opacity='1'; });
    setTimeout(()=>{ try{ wrap.removeChild(overlay);}catch{} cut(); }, dur);
  }

  function renderCrosspointNumbers(){
    const boxes = document.querySelectorAll('#cam-list .src-box');
    boxes.forEach((box, idx)=>{ const lab = box.querySelector('.xpoint-label'); if(lab) lab.textContent = String((idx+1)%10); });
  }

  function applyTally(){
    try{
      document.querySelectorAll('#cam-list video').forEach(v=>{
        const id = v.parentElement && v.parentElement.dataset && v.parentElement.dataset.srcId;
        v.style.borderColor = (id===programId)?'#d22': (id===previewId)?'#2da94f':'transparent';
        v.style.boxShadow = (id===programId)?'0 0 0 2px rgba(210,34,34,0.4)': (id===previewId)?'0 0 0 2px rgba(45,169,79,0.4)':'none';
      });
      const pgm = $('#pgm-monitor'); const pvw = $('#pvw-monitor');
      if (pgm) pgm.style.outline = '3px solid #d22';
      if (pvw) pvw.style.outline = '3px solid #2da94f';
    }catch{}
  }

  function wire(){
    on($('#vm-join'),'click', join);
    on($('#vm-cut'),'click', cut);
    on($('#vm-take'),'click', ()=> takeFade(($('#vm-mix')&&$('#vm-mix').value)||400));
    // Hotkeys: 1..9 select PVW, Space/Enter/C for take (cut), F for fade
    document.addEventListener('keydown', (e)=>{
      if (e.ctrlKey||e.metaKey||e.altKey) return; // simple mapping only
      const k = e.key;
      if (/^[0-9]$/.test(k)){
        const idx = (k==='0'?9:(parseInt(k,10)-1));
        const ids = keyOrder;
        if (ids[idx]) { setPreview(ids[idx]); e.preventDefault(); }
        return;
      }
      if (k===' ' || k==='Enter' || k==='c' || k==='C') { cut(); e.preventDefault(); return; }
      if (k==='f' || k==='F') { takeFade(($('#vm-mix')&&$('#vm-mix').value)||400); e.preventDefault(); return; }
    });
  }

  document.addEventListener('DOMContentLoaded', wire);
})();

  // Respond to camera_take_preset cues: set PVW and Take after duration
  window.addEventListener('pub:production_state', (ev)=>{ try { const st=ev.detail||{}; const cue=st.camera_take_preset||null; if(!cue) return; const target = cue.camera_id; const match = Array.from(sources.entries()).find(([id])=> id.startsWith(target+':') || id.includes(':'+target+':')); if (!match) return; const [id] = match; setPreview(id); const camPresets = (st.camera_presets||{})[target] || {}; const presetDef = camPresets[cue.preset] || {}; const dt = Number(presetDef.duration_ms||500); setTimeout(cut, Math.max(0, dt)); } catch{} });
