const form = document.getElementById('login-form');
const displayNameInput = document.getElementById('display-name');
const colorInput = document.getElementById('primary-color');
const rememberInput = document.getElementById('remember-me');
const statusEl = document.getElementById('login-status');
const tipEl = document.getElementById('perulous-tip');

const tips = [
  '"The studio lights are unforgiving, darling. Best to arrive dazzling."',
  '"I once memorised an entire soliloquy during a blackout. What is your excuse?"',
  '"A proper entrance is half the performance."',
  '"Talent is preparation hidden by charisma."',
];

function rotateTip() {
  const random = tips[Math.floor(Math.random() * tips.length)];
  tipEl.querySelector('p').textContent = random;
}

async function seedForm() {
  try {
    const resp = await fetch('/api/me');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.display_name) displayNameInput.value = data.display_name;
    if (data.avatar_color) colorInput.value = data.avatar_color;
  } catch (err) {
    console.warn('Unable to load current profile', err);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  statusEl.textContent = 'Saving look...';
  statusEl.className = 'status';

  const payload = {
    display_name: displayNameInput.value.trim(),
    avatar_color: colorInput.value,
  };

  if (!payload.display_name) {
    statusEl.textContent = 'Display name is required';
    statusEl.classList.add('error');
    return;
  }

  try {
    const resp = await fetch('/api/state/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      throw new Error(detail.detail || 'Unable to save');
    }
    if (!rememberInput.checked) {
      // if we ever add different auth, this is the place to clear cookies.
    }
    statusEl.textContent = 'Look saved. Redirecting...';
    statusEl.classList.add('success');
    setTimeout(() => {
      window.location.href = '/dressing';
    }, 500);
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.classList.add('error');
  }
}

form.addEventListener('submit', handleSubmit);
rotateTip();
seedForm();
