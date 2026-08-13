async function fetchJSON(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function refreshRecBadge() {
  try {
    const data = await fetchJSON('/api/recordings/sessions');
    const sessions = data.sessions || [];
    const active = sessions.filter(s => (s.state || '').toLowerCase() === 'active');
    const countEl = document.getElementById('rec-count');
    if (countEl) countEl.textContent = String(active.length);
  } catch (err) {
    // ignore
  }
}

async function globalMark() {
  try {
    const data = await fetchJSON('/api/recordings/sessions');
    const sessions = data.sessions || [];
    const target = sessions.find(s => (s.state || '').toLowerCase() === 'active');
    if (!target) return;
    const label = prompt('Label this moment:', 'highlight');
    if (!label) return;
    await fetchJSON('/api/recordings/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: target.session_id, label }),
    });
  } catch (err) {
    console.warn('Global mark failed', err);
  }
}

document.getElementById('global-mark')?.addEventListener('click', globalMark);
refreshRecBadge();
setInterval(refreshRecBadge, 3000);

