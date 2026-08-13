// Server TTS (Azure) + Humanizer + Auto-speak via MutationObserver
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  let ctx = null;
  function ensureCtx(){ if(!ctx){ ctx = new (window.AudioContext || window.webkitAudioContext)(); } return ctx; }

  function applyHumanizerChain(ctx, source, destination){
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.003; comp.release.value = 0.25;
      const low = ctx.createBiquadFilter(); low.type='lowshelf'; low.frequency.value=120; low.gain.value=1.0;
      const mid = ctx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=3000; mid.Q.value=1.0; mid.gain.value=-2.0;
      const high = ctx.createBiquadFilter(); high.type='highshelf'; high.frequency.value=10000; high.gain.value=2.0;
      source.connect(comp); comp.connect(low); low.connect(mid); mid.connect(high); high.connect(destination);
      return true;
    } catch(e){ try { source.connect(destination); } catch{} return false; }
  }

  function browserSpeak(text){
    try {
      if(!window.speechSynthesis || !text) return;
      const u = new SpeechSynthesisUtterance(String(text));
      const voices = speechSynthesis.getVoices();
      const vsel = $("#tts-voice");
      let chosen = null;
      if (vsel && vsel.value) { chosen = voices.find(v => v.voiceURI === vsel.value || v.name === vsel.value) || null; }
      if (!chosen) chosen = voices.find(v => (v.lang||'').toLowerCase().startsWith('en')) || voices[0];
      if (chosen) u.voice = chosen;
      u.rate = 1.0; u.pitch = 1.0;
      speechSynthesis.speak(u);
    } catch{}
  }

  async function serverSpeak(text){
    try {
      const payload = { text: String(text||'') };
      const vsel = $("#tts-voice"); if (vsel && vsel.value) payload.voice = vsel.value;
      const res = await fetch('/api/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if (!res.ok) throw new Error(String(res.status));
      const js = await res.json();
      const b64 = js && js.audio_b64; if (!b64) throw new Error('no-audio');
      const raw = atob(b64);
      const buf = new ArrayBuffer(raw.length); const view = new Uint8Array(buf);
      for (let i=0;i<raw.length;i++) view[i]=raw.charCodeAt(i);
      const audioCtx = ensureCtx();
      const audioBuf = await audioCtx.decodeAudioData(buf.slice(0));
      const src = audioCtx.createBufferSource(); src.buffer=audioBuf;
      try { src.playbackRate.setValueAtTime(1.0 + (Math.random()*0.02 - 0.01), audioCtx.currentTime); } catch{}
      const humanize = $("#tts-humanize");
      if (humanize && humanize.checked) applyHumanizerChain(audioCtx, src, audioCtx.destination); else src.connect(audioCtx.destination);
      src.start();
    } catch(e){ browserSpeak(text); }
  }

  function populateVoices(){
    const sel = $("#tts-voice"); if (!sel || !window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices() || [];
    const prev = localStorage.getItem('tts_voice_uri') || '';
    sel.innerHTML='';
    voices.forEach(v => { const opt=document.createElement('option'); opt.value = v.voiceURI || v.name; opt.textContent = `${v.name} (${v.lang})`; if (prev && (prev===v.voiceURI || prev===v.name)) opt.selected = true; sel.appendChild(opt); });
  }

  function autoSpeakSetup(){
    const log = $("#chat-log"); if (!log) return;
    let lastCount = 0;
    const obs = new MutationObserver(() => {
      const auto = $("#tts-autoplay"); const serv = $("#tts-server");
      if (!auto || !auto.checked) return;
      const rows = log.children; if (!rows || !rows.length) { lastCount=0; return; }
      const newRows = Array.from(rows).slice(lastCount);
      lastCount = rows.length;
      newRows.forEach(r => {
        try {
          const txtEl = r.querySelector('.chat-text'); const text = txtEl ? txtEl.textContent : r.textContent;
          if (!text || !text.trim()) return;
          const botsOnly = document.querySelector('#tts-bots-only'); const speakIt = !botsOnly || !botsOnly.checked || (r.classList && r.classList.contains('bot')); if (!speakIt) return; if (serv && serv.checked) serverSpeak(text.trim()); else browserSpeak(text.trim());
        } catch{}
      });
    });
    obs.observe(log, { childList: true });
  }

  function persistToggles(){
    const pairs = [ ['tts_autoplay','#tts-autoplay'], ['tts_bots_only','#tts-bots-only'], ['tts_server','#tts-server'], ['tts_humanize','#tts-humanize'] ];
    pairs.forEach(([key, sel]) => { const el=$(sel); if (el) { try { const v=localStorage.getItem(key); el.checked = v==='1'; } catch{}; on(el,'change',()=>{ try{ localStorage.setItem(key, el.checked?'1':'0'); } catch{} }); } });
    const vsel = $("#tts-voice"); if (vsel) { on(vsel,'change',()=>{ try{ localStorage.setItem('tts_voice_uri', vsel.value||''); }catch{} }); }
  }

  function wireSpeakButton(){
    const btn=$("#tts-say"), input=$("#tts-text"); if (!btn||!input) return;
    on(btn,'click',()=>{ const t=input.value||''; const serv=$("#tts-server"); if (serv && serv.checked) serverSpeak(t); else browserSpeak(t); });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    try { if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = populateVoices; populateVoices(); } } catch{}
    persistToggles();
    wireSpeakButton();
    autoSpeakSetup();
  });
})();


