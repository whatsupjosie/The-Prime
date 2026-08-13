// Conference room: local preview fallback, optional LiveKit (token endpoint)
(function () {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  let localStream = null;
  let joined = false;
  let micEnabled = true;
  let camEnabled = true;
  let stt; let sttActive = false;
  let audioCtx = null, analyser = null, meterRAF = null, monitorNodes = null;
  let lkRoom = null; // LiveKit Room instance when connected\n  // Monitor bus\n  let monCtx = null; let monReady=false; let monProgram=null; let monHosts=null; let monMusic=null; let monMaster=null;\n  const monSources = new WeakMap();\n\n  function ensureMonCtx(){\n    if (monCtx) return monCtx;\n    try { monCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch{}\n    return monCtx;\n  }\n\n  function setupMonitor(){\n    if (monReady) return;\n    const ctx = ensureMonCtx(); if (!ctx) return;\n    monProgram = ctx.createGain(); monProgram.gain.value=0.8;\n    monHosts = ctx.createGain(); monHosts.gain.value=0.85;\n    monMusic = ctx.createGain(); monMusic.gain.value=0.6;\n    monMaster = ctx.createGain(); monMaster.gain.value=0.8;\n    // chain: hosts+music -> program -> master -> speakers\n    monHosts.connect(monProgram); monMusic.connect(monProgram); monProgram.connect(monMaster); monMaster.connect(ctx.destination);\n    monReady = true;\n  }

  async function loadLiveKit() {
    if (window.LivekitClient) return window.LivekitClient;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.min.js';
      s.onload = () => resolve(window.LivekitClient);
      s.onerror = () => reject(new Error('Failed to load LiveKit client'));
      document.head.appendChild(s);
    });
  }

  function setStatus(msg) {
    const el = $("#vc-status");
    if (el) el.textContent = msg;
  }

  function videoTile(stream, label) {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; v.muted = (label === 'You');
    v.srcObject = stream;
    v.style.width = '100%'; v.style.background = '#000';
    const cap = document.createElement('div');
    cap.textContent = label || '';
    cap.style.position = 'absolute'; cap.style.left = '6px'; cap.style.bottom = '6px';
    cap.style.padding = '2px 6px'; cap.style.background = 'rgba(0,0,0,0.5)'; cap.style.color = '#fff'; cap.style.fontSize = '11px'; cap.style.borderRadius = '6px';
    wrap.appendChild(v); wrap.appendChild(cap);
    return wrap;
  }

  function clearGrid() {
    const grid = $("#vc-grid");
    if (grid) grid.innerHTML = '';
  }

  async function enumerateMics() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const sel = $("#vc-mic-device");
      if (!sel) return;
      const prev = localStorage.getItem('vc_mic_id') || '';
      sel.innerHTML = '';
      mics.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Mic ${sel.length+1}`;
        if (prev && d.deviceId === prev) opt.selected = true;
        sel.appendChild(opt);
      });
      const apply = $("#vc-apply-mic"); if (apply) apply.disabled = !mics.length;
    } catch {}
  }

  async function enumerateCams() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      const sel = $("#vc-cam-device");
      if (!sel) return;
      const prev = localStorage.getItem('vc_cam_id') || '';
      sel.innerHTML = '';
      cams.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${sel.length+1}`;
        if (prev && d.deviceId === prev) opt.selected = true;
        sel.appendChild(opt);
      });
      const apply = $("#vc-apply-cam"); if (apply) apply.disabled = !cams.length;
    } catch {}
  }

  async function startLocalPreview() {
    try {
      clearGrid();
      const sel = $("#vc-mic-device");
      const devId = sel && sel.value ? sel.value : undefined;
      const audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: devId ? { exact: devId } : undefined,
      };
      const camSel = $("#vc-cam-device");
      const camId = camSel && camSel.value ? camSel.value : undefined;
      const video = camId ? { deviceId: { exact: camId } } : true;
      localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
      const grid = $("#vc-grid");
      if (grid) grid.appendChild(videoTile(localStream, 'You'));
      enableControls(true);
      setStatus('Local preview (server video not configured)');
      joined = true;
      setupMeter();
      await enumerateMics();
    } catch (e) {
      setStatus('Camera/mic permission denied');
    }
  }

  function stopLocalPreview() {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    teardownMeter();
    clearGrid();
    enableControls(false);
    setStatus('Not connected');
    joined = false;
  }

  function attachTrackToGrid(track, label) {
    try {
      const mediaEl = track.attach();
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.background = '#000';
      mediaEl.autoplay = true; mediaEl.playsInline = true;
      if (track.kind === 'audio') mediaEl.muted = true;
      mediaEl.style.width = '100%';
      wrap.appendChild(mediaEl);
      const cap = document.createElement('div');
      cap.textContent = label || '';
      cap.style.position = 'absolute'; cap.style.left = '6px'; cap.style.bottom = '6px';
      cap.style.padding = '2px 6px'; cap.style.background = 'rgba(0,0,0,0.5)'; cap.style.color = '#fff'; cap.style.fontSize = '11px'; cap.style.borderRadius = '6px';
      wrap.appendChild(cap);
      const grid = document.getElementById('vc-grid');
      if (grid) grid.appendChild(wrap);
      return wrap;
    } catch {}
    return null;
  }

  async function joinLiveKit(url, token) {
    try {
      const LC = await loadLiveKit();
      const { Room, RoomEvent } = LC;
      lkRoom = new Room();
      lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {\n        const elWrap = attachTrackToGrid(track, participant.name || participant.identity || 'Remote');\n        try {\n          if (track.kind === 'audio') {\n            setupMonitor(); const ctx=ensureMonCtx(); if (ctx && elWrap){\n              const mediaEl = elWrap.querySelector('audio');\n              if (mediaEl && !monSources.has(mediaEl)){\n                const src = ctx.createMediaElementSource(mediaEl);\n                if ((participant.name||'').toLowerCase().includes('music') || (participant.identity||'').toLowerCase().includes('music') || (participant.name||'').toLowerCase().includes('bgm')) { src.connect(monMusic||monHosts); } else { src.connect(monHosts); } monSources.set(mediaEl, true);\n              }\n            }\n          }\n        } catch{}\n      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        try { const els = track.detach(); (els||[]).forEach(e => e.remove()); } catch{}
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        setStatus('Disconnected'); enableControls(false); clearGrid();
      });
      setStatus('Connectingâ€¦');
      await lkRoom.connect(url, token);
      const sel = document.getElementById('vc-mic-device');
      const devId = sel && sel.value ? sel.value : undefined;
      try { await lkRoom.localParticipant.setMicrophoneEnabled(true, devId ? { deviceId: devId } : undefined); } catch{}
      try { await lkRoom.localParticipant.setCameraEnabled(true); } catch{}
      // show local tracks
      lkRoom.localParticipant.tracks.forEach(pub => { if (pub.track) attachTrackToGrid(pub.track, 'You'); });
      enableControls(true); joined = true; setStatus('Connected');
    } catch (e) {
      setStatus('LiveKit connect failed; using local preview');
      await startLocalPreview();
    }
  }

  function enableControls(active) {
    const ids = ['vc-leave','vc-mic','vc-cam'];
    ids.forEach(id => { const b = $("#"+id); if (b) b.disabled = !active; });
    const join = $("#vc-join"); if (join) join.disabled = active;
  }

  async function toggleMic() {
    micEnabled = !micEnabled;
    const btn = $("#vc-mic"); if (btn) btn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
    try {
      if (lkRoom) {
        await lkRoom.localParticipant.setMicrophoneEnabled(micEnabled);
      } else if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
      }
    } catch {}
  }

  async function toggleCam() {
    camEnabled = !camEnabled;
    const btn = $("#vc-cam"); if (btn) btn.textContent = camEnabled ? 'Hide Cam' : 'Show Cam';
    try {
      if (lkRoom) {
        await lkRoom.localParticipant.setCameraEnabled(camEnabled);
      } else if (localStream) {
        localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
      }
    } catch {}
  }

  // --- STT via Web Speech API ---
  function sttStart() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { const s=$("#stt-status"); if(s) s.textContent='STT not supported in this browser'; return; }
    if (sttActive) return;
    stt = new R(); stt.lang = 'en-US'; stt.interimResults = true; stt.continuous = true;
    const status = $("#stt-status"); const out = $("#stt-transcript");
    stt.onstart = () => { sttActive = true; if(status) status.textContent='Listeningâ€¦'; };
    stt.onresult = (e) => {
      let txt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        txt += e.results[i][0].transcript;
      }
      if (out) out.textContent = txt.trim();
      // send final segments to chat
      const last = e.results[e.results.length-1];
      if (last && last.isFinal && txt.trim()) {
        try { window.wsHub && window.wsHub.send({ type:'chat', payload:{ text: txt.trim() } }); } catch {}
      }
    };
    stt.onerror = () => { if (status) status.textContent = 'STT error'; };
    stt.onend = () => {
      sttActive = false;
      if (status) status.textContent = 'Idle';
      const a = document.getElementById('stt-start');
      const b = document.getElementById('stt-stop');
      if (a) a.disabled = false;
      if (b) b.disabled = true;
    };
    try { stt.start(); } catch {}
  }
  function sttStop() {
    try { stt && stt.stop(); } catch {}
  }

  // --- Mic meter via WebAudio ---
  function setupMeter() {
    try {
      if (!localStream) return;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(localStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      // optional monitor chain
      updateMicHumanizerChain(src);
      const data = new Uint8Array(analyser.fftSize);
      const fill = $("#vc-meter-fill");
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        // compute RMS
        let sum = 0;
        for (let i=0;i<data.length;i++) { const v=(data[i]-128)/128; sum += v*v; }
        const rms = Math.sqrt(sum / data.length);
        const pct = Math.min(100, Math.max(0, Math.round(rms * 200)));
        if (fill) fill.style.width = pct + '%';
        meterRAF = requestAnimationFrame(loop);
      };
      meterRAF = requestAnimationFrame(loop);
    } catch {}
  }
  function teardownMeter() {
    try { if (meterRAF) cancelAnimationFrame(meterRAF); meterRAF = null; } catch {}
    // disconnect monitor nodes
    try {
      if (monitorNodes && monitorNodes.nodes) {
        monitorNodes.nodes.forEach(n => { try { n.disconnect(); } catch{} });
      }
    } catch {}
    monitorNodes = null;
    try { if (audioCtx) audioCtx.close(); } catch {}
    audioCtx = null; analyser = null;
    const fill = $("#vc-meter-fill"); if (fill) fill.style.width = '0%';
  }

  function buildHumanizerChain(ctx, source, destination) {
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 2.3; comp.attack.value = 0.004; comp.release.value = 0.25;
      const low = ctx.createBiquadFilter(); low.type='lowshelf'; low.frequency.value=120; low.gain.value=1.0;
      const mid = ctx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=3000; mid.Q.value=1.0; mid.gain.value=-2.0;
      const high = ctx.createBiquadFilter(); high.type='highshelf'; high.frequency.value=10000; high.gain.value=1.5;
      source.connect(comp); comp.connect(low); low.connect(mid); mid.connect(high); high.connect(destination);
      return { nodes: [comp, low, mid, high] };
    } catch(e) {
      try { source.connect(destination); } catch{}
      return { nodes: [] };
    }
  }

  function updateMicHumanizerChain(srcNode) {
    try {
      const toggle = $("#vc-mic-humanize");
      if (!audioCtx || !srcNode || !toggle) return;
      // disconnect previous
      try { if (monitorNodes && monitorNodes.nodes) monitorNodes.nodes.forEach(n => { try { n.disconnect(); } catch{} }); } catch {}
      monitorNodes = null;
      // only monitor if enabled
      if (toggle.checked) {
        monitorNodes = buildHumanizerChain(audioCtx, srcNode, audioCtx.destination);
      }
    } catch {}
  }

  function persistMicHumanize() {
    const t = $("#vc-mic-humanize"); if (!t) return;
    try { const v = localStorage.getItem('vc_mic_humanize'); t.checked = v === '1'; } catch{}
    t.addEventListener('change', () => {
      try { localStorage.setItem('vc_mic_humanize', t.checked ? '1' : '0'); } catch{}
      // rebuild chain if already joined
      try {
        if (audioCtx && localStream) {
          const src = audioCtx.createMediaStreamSource(localStream);
          updateMicHumanizerChain(src);
        }
      } catch {}
    });
  }

  async function applyMicDevice() {
    try {
      const sel = $("#vc-mic-device");
      const devId = sel && sel.value ? sel.value : undefined;
      localStorage.setItem('vc_mic_id', devId || '');
      if (lkRoom) {
        // Switch microphone device in LiveKit
        await lkRoom.localParticipant.setMicrophoneEnabled(true, devId ? { deviceId: devId } : undefined);
        setStatus('Microphone applied');
      } else {
        if (!localStream) return;
        // get new audio only, keep video
        const audio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: devId ? { exact: devId } : undefined,
        };
        const newAudio = await navigator.mediaDevices.getUserMedia({ audio });
        // replace tracks
        localStream.getAudioTracks().forEach(t => localStream.removeTrack(t));
        newAudio.getAudioTracks().forEach(t => localStream.addTrack(t));
        teardownMeter(); setupMeter();
        setStatus('Microphone applied');
      }
    } catch (e) {
      setStatus('Failed to switch microphone');
    }
  }

  async function applyCamDevice() {
    try {
      const sel = $("#vc-cam-device");
      const devId = sel && sel.value ? sel.value : undefined;
      localStorage.setItem('vc_cam_id', devId || '');
      if (lkRoom) {
        await lkRoom.localParticipant.setCameraEnabled(true, devId ? { deviceId: devId } : undefined);
        setStatus('Camera applied');
      } else {
        if (!localStream) return;
        const video = devId ? { deviceId: { exact: devId } } : true;
        const newVideo = await navigator.mediaDevices.getUserMedia({ video });
        // replace tracks
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t); });
        newVideo.getVideoTracks().forEach(t => localStream.addTrack(t));
        setStatus('Camera applied');
      }
    } catch (e) {
      setStatus('Failed to switch camera');
    }
  }

  function wireConf() {
    on($("#vc-join"), 'click', async () => {
      // Try token endpoint; if available, join LiveKit; else fallback to local preview
      try {
        const res = await fetch('/api/video/token', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ room: 'conference' }) });
        if (res.ok) { const data = await res.json(); await joinLiveKit(data.url, data.token); }
        else { await startLocalPreview(); }
      } catch {
        await startLocalPreview();
      }
    });
    on($("#vc-leave"), 'click', () => {
      try { if (lkRoom) { lkRoom.disconnect(); lkRoom = null; } } catch {}
      stopLocalPreview();
    });
    on($("#vc-mic"), 'click', toggleMic);
    on($("#vc-cam"), 'click', toggleCam);
    on($("#vc-apply-mic"), 'click', applyMicDevice);
    try { enumerateMics(); enumerateCams(); } catch {}
    persistMicHumanize();

    on($("#stt-start"), 'click', sttStart);
    on($("#stt-stop"), 'click', sttStop);
    on($("#vc-apply-cam"), 'click', applyCamDevice);
  }

  document.addEventListener('DOMContentLoaded', wireConf);
  // Apply production mix to monitor
  window.addEventListener('pub:production_state', (ev)=>{
    try {
      const st = ev.detail || {};
      setupMonitor(); const ctx=ensureMonCtx(); if(!ctx || !monReady) return;
      const lv = (st.audio_levels||{});
      if (monProgram && typeof lv.program==='number') monProgram.gain.value = Math.max(0, Math.min(1, lv.program/100));
      if (monHosts && typeof lv.hosts==='number') monHosts.gain.value = Math.max(0, Math.min(1, lv.hosts/100));
      if (monMusic && typeof lv.music==='number') monMusic.gain.value = Math.max(0, Math.min(1, lv.music/100));
      if (monMaster && typeof st.monitor_gain==='number') monMaster.gain.value = Math.max(0, Math.min(1, st.monitor_gain/100));
      if (typeof st.monitor_enabled==='boolean') { if (st.monitor_enabled) { try { ctx.resume && ctx.resume(); } catch{} } else { try { ctx.suspend && ctx.suspend(); } catch{} } }

      // Censor bleep cue
      if (st.censor && st.censor.active) {
        const t = Number(st.censor.t||0);
        if (!window.__lastBleepT || window.__lastBleepT !== t) {
          window.__lastBleepT = t;
          try {
            const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=1000;
            const g = ctx.createGain(); g.gain.value=0.0001; // start low for clickless
            osc.connect(g); g.connect(monProgram||monMaster);
            osc.start();
            const dur = Math.max(0.1, Math.min(5.0, (st.censor.duration_ms||800)/1000));
            g.gain.linearRampToValueAtTime(0.7, ctx.currentTime+0.02);
            g.gain.linearRampToValueAtTime(0.7, ctx.currentTime+dur-0.03);
            g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime+dur);
            setTimeout(()=>{ try{ osc.stop(); g.disconnect(); }catch{} }, Math.ceil(dur*1000)+40);
          } catch{}
        }
      }
      // Emergency: quick fade to black overlay on program monitor if present
      if (st.emergency && st.emergency.active) {
        try{
          const v = document.getElementById('pgm-monitor');
          if (v && !document.getElementById('pgm-blackout')){
            const blk = document.createElement('div'); blk.id='pgm-blackout'; blk.style.position='absolute'; blk.style.inset='0'; blk.style.background='#000'; blk.style.opacity='0'; blk.style.transition='opacity 200ms linear';
            const wrap = v.parentElement; if (wrap){ wrap.style.position='relative'; wrap.appendChild(blk); requestAnimationFrame(()=>{ blk.style.opacity='1'; }); }
          }
        }catch{}
      }
    } catch{}
  });
})();







  // Expose monitor attach for external media elements
  window.pubcastAddMonitorElement = function(el, role){ try { setupMonitor(); const ctx=ensureMonCtx(); if(!ctx||!el) return; if (monSources.has(el)) return; const src = ctx.createMediaElementSource(el); if (role==='music') src.connect(monMusic||monHosts); else src.connect(monHosts); monSources.set(el,true); } catch{} };


