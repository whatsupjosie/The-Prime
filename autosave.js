// Minimal autosave UI helper
// Exposes: checkAutosaveOnOpen(projectSlug)

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ensureBannerRoot() {
  let root = document.getElementById('autosave-banner');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'autosave-banner';
  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.right = '0';
  root.style.bottom = '56px';
  root.style.zIndex = '1000';
  root.style.display = 'none';
  document.body.appendChild(root);
  return root;
}

function renderBanner({ onRestore, onDismiss }) {
  const root = ensureBannerRoot();
  root.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.margin = '0 auto';
  panel.style.maxWidth = '920px';
  panel.style.background = 'rgba(16, 21, 33, 0.95)';
  panel.style.border = '1px solid rgba(255,255,255,0.15)';
  panel.style.borderRadius = '10px';
  panel.style.padding = '12px 16px';
  panel.style.display = 'flex';
  panel.style.justifyContent = 'space-between';
  panel.style.alignItems = 'center';
  const text = document.createElement('div');
  text.textContent = 'A newer autosave is available. Restore it?';
  const actions = document.createElement('div');
  const restore = document.createElement('button');
  restore.textContent = 'Restore';
  restore.className = 'primary';
  restore.style.marginRight = '8px';
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.className = 'ghost';
  restore.addEventListener('click', () => onRestore?.());
  dismiss.addEventListener('click', () => onDismiss?.());
  actions.append(restore, dismiss);
  panel.append(text, actions);
  root.appendChild(panel);
  root.style.display = 'block';
  return root;
}

export async function checkAutosaveOnOpen(projectSlug) {
  try {
    const status = await getJSON(`/api/autosave/status?project_slug=${encodeURIComponent(projectSlug)}`);
    if (!status.autosave_newer || !status.latest_autosave) return;
    const banner = renderBanner({
      onRestore: async () => {
        try {
          const snapshot = await fetch(status.latest_autosave).then(r => r.json());
          // Dispatch an event so host pages can handle the snapshot.
          const ev = new CustomEvent('pubautosave:restored', { detail: { projectSlug, snapshot } });
          window.dispatchEvent(ev);
        } catch (err) {
          console.error('Failed to restore autosave', err);
        } finally {
          banner.style.display = 'none';
        }
      },
      onDismiss: () => {
        banner.style.display = 'none';
      }
    });
  } catch (err) {
    // Silent failure; banner is best-effort only.
    console.warn('Autosave check failed', err);
  }
}

// Provide global access if needed
window.PubAutosave = { checkAutosaveOnOpen };

