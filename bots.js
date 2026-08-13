// Co-host bot helpers: list/reload/delete and speak-as-bot UI
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  async function jfetch(url, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) { const t = await res.text().catch(()=>""); throw new Error(`${res.status} ${t}`); }
    return res.json();
  }

  async function refreshBots(){
    const listEl = $("#bot-list");
    const speakSel = $("#bot-speak-id");
    if (speakSel) speakSel.innerHTML = '';
    if (listEl) listEl.innerHTML = '<li class="muted">Loading…</li>';
    try {
      const data = await jfetch('/api/bots');
      if (listEl) listEl.innerHTML = '';
      (data.bots||[]).forEach(b => {
        if (listEl) {
          const li = document.createElement('li');
          li.style.display='flex'; li.style.alignItems='center'; li.style.gap='8px';
          const name = document.createElement('strong'); name.textContent = b.display_name;
          const meta = document.createElement('span'); meta.className='muted'; meta.textContent = `${b.bot_id||b.agent_id} · ${b.provider} · ${b.model||''}`;
          const del = document.createElement('button'); del.textContent='Delete'; del.className='ghost danger';
          del.addEventListener('click', async () => { try { await jfetch(`/api/bots/${encodeURIComponent(b.bot_id||b.agent_id)}`, { method:'DELETE' }); await refreshBots(); } catch(e){ console.warn(e); } });
          li.appendChild(name); li.appendChild(meta); li.appendChild(del);
          listEl.appendChild(li);
        }
        if (speakSel) {
          const opt = document.createElement('option');
          opt.value = b.bot_id || b.agent_id; opt.textContent = `${b.display_name} (${b.provider})`;
          speakSel.appendChild(opt);
        }
      });
      if (listEl && !listEl.children.length) listEl.innerHTML = '<li class="muted">No co-hosts yet.</li>';
    } catch(e){ if (listEl) listEl.innerHTML = '<li class="muted">Bot API not available.</li>'; }
  }

  function wire(){
    const reloadBtn = $("#bot-reload");
    on(reloadBtn, 'click', async () => { try { await jfetch('/api/bots/reload', { method:'POST' }); await refreshBots(); } catch(e){ console.warn(e); } });

    const speakBtn = $("#bot-speak-btn");
    const speakSel = $("#bot-speak-id");
    const speakRoom = $("#bot-speak-room");
    const speakText = $("#bot-speak-text");
    on(speakBtn, 'click', async () => {
      const botId = speakSel && speakSel.value; const room = (speakRoom && speakRoom.value) || 'control'; const text = (speakText && speakText.value || '').trim();
      if (!botId || !text) return;
      try { await jfetch('/api/bots/say', { method:'POST', body: JSON.stringify({ room, bot_id: botId, text }) }); if (speakText) speakText.value=''; } catch(e){ console.warn(e); }
    });

    // Save Co-host form
    const form = $("#bot-form");
    on(form, 'submit', async (e) => {
      e.preventDefault();
      try {
        const selRooms = Array.from($("#bot-rooms")?.selectedOptions || []).map(o=>o.value);
        const body = {
          agent_id: $("#bot-id")?.value.trim(),
          display_name: $("#bot-name")?.value.trim(),
          provider: $("#bot-provider")?.value,
          model: $("#bot-model")?.value.trim(),
          key_env: $("#bot-key")?.value.trim(),
          rooms: selRooms,
          system_prompt: $("#bot-system")?.value || "",
          options: {
            auto_reply: $("#bot-auto")?.checked || false,
            respond_on_mention: $("#bot-mention")?.checked || false,
            shadow_in_roster: $("#bot-shadow")?.checked || false,
          },
        };
        if (!body.agent_id || !body.display_name || !body.provider || !body.model || !body.key_env) return;
        await jfetch('/api/bots', { method:'POST', body: JSON.stringify(body) });
        await refreshBots();
      } catch(e){ console.warn(e); }
    });

    refreshBots();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();

