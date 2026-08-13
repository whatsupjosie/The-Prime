const state = {
  preset_id: "neon_yellow_a",
  display_name: "Lumen",
  gender: "neutral",
  primary_color: "#ffd84d",
  halo_direction: "cw",
  halo_speed: 1.1,
  voice_profile: "bright",
  mood: "happy",
  accessories: {},
  features: {},
};

let presets = [];
const moods = [
  "neutral",
  "happy",
  "laughing",
  "surprised",
  "bashful",
  "mischief",
  "pouty",
  "sad",
];

const OPTION_GROUPS = [
  {
    key: "primary_color",
    label: "Aura Color",
    type: "color",
    options: [
      { label: "Lemon", value: "#ffd84d" },
      { label: "Azure", value: "#40d9ff" },
      { label: "Magenta", value: "#ff4fe2" },
      { label: "Lime", value: "#8bff4d" },
      { label: "Sunset", value: "#ff8757" },
    ],
  },
  {
    key: "features.hair",
    label: "Hair",
    type: "feature",
    options: [
      { label: "None", value: "none" },
      { label: "Ponytail", value: "ponytail" },
      { label: "Tuft", value: "tuft" },
      { label: "Waves", value: "waves" },
    ],
  },
  {
    key: "features.lashes",
    label: "Lashes",
    type: "feature",
    options: [
      { label: "None", value: "none" },
      { label: "Medium", value: "medium" },
      { label: "Long", value: "long" },
    ],
  },
  {
    key: "accessories.glasses",
    label: "Glasses",
    type: "accessory",
    options: [
      { label: "None", value: "none" },
      { label: "Round", value: "round" },
      { label: "Cat Eye", value: "cat" },
      { label: "Monocle", value: "monocle" },
    ],
  },
  {
    key: "accessories.hat",
    label: "Headwear",
    type: "accessory",
    options: [
      { label: "None", value: "none" },
      { label: "Top Hat", value: "top_hat" },
      { label: "Crown", value: "crown" },
      { label: "Headphones", value: "headphones" },
    ],
  },
  {
    key: "accessories.earrings",
    label: "Jewelry",
    type: "accessory",
    options: [
      { label: "None", value: "none" },
      { label: "Starlit", value: "starlit" },
      { label: "Halo Stud", value: "stud" },
    ],
  },
  {
    key: "accessories.outfit",
    label: "Outfit",
    type: "accessory",
    options: [
      { label: "None", value: "none" },
      { label: "Dress", value: "dress" },
      { label: "Jacket", value: "jacket" },
      { label: "Hoodie", value: "hoodie" },
    ],
  },
  {
    key: "voice_profile",
    label: "Voice Mode",
    type: "voice",
    options: [
      { label: "Default", value: "default" },
      { label: "Bright", value: "bright" },
      { label: "Mellow", value: "mellow" },
      { label: "Lilt", value: "lilt" },
      { label: "Masker", value: "masker" },
    ],
  },
  {
    key: "halo_direction",
    label: "Halo Direction",
    type: "halo",
    options: [
      { label: "Clockwise", value: "cw" },
      { label: "Counter", value: "ccw" },
    ],
  },
  {
    key: "halo_speed",
    label: "Halo Speed",
    type: "numeric",
    options: [
      { label: "Calm", value: 0.8 },
      { label: "Balanced", value: 1.0 },
      { label: "Energetic", value: 1.3 },
    ],
  },
];

const selectors = {
  neonCanvas: document.getElementById("neon-avatar"),
  voiceMode: document.getElementById("voice-mode"),
  haloSpeed: document.getElementById("halo-speed"),
  sphere: document.getElementById("avatar-sphere"),
  halo: document.getElementById("avatar-halo"),
  lashes: document.getElementById("avatar-lashes"),
  hair: document.getElementById("avatar-hair"),
  mouth: document.getElementById("avatar-mouth"),
  glasses: document.getElementById("avatar-glasses"),
  hat: document.getElementById("avatar-hat"),
  earringsEl: document.getElementById("avatar-earrings"),
  outfit: document.getElementById("avatar-outfit"),
  eyes: document.getElementById("avatar-eyes"),
  displayName: document.getElementById("display-name"),
  genderSelect: document.getElementById("gender-select"),
  moodSelect: document.getElementById("mood-select"),
  wardrobePanel: document.getElementById("wardrobe-panel"),
  wardrobeToggle: document.getElementById("wardrobe-toggle"),
  wardrobeClose: document.getElementById("close-panel"),
  accordion: document.getElementById("customizer-accordion"),
  saveButton: document.getElementById("save-avatar"),
  saveStatus: document.getElementById("save-status"),
  presetButtons: document.querySelectorAll(".preset-card"),
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
const MOOD_TO_EXPRESSION = {
  happy: 'joy',
  laughing: 'laugh',
  mischief: 'joy',
  bashful: 'love',
  love: 'love',
  surprised: 'surprised',
  pouty: 'sad',
  sad: 'sad',
  anger: 'anger',
  furious: 'anger',
  neutral: 'neutral',
};
let neonAvatar = null;
function hexToRgba(hex, alpha = 1) {
  let cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    cleaned = cleaned.split("").map((c) => c + c).join("");
  }
  const bigint = parseInt(cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex, factor = 1.2) {
  let cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    cleaned = cleaned.split("").map((c) => c + c).join("");
  }
  const bigint = parseInt(cleaned, 16);
  const r = Math.min(255, Math.floor(((bigint >> 16) & 255) * factor));
  const g = Math.min(255, Math.floor(((bigint >> 8) & 255) * factor));
  const b = Math.min(255, Math.floor((bigint & 255) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

function renderAvatar() {
  selectors.voiceMode.textContent = state.voice_profile;
  selectors.haloSpeed.textContent = `${state.halo_speed.toFixed(1)}x`;

  if (selectors.halo) selectors.halo.style.opacity = '0';
  if (selectors.sphere) selectors.sphere.style.opacity = '0';
  if (selectors.lashes) selectors.lashes.style.display = 'none';
  if (selectors.hair) selectors.hair.style.display = 'none';
  if (selectors.glasses) selectors.glasses.style.display = 'none';
  if (selectors.hat) selectors.hat.style.display = 'none';
  if (selectors.earringsEl) selectors.earringsEl.style.display = 'none';
  if (selectors.outfit) selectors.outfit.style.display = 'none';
  if (selectors.eyes) selectors.eyes.style.display = 'none';
  if (selectors.mouth) selectors.mouth.style.display = 'none';

  const expression = MOOD_TO_EXPRESSION[state.mood] || 'neutral';
  const energy = clampValue((state.halo_speed - 0.5) / 2, 0, 1);
  const melt = state.mood === 'sad' ? 0.25 : state.mood === 'love' ? 0.35 : 0;
  const fire = ['anger', 'furious'].includes(state.mood);

  if (!neonAvatar && selectors.neonCanvas && window.NeonAvatar) {
    neonAvatar = new window.NeonAvatar(selectors.neonCanvas, {
      expression,
      energy,
      baseColor: state.primary_color,
      melt,
      fireMode: fire,
    });
  } else if (neonAvatar) {
    neonAvatar.setState({
      expression,
      energy,
      baseColor: state.primary_color,
      melt,
      fireMode: fire,
    });
  }

  // Outfit overlay (simple placeholder shapes)
  try {
    const acc = state.accessories || {};
    if (selectors.outfit) {
      selectors.outfit.style.display = 'none';
      selectors.outfit.style.position = 'absolute';
      selectors.outfit.style.pointerEvents = 'none';
      if (acc.outfit && acc.outfit !== 'none') {
        selectors.outfit.style.display = 'block';
        selectors.outfit.innerHTML = '';
        selectors.outfit.style.left = '50%';
        selectors.outfit.style.top = '60%';
        selectors.outfit.style.transform = 'translate(-50%, -50%)';
        selectors.outfit.style.width = '180px';
        selectors.outfit.style.height = '200px';
        selectors.outfit.style.borderRadius = '18px';
        selectors.outfit.style.boxShadow = '';
        if (acc.outfit === 'dress') {
          selectors.outfit.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,216,77,0.8))';
        } else if (acc.outfit === 'jacket') {
          selectors.outfit.style.background = 'rgba(64,64,64,0.8)';
          selectors.outfit.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.2) inset';
          selectors.outfit.style.height = '140px';
        } else if (acc.outfit === 'hoodie') {
          selectors.outfit.style.background = 'rgba(96,128,255,0.8)';
          selectors.outfit.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.25) inset';
          selectors.outfit.style.height = '160px';
        }
      }
    }
  } catch {}
}

function applyPreset(presetId) {
  const preset = presets.find((p) => p.preset_id === presetId);
  if (!preset) return;
  Object.assign(state, JSON.parse(JSON.stringify(preset.base_state)));
  state.features = state.features || {};
  state.accessories = state.accessories || {};
  selectors.displayName.value = state.display_name;
  selectors.genderSelect.value = state.gender;
  selectors.moodSelect.value = state.mood;
  updateOptionHighlights();
  renderAvatar();
}

function buildMoods() {
  selectors.moodSelect.innerHTML = "";
  moods.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
    selectors.moodSelect.append(opt);
  });
}

function buildAccordion() {
  const container = selectors.accordion;
  container.innerHTML = "";
  OPTION_GROUPS.forEach((group) => {
    const item = document.createElement("div");
    item.className = "accordion-item";

    const header = document.createElement("div");
    header.className = "acc-header";
    header.innerHTML = `<span>${group.label}</span><span>›</span>`;
    header.addEventListener("click", () => {
      content.classList.toggle("open");
    });

    const content = document.createElement("div");
    content.className = "acc-content";

    if (group.type === "color") {
      const palette = document.createElement("div");
      palette.className = "option-grid";
      group.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "option-card color";
        btn.style.background = opt.value;
        btn.title = opt.label;
        btn.dataset.key = group.key;
        btn.dataset.value = opt.value;
        btn.addEventListener("click", () => {
          state.primary_color = opt.value;
          updateOptionHighlights();
          renderAvatar();
        });
        palette.append(btn);
      });
      content.append(palette);
    } else {
      const grid = document.createElement("div");
      grid.className = "option-grid";
      group.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "option-card";
        btn.dataset.key = group.key;
        btn.dataset.value = opt.value;
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          setOptionValue(group.key, opt.value);
          updateOptionHighlights();
          renderAvatar();
        });
        grid.append(btn);
      });
      content.append(grid);
    }

    item.append(header, content);
    container.append(item);
  });
}

function setOptionValue(key, value) {
  if (key.startsWith("features.")) {
    const featureKey = key.split(".")[1];
    state.features[featureKey] = value;
  } else if (key.startsWith("accessories.")) {
    const accessoryKey = key.split(".")[1];
    state.accessories[accessoryKey] = value;
  } else if (key === "halo_speed") {
    state.halo_speed = Number(value);
  } else {
    state[key] = value;
  }
}

function getOptionValue(key) {
  if (key.startsWith("features.")) {
    return state.features[key.split(".")[1]] ?? "none";
  }
  if (key.startsWith("accessories.")) {
    return state.accessories[key.split(".")[1]] ?? "none";
  }
  return state[key];
}

function updateOptionHighlights() {
  document.querySelectorAll(".option-card").forEach((btn) => {
    const key = btn.dataset.key;
    if (!key) return;
    const current = getOptionValue(key);
    btn.classList.toggle("active", btn.dataset.value == current);
  });
}

async function loadPresets() {
  const resp = await fetch("/api/avatars/presets");
  if (!resp.ok) return;
  const data = await resp.json();
  presets = data.presets ?? [];
}

async function loadCurrentAvatar() {
  const resp = await fetch("/api/avatar/me");
  if (!resp.ok) return;
  const data = await resp.json();
  Object.assign(state, data);
  state.features = state.features || {};
  state.accessories = state.accessories || {};
  selectors.displayName.value = state.display_name;
  selectors.genderSelect.value = state.gender;
  selectors.moodSelect.value = state.mood ?? "neutral";
}

async function saveAvatar() {
  const payload = { ...state };
  payload.display_name = selectors.displayName.value.trim() || state.display_name;
  try {
    const resp = await fetch("/api/avatar/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("Save failed");
    selectors.saveStatus.hidden = false;
    selectors.saveStatus.textContent = "Saved!";
    setTimeout(() => (selectors.saveStatus.hidden = true), 1800);
  } catch (err) {
    selectors.saveStatus.hidden = false;
    selectors.saveStatus.textContent = "Error saving";
    setTimeout(() => (selectors.saveStatus.hidden = true), 2200);
  }
}

function setupListeners() {
  selectors.wardrobeToggle.addEventListener("click", () => {
    selectors.wardrobePanel.classList.toggle("open");
  });
  selectors.wardrobeClose.addEventListener("click", () => {
    selectors.wardrobePanel.classList.remove("open");
  });
  selectors.saveButton.addEventListener("click", saveAvatar);

  selectors.displayName.addEventListener("input", (e) => {
    state.display_name = e.target.value;
  });

  selectors.genderSelect.addEventListener("change", (e) => {
    state.gender = e.target.value;
    if (state.gender === "female" && (!state.features.lashes || state.features.lashes === "none")) {
      state.features.lashes = "long";
      state.features.hair = state.features.hair === "none" ? "ponytail" : state.features.hair;
    }
    if (state.gender === "male" && state.features.lashes === "long") {
      state.features.lashes = "medium";
    }
    renderAvatar();
    updateOptionHighlights();
  });

  selectors.moodSelect.addEventListener("change", (e) => {
    state.mood = e.target.value;
    renderAvatar();
  });

  selectors.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });
}

(async function init() {
  buildMoods();
  buildAccordion();
  setupListeners();
  await loadPresets();
  await loadCurrentAvatar();
  updateOptionHighlights();
  renderAvatar();
})();
