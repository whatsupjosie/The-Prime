// Control Room: stations switching and actions
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function showStation(id){
    const ids=['director','audio','editor','chyron','prompter','vtr'];
    ids.forEach(s=>{ const el=$('#station-'+s); if(el) el.classList.toggle('hidden', s!==id); });
    // highlight button
    (document.querySelectorAll('#stations-bar button')||[]).forEach(b=>{
      b.classList.toggle('active', (b.dataset.station===id));
    });
  }

  async function postProd(patch){
    try{ await fetch('/api/state/production', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) }); toast('Applied','ok'); }catch{ toast('Failed','err'); }
  }

  // Summon logic
  const origSlots = new Map(); // stationId -> { parent, next }
  function summon(stationId){
    try{
      const node = document.getElementById('station-'+stationId);
      const dockBtn = document.querySelector(`.dock-btn[data-summon="${stationId}"]`);
      const area = document.getElementById('summoned-area');
      if (!node || !area) return;
      const already = area.contains(node);
      if (already){ // unsummon
        const meta = origSlots.get(stationId);
        if (meta && meta.parent){
          if (meta.next && meta.next.parentNode===meta.parent){ meta.parent.insertBefore(node, meta.next); }
          else { meta.parent.appendChild(node); }
        }
        node.classList.remove('summoned');
        dockBtn && dockBtn.classList.remove('active');
        updateArms();
        return;
      }
      // store original slot
      if (!origSlots.has(stationId)){
        origSlots.set(stationId, { parent: node.parentNode, next: node.nextSibling });
      }
      area.appendChild(node);
      node.classList.add('summoned');
      dockBtn && dockBtn.classList.add('active');
      updateArms();
    }catch{}
  }

  // Brass robot arms: draw SVG paths from dock to summoned panels
  function armLayer(){
    let svg = document.getElementById('dock-arm-layer');
    if (!svg){
      svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id='dock-arm-layer'; svg.setAttribute('style','position:fixed;inset:0;pointer-events:none;z-index:9940');
      document.body.appendChild(svg);
    }
    return svg;
  }
  function updateArms(){
    try{
      const area = document.getElementById('summoned-area'); if(!area) return;
      const dock = document.getElementById('director-dock'); if(!dock) return;
      const svg = armLayer();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const dockRect = dock.getBoundingClientRect();
      const dockPt = { x: dockRect.left + dockRect.width/2, y: dockRect.top + 10 };
      Array.from(area.children).forEach((panel, idx)=>{
        const r = panel.getBoundingClientRect();
        const target = { x: r.left + Math.min(60, r.width*0.4), y: r.top + 10 };
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        const midX = (dockPt.x + target.x)/2; const midY = Math.min(dockPt.y, target.y) - 40 - (idx*8);
        const d = `M ${dockPt.x},${dockPt.y} C ${midX},${midY} ${midX},${midY} ${target.x},${target.y}`;
        path.setAttribute('d', d);
        path.setAttribute('fill','none');
        path.setAttribute('stroke','url(#armGrad)');
        path.setAttribute('stroke-width','6');
        path.setAttribute('stroke-linecap','round');
        path.setAttribute('stroke-opacity','0.9');
        const len = 600; path.setAttribute('stroke-dasharray', String(len)); path.setAttribute('stroke-dashoffset', String(len));
        svg.appendChild(path);
        // animate draw
        requestAnimationFrame(()=>{ path.style.transition='stroke-dashoffset 280ms ease-out'; path.setAttribute('stroke-dashoffset','0'); });

        // End joints (hinges)
        const startJ = document.createElementNS('http://www.w3.org/2000/svg','g'); startJ.setAttribute('class','arm-joint');
        const c1 = document.createElementNS('http://www.w3.org/2000/svg','circle'); c1.setAttribute('cx', String(dockPt.x)); c1.setAttribute('cy', String(dockPt.y)); c1.setAttribute('r','6');
        startJ.appendChild(c1); svg.appendChild(startJ);
        const endJ = document.createElementNS('http://www.w3.org/2000/svg','g'); endJ.setAttribute('class','arm-joint');
        const c2 = document.createElementNS('http://www.w3.org/2000/svg','circle'); c2.setAttribute('cx', String(target.x)); c2.setAttribute('cy', String(target.y)); c2.setAttribute('r','6');
        endJ.appendChild(c2); svg.appendChild(endJ);
      });
      // defs gradient
      if (!document.getElementById('armGrad')){
        const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
        const lg = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
        lg.id='armGrad'; lg.setAttribute('x1','0'); lg.setAttribute('y1','0'); lg.setAttribute('x2','1'); lg.setAttribute('y2','1');
        const s1 = document.createElementNS('http://www.w3.org/2000/svg','stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#a67c33');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg','stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#c7ab5c');
        lg.appendChild(s1); lg.appendChild(s2); defs.appendChild(lg);
        const rg = document.createElementNS('http://www.w3.org/2000/svg','radialGradient');
        rg.id='armJointGrad';
        const j1 = document.createElementNS('http://www.w3.org/2000/svg','stop'); j1.setAttribute('offset','0%'); j1.setAttribute('stop-color','#d6b856');
        const j2 = document.createElementNS('http://www.w3.org/2000/svg','stop'); j2.setAttribute('offset','100%'); j2.setAttribute('stop-color','#6c5a2b');
        rg.appendChild(j1); rg.appendChild(j2); defs.appendChild(rg); svg.appendChild(defs);
      }
    }catch{}
  }

  function wire(){
    const bar=$('#stations-bar'); if(!bar) return;
    // Optional: enable steampunk theme on Control view
    try { document.body.classList.add('steam'); } catch{}
    // Buttons
    (document.querySelectorAll('#stations-bar button')||[]).forEach(btn=> on(btn,'click',()=>showStation(btn.dataset.station)));
    showStation('director');

    // Dock buttons
    (document.querySelectorAll('#director-dock .dock-btn')||[]).forEach(b=> on(b,'click',()=> summon(b.dataset.summon)));

    // Mixer apply
    on($('#mixer-apply'),'click',()=>{
      const levels={ program: Number($('#mixer-program')?.value||'80'), hosts: Number($('#mixer-hosts')?.value||'85'), music: Number($('#mixer-music')?.value||'60') };
      const duck = !!(document.querySelector('#mixer-afv') && document.querySelector('#mixer-afv').checked);
      postProd({ audio_levels: levels, audio_duck: duck, monitor_enabled: (!!document.querySelector('#mixer-monitor') && document.querySelector('#mixer-monitor').checked), monitor_gain: Number((document.querySelector('#mixer-monitor-level')||{}).value||'80') });
    });

    // Editor quick trim
    on($('#ed-trim-btn'),'click', async()=>{
      const path=($('#ed-path')?.value||'').trim(); const start=parseInt($('#ed-start')?.value||'0',10); const end=parseInt($('#ed-end')?.value||'0',10);
      if(!path||end<=start) return toast('Path and valid range required','warn');
      try{ await fetch('/api/edit/trim', { method:'POST', headers:{'Content-Type':'application/json','X-Admin-Key': (localStorage.getItem('pubcast_admin_key')||'') }, body: JSON.stringify({ path, start_ms:start, end_ms:end }) }); toast('Trim started','ok'); }catch{ toast('Trim failed','err'); }
    });

    // Chyron apply
    on($('#chy-apply'),'click',()=>{
      const lower=$('#chy-lower')?.value||''; const bug=($('#chy-bug')?.value||'');
      postProd({ lower_third: lower, bug });
    });

    // Teleprompter controls
    on($('#pro-start'),'click',()=>{
      const script=$('#pro-script')?.value||''; const speed=Number($('#pro-speed')?.value||'5');
      postProd({ teleprompter: { started: true, script, speed, position: 0 } });
    });
    on($('#pro-stop'),'click',()=> postProd({ teleprompter: { started: false } }));

    // VTR controls
    on($('#vtr-load'),'click',()=>{
      const asset=($('#vtr-asset')?.value||'').trim(); if(!asset) return; postProd({ replay_asset: asset });
    });
    on($('#vtr-play'),'click',()=>{
      const asset=($('#vtr-asset')?.value||'').trim(); if(!asset) return; postProd({ mode:'REPLAY', on_air:true, replay_asset: asset });
    });
    on($('#vtr-stop'),'click',()=> postProd({ mode:'LIVE' }));

    // Quick Macros
    on($('#qx-open'),'click',()=> postProd({ mode:'LIVE', on_air:true, camera:'wide', lower_third:'', bug:'', audio_levels:{ program:80, hosts:85, music:55 } }));
    on($('#qx-interview'),'click',()=> postProd({ mode:'LIVE', on_air:true, camera:'closeup', lower_third:'Interview', audio_levels:{ program:80, hosts:85, music:40 } }));
    on($('#qx-commercial'),'click',()=>{
      const asset=($('#vtr-asset')?.value||'').trim();
      postProd({ mode:'REPLAY', on_air:true, replay_asset: asset||'/assets/vod/sample.mp4', audio_levels:{ program:80, hosts:0, music:60 } });
    });
    on($('#qx-end'),'click',()=> postProd({ mode:'LIVE', on_air:false, lower_third:'', bug:'Thanks for watching', audio_levels:{ program:70, hosts:0, music:50 } }));

    // Censor / Emergency
    on($('#qx-bleep'),'click',()=>{ const ms = Number($('#qx-bleep-ms')?.value||'800'); postProd({ censor:{ active:true, duration_ms: Math.max(100, Math.min(5000, ms)), t: Date.now() } }); });
    on($('#qx-ohshit'),'click',()=>{ postProd({ emergency:{ active:true, t: Date.now() }, fade_to_black:true, mute_program:true }); });

    // Hotkeys inside Control: Alt+1..6 switches stations
    document.addEventListener('keydown', (e)=>{
      if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      const map=['director','audio','editor','chyron','prompter','vtr'];
      if(n>=1 && n<=map.length){ showStation(map[n-1]); e.preventDefault(); }
    });

    // Summon hotkeys: Ctrl+1..6
    document.addEventListener('keydown', (e)=>{
      if (!e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      const n = Number(e.key); const map=['director','audio','editor','chyron','prompter','vtr'];
      if(n>=1 && n<=map.length){ summon(map[n-1]); e.preventDefault(); }
    });
  }

  // toast bridge
  function toast(msg,type){ try{ if(window.toast) return window.toast(msg,type); } catch{} }

  document.addEventListener('DOMContentLoaded', wire);
})();


\n  // Attach replay video to monitor when production state changes\n  window.addEventListener('pub:production_state', (ev)=>{ try { const st = ev.detail||{}; const vid = document.getElementById('replay-video'); if(!vid) return; if (st.replay_asset){ const url = (st.replay_asset.startsWith('/'))? st.replay_asset : st.replay_asset; if (vid.src !== url){ vid.src = url; vid.load(); try{ vid.play(); }catch{} } vid.muted = true; if (window.pubcastAddMonitorElement) window.pubcastAddMonitorElement(vid,'music'); } } catch{} });\n

  // PTZ preset save/trigger
  function savePreset(key){ const cam=(document.getElementById('ptz-cam')?.value||'cam1').trim(); const label=(document.getElementById('ptz-'+key+'-label')?.value||'').trim(); const ms=Number(document.getElementById('ptz-'+key+'-time')?.value||'0'); if(!cam||!label||!ms) return toast('Fill camera, label, time','warn'); const bundle={}; bundle[cam] = {}; bundle[cam][key.toUpperCase()] = { label, duration_ms: ms }; postProd({ camera_presets: bundle }); }
  function goPreset(key){ const cam=(document.getElementById('ptz-cam')?.value||'cam1').trim(); if(!cam) return; postProd({ camera_take_preset: { camera_id: cam, preset: key.toUpperCase() } }); }
  (function(){ try{ document.getElementById('ptz-save-a')?.addEventListener('click', ()=> savePreset('a')); document.getElementById('ptz-save-b')?.addEventListener('click', ()=> savePreset('b')); document.getElementById('ptz-go-a')?.addEventListener('click', ()=> goPreset('a')); document.getElementById('ptz-go-b')?.addEventListener('click', ()=> goPreset('b')); }catch{} })();

