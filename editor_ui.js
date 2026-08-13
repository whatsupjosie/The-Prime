// Lightweight Editor UI: bin, viewer I/O, simple timeline, export via existing APIs
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  let binItems = [];
  let currentPath = null; let markIn = null; let markOut = null;
  const adminKey = () => { try { return localStorage.getItem('pubcast_admin_key')||''; } catch { return ''; } };

  async function loadBin(){
    const withMeta = $('#ed-meta')?.checked;
    const res = await fetch(`/api/media?include_metadata=${withMeta?'true':'false'}`);
    const js = res.ok ? await res.json() : { items: [] };
    binItems = js.items || [];
    renderBin();
  }

  function renderBin(){
    const list = $('#ed-bin'); if (!list) return;
    const q = ($('#ed-search')?.value||'').trim().toLowerCase();
    list.innerHTML = '';
    binItems
      .filter(it => !q || (it.name||'').toLowerCase().includes(q) || (it.path||'').toLowerCase().includes(q))
      .slice(0, 200)
      .forEach(it => {
        const row = document.createElement('div'); row.className='pc-mono'; row.style.cursor='pointer'; row.style.padding='4px 0';
        row.textContent = `${it.name}  ${it.duration_str?('['+it.duration_str+']'):''}`;
        row.addEventListener('click', ()=> selectBin(it));
        list.appendChild(row);
      });
  }

  function selectBin(it){
    currentPath = it.path; markIn = null; markOut = null; updateIO();
    const v = $('#ed-view'); if(v){ v.src = `/data/${it.path}`.replace(/\/+data\//,'/data/'); v.load(); try { v.play(); } catch{} }
  }

  function updateIO(){ const el=$('#ed-io'); if(el) el.textContent = `In: ${markIn??'—'} Out: ${markOut??'—'}`; }

  function timelineItem(path){
    const wrap = document.createElement('div'); wrap.className='pc-mono'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.justifyContent='space-between';
    const left = document.createElement('span'); left.textContent = path; wrap.appendChild(left);
    const btns = document.createElement('span');
    const up = document.createElement('button'); up.textContent='↑'; up.className='small ghost';
    const down = document.createElement('button'); down.textContent='↓'; down.className='small ghost';
    const del = document.createElement('button'); del.textContent='Remove'; del.className='small ghost';
    btns.appendChild(up); btns.appendChild(down); btns.appendChild(del); wrap.appendChild(btns);
    up.addEventListener('click',()=> moveTimeline(wrap,-1));
    down.addEventListener('click',()=> moveTimeline(wrap,1));
    del.addEventListener('click',()=> wrap.remove());
    return wrap;
  }

  function moveTimeline(node, dir){ const parent = $('#ed-timeline'); if(!parent) return; const sib = dir<0? node.previousElementSibling : node.nextElementSibling; if (!sib) return; if (dir<0) parent.insertBefore(node, sib); else parent.insertBefore(sib, node); }

  function addSubclip(){
    if (!currentPath) return;
    const tl = $('#ed-timeline'); if (!tl) return;
    // Store as data for later export; visible text is the final path or template
    const data = { path: currentPath, in: markIn, out: markOut };
    const row = timelineItem(`${currentPath}${(markIn!=null||markOut!=null)?` [${markIn||0}-${markOut||''}]`:''}`);
    row.dataset.clip = JSON.stringify(data);
    tl.appendChild(row); markIn=null; markOut=null; updateIO();
  }

  async function exportTimeline(){
    const tl = $('#ed-timeline'); const status = $('#ed-status');
    if (!tl) return;
    const nodes = Array.from(tl.children||[]);
    if (!nodes.length) { if(status) status.textContent='Timeline is empty'; return; }
    const exportName = ($('#ed-export-name')?.value||'final_edit.mp4').trim();
    // Build final files list, trimming any in/out first (sequentially)
    const outFiles = [];
    for (const node of nodes){
      let clip = {}; try { clip = JSON.parse(node.dataset.clip||'{}'); } catch{}
      if (clip && (clip.in!=null || clip.out!=null)){
        const body = { path: clip.path, start_ms: Number(clip.in||0), end_ms: Number(clip.out||0), output_name: undefined };
        const res = await fetch('/api/edit/trim', { method:'POST', headers:{ 'Content-Type':'application/json','X-Admin-Key': adminKey() }, body: JSON.stringify(body) });
        const js = res.ok ? await res.json() : null; const job = js && js.job_info; if(!job){ if(status) status.textContent='Trim failed'; return; }
        // poll until done
        const jobId = js.job_id;
        let done=false, last='';
        while(!done){
          await new Promise(r=>setTimeout(r, 800));
          const sres = await fetch('/api/edit/status'); const sjs = sres.ok? await sres.json() : { jobs: [] };
          const j = (sjs.jobs||[]).find(j=>j.job_id===jobId); if(j){ last = j.status; if(!j.running) { done=true; if(j.status==='completed') outFiles.push(j.output); else { if(status) status.textContent=`Trim error: ${j.status}`; return; } } }
          else { done=true; }
        }
      } else {
        outFiles.push(clip.path || node.textContent.trim());
      }
    }
    // Now concatenate
    const cres = await fetch('/api/edit/concatenate', { method:'POST', headers:{ 'Content-Type':'application/json','X-Admin-Key': adminKey() }, body: JSON.stringify({ paths: outFiles, re_encode: true, output_name: exportName }) });
    const cjs = cres.ok? await cres.json() : null; if(status) status.textContent = cjs? `Export started: ${cjs.job_id}` : 'Export failed';
  }

  function wire(){
    if (!document.getElementById('station-editor')) return; // not on this page
    on($('#ed-refresh'),'click', loadBin);
    on($('#ed-meta'),'change', loadBin);
    on($('#ed-search'),'input', renderBin);
    on($('#ed-mark-in'),'click', ()=>{ const v=$('#ed-view'); if(v){ markIn = Math.max(0, Math.floor((v.currentTime||0)*1000)); updateIO(); }});
    on($('#ed-mark-out'),'click', ()=>{ const v=$('#ed-view'); if(v){ markOut = Math.max(0, Math.floor((v.currentTime||0)*1000)); updateIO(); }});
    on($('#ed-add-subclip'),'click', addSubclip);
    on($('#ed-export'),'click', exportTimeline);
    // J/K/L bindings
    document.addEventListener('keydown', (e)=>{
      const v = $('#ed-view'); if(!v || v.closest('#station-editor').classList.contains('hidden')) return;
      if(e.target && ['input','textarea','select'].includes(String(e.target.tagName||'').toLowerCase())) return;
      if(e.key==='j'){ v.playbackRate = 1.0; v.currentTime = Math.max(0, v.currentTime - 1.0); e.preventDefault(); }
      else if(e.key==='k'){ v.pause(); e.preventDefault(); }
      else if(e.key==='l'){ v.playbackRate = 1.0; try{ v.play(); }catch{} e.preventDefault(); }
      else if(e.key==='i' || e.key==='I'){ $('#ed-mark-in')?.click(); e.preventDefault(); }
      else if(e.key==='o' || e.key==='O'){ $('#ed-mark-out')?.click(); e.preventDefault(); }
    });
    loadBin().catch(()=>{});
  }

  document.addEventListener('DOMContentLoaded', wire);
})();

