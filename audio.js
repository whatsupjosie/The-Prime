// Audio Post-Production panel wiring
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function adminKey(){ try { return localStorage.getItem('pubcast_admin_key') || ''; } catch{ return ''; } }
  function setAdminKey(k){ try { localStorage.setItem('pubcast_admin_key', k || ''); } catch{} }

  async function jfetch(url, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    const key = adminKey(); if (key) headers['X-Admin-Key'] = key;
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) { const t = await res.text().catch(()=>" "); throw new Error(`${res.status} ${t}`); }
    return res.json();
  }

  async function loadPresets(){
    try {
      const sel = $('#au-preset'); if (!sel) return;
      const js = await fetch('/api/audio/presets').then(r=>r.ok?r.json():{presets:{}}).catch(()=>({presets:{}}));
      sel.innerHTML = '';
      const presets = js.presets || {};
      Object.entries(presets).forEach(([id, meta]) => {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = `${meta.label||id}`; sel.appendChild(opt);
      });
    } catch {}
  }

  async function runPatch(){
    const body = {
      path: $('#au-src')?.value || '',
      preset: $('#au-preset')?.value || '',
      start_ms: Number($('#au-start')?.value || '') || undefined,
      end_ms: Number($('#au-end')?.value || '') || undefined,
      export_mux_video: !!($('#au-mux')?.checked),
    };
    if (!body.path || !body.preset) return toast('Source and preset required','warn');
    try { const js = await jfetch('/api/audio/patch', { method:'POST', body: JSON.stringify(body) }); toast(`Patch started: ${js.job_id}`,'ok'); await refreshJobs(); } catch(e){ toast('Patch failed','err'); }
  }

  async function runReplace(){
    const body = {
      video_path: $('#au-video')?.value || '',
      audio_path: $('#au-audio')?.value || '',
      offset_ms: Number($('#au-offset')?.value || '0') || 0,
    };
    if (!body.video_path || !body.audio_path) return toast('Video and audio required','warn');
    try { const js = await jfetch('/api/audio/replace', { method:'POST', body: JSON.stringify(body) }); toast(`Replace started: ${js.job_id}`,'ok'); await refreshJobs(); } catch(e){ toast('Replace failed','err'); }
  }

  async function runMux(){
    const body = {
      video_path: $('#au-video')?.value || '',
      audio_path: $('#au-audio')?.value || '',
      offset_ms: Number($('#au-offset')?.value || '0') || 0,
      output_name: ($('#au-outname')?.value || '').trim() || undefined,
    };
    if (!body.video_path || !body.audio_path) return toast('Video and audio required','warn');
    try { const js = await jfetch('/api/audio/mux', { method:'POST', body: JSON.stringify(body) }); toast(`Mux started: ${js.job_id}`,'ok'); await refreshJobs(); } catch(e){ toast('Mux failed','err'); }
  }

  async function refreshJobs(){
    try {
      const host = $('#au-jobs'); if (!host) return;
      const js = await fetch('/api/audio/status').then(r=>r.ok?r.json():{jobs:[]}).catch(()=>({jobs:[]}));
      const jobs = (js.jobs||[]).slice().sort((a,b)=>(b.started||0)-(a.started||0));
      host.innerHTML='';
      if (!jobs.length) { host.textContent = 'No jobs.'; return; }
      jobs.forEach(j => {
        const row = document.createElement('div');
        row.style.display='flex'; row.style.alignItems='center'; row.style.justifyContent='space-between'; row.style.gap='8px'; row.style.padding='4px 0';
        const left = document.createElement('div');
        left.innerHTML = `<strong>${j.type||'job'}</strong> <span class="muted">${j.status||'pending'}</span> ${j.progress!=null?`<span class="muted">${j.progress}%</span>`:''} <span class="muted small">${j.output||j.source||''}</span>`;
        const right = document.createElement('div');
        const cancel = document.createElement('button'); cancel.textContent='Cancel'; cancel.className='ghost'; cancel.disabled = !j.running;
        const del = document.createElement('button'); del.textContent='Delete'; del.className='ghost danger'; del.disabled = !!j.running;
        cancel.addEventListener('click', async ()=>{ try { await jfetch(`/api/audio/jobs/${encodeURIComponent(j.job_id)}/cancel`, { method:'POST' }); await refreshJobs(); } catch(e){ toast('Cancel failed','err'); } });
        del.addEventListener('click', async ()=>{ try { await jfetch(`/api/audio/jobs/${encodeURIComponent(j.job_id)}`, { method:'DELETE' }); await refreshJobs(); } catch(e){ toast('Delete failed','err'); } });
        right.appendChild(cancel); right.appendChild(del);
        row.appendChild(left); row.appendChild(right);
        host.appendChild(row);
      });
    } catch{}
  }

  function wire(){
    const save = $('#admin-key-save');
    on(save, 'click', ()=>{ const k=$('#admin-key')?.value||''; setAdminKey(k); const s=$('#admin-key-status'); if(s){ s.textContent='Saved'; setTimeout(()=>{s.textContent='';}, 1200); } });
    on($('#au-run-patch'),'click', runPatch);
    on($('#au-run-replace'),'click', runReplace);
    on($('#au-run-mux'),'click', runMux);
    loadPresets(); refreshJobs(); setInterval(refreshJobs, 3000);
    try { const k=adminKey(); if(k) { const i=$('#admin-key'); if(i) i.value=k; } } catch{}
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
