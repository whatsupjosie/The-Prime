
// UI utilities: view switching, drawer
export function switchView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => 'view-'+b.dataset.room === id);
  if (btn) btn.classList.add('active');
}

export function setupDrawer() {
  const drawer = document.getElementById('chat-drawer');
  const tab = document.getElementById('drawer-tab');
  tab.addEventListener('click', () => drawer.classList.toggle('open'));
}
