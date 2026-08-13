# PubCast AI v5.5 — Boot Checklist & Runtime Verification
*Rear View Foresight LLC — Feic Mo Chroí™ — updated 2026-04-02*

---

## What's New in v5.5

| Area | Change |
|---|---|
| **main.py** | 12-step boot with sub-steps 2b/2c/2d for Performance, Choreo, Lighting |
| **inference.py** | New `requested_route` / `task_type` / `user_facing` API — `role=` still works (back-compat) |
| **modules/evo/** | EVO Protocol wired as `modules.evo.*` — Switchblade, VDI, Prosody, E-Pete, Pete all live |
| **bot_llm_adapter.py** | Full provider set: Ollama, OpenAI, Anthropic, Gemini, Echo (test) |
| **lighting_engine.py** | AudioReactiveDriver + LightingHubPatch wired into WebSocket |
| **GZipMiddleware** | All responses ≥1KB compressed automatically |
| **prosody_engine.py** | Fixed: internal `vdi_report.vdi` → `vdi_report.vdi_score` |
| **Tests** | 99 passing (39 base + 27 inference router + 33 EVO protocol) |

---

## Prerequisites

### 1. Python 3.10 or 3.11
```
python --version
```

### 2. Install base dependencies
```
pip install -r requirements.txt
```

### 3. (Optional) Architect GGUF
```
pip install -r requirements-architect.txt
```
Copy GGUF files to repo root:
```
google_gemma-3-1b-it-Q4_K_L.gguf    ← Studio role
google_gemma-3-1b-it-Q6_K.gguf      ← Architect role
```

### 4. Ollama (recommended for Studio)
```
ollama serve
ollama pull gemma3:1b
```

---

## Boot Verification

### Step 1: Import check
```
python -c "import main; print('imports ok')"
```

### Step 2: Start
```
python main.py
```

Passing boot log:
```
═══ PubCast AI v5.5 starting ═══
[1/12]  Hub ready
[2/12]  RoomManager ready — N rooms
[2b/12] Performance profile active — medium     ← or "not available"
[2c/12] Choreography controller ready — 30.0 Hz ← or "not available"
[2d/12] Lighting engine ready — N presets        ← or "not available"
[3/12]  Inference — Studio ready | Architect optional/unavailable
[4/12]  CricketKeeper ready                      ← or "not available"
[5/12]  BotManager ready — 3 bots
[6/12]  Cameras (6) + Recording (4 profiles) ready
[7/12]  Governance ready — bans, freeze, consent, waiting room
[8/12]  BYOK ready                               ← or "not available"
[9/12]  ThinkingContext — not available          ← expected
[10/12] Ethereal Avatars ready — 57 joints, 7 colors
[11/12] EVO Protocol ready — Switchblade + VDI + E-Pete active ← or "not available"
[12/12] Vault ready                              ← or "not available"
[12b]   Doctor — ready
═══ PubCast AI v5.5 ready in X.Xs ═══
```

### Step 3: Health check
```
curl http://localhost:8000/health
```
Minimum acceptable: `hub: true`, `rooms > 0`, `bots > 0`, `governance: true`

### Step 4: UI pages
- `/` → Lobby
- `/static/stage.html` → 2.5D Stage
- `/static/stage_panoramic.html` → Panoramic Studio
- `/static/world.html` → World
- `/static/control_room.html` → Director Console
- `/static/map.html` → Map
- `/static/pubcast_lighting_explorer.html` → Lighting Lab
- `/static/doctor.html` → Doctor UI

### Step 5: Inference
```
curl -X POST http://localhost:8000/api/inference/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Say hello.", "route": "studio"}'
```

### Step 6: Two-pass dual-mind
```
curl -X POST http://localhost:8000/api/inference/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Plan a camera move.", "route": "architect_then_studio"}'
```

### Step 7: Task-type routing
```
curl -X POST http://localhost:8000/api/inference/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze this scene.", "task_type": "analysis"}'
```
→ Automatically bumps to `architect_then_studio` when no explicit route given.

### Step 8: EVO status
```
curl http://localhost:8000/api/evo/status
```

### Step 9: Run test suite
```
python -m pytest . -q --ignore=backup_pre_animflex_20260330_095611 \
                     --ignore=backup_pre_codex_waveb \
                     --ignore=backup_pre_foley_sync_20260330_111914
```
Expected: **99 passed**

---

## Inference Route Reference

| `route` param | What runs |
|---|---|
| `studio` (default) | Studio only (Ollama) |
| `architect` | Architect only (GGUF), falls back to Studio |
| `architect_then_studio` | Two-pass: Architect plans, Studio voices |
| `auto` | Same as `studio` |
| `dual` | Same as `architect_then_studio` |
| `plan` | Same as `architect` |
| (omit route) + `task_type: analysis/planning/explain/etc` | Auto-bumps to two-pass |

Legacy `role=` param still works — `role="studio"` is identical to `route="studio"`.

---

## EVO Protocol Quick-Start

```python
from modules.evo import EVOOrchestrator
from modules.evo.switchblade_governor import SceneState

evo = EVOOrchestrator(active_character="pete")

# In your frame loop:
tick = await evo.tick(
    text            = pete_current_line,
    performer_frame = performer_cam.read(),
    audience_frame  = audience_cam.read(),
    scene_state     = SceneState(
        program_camera="cam_1", shot_type="medium",
        primary_character="pete", characters_in_frame=["pete"],
    ),
)

# Wire format for distributed engine
wire = tick.to_switchblade_wire()

# TTS params for ElevenLabs/Cartesia/Kokoro
params = tick.synthesis_params.to_elevenlabs()
```

---

## Known Open Items (v5.5)

| Item | Status |
|---|---|
| Voxel renderer TCP socket (port 9001) | Stub — ready for real renderer |
| ThinkingContext | Import-guarded, package not in repo |
| GGUF model files | Not bundled (large binaries) |
| `thinking_context` package | Not in repo — optional |

---

*Rear View Foresight LLC — Feic Mo Chroí™*

---

## What's New in v5.5 (from v5.2)

| Area | Change |
|---|---|
| **Doctor fix** | `_check_data_dirs` / `_check_write_access` — both call modes (`project root` and `DATA_DIR`) now return zero required failures |
| **8 missing routes** | `GET/POST /api/state/user`, `POST /api/upload`, `GET /api/choreo/actions`, `GET/POST /api/choreo/constraints`, `POST /api/choreo/cue`, `GET /api/performance/status`, `GET /api/doctor/launch-gate` |
| **stage_panoramic.html** | `fetchPerformanceProfile()` field names fixed (`profile`/`settings` not `active_profile`/`current`) |
| **control_room.html** | `pvwTc`/`chkTc` elements added; WS handler expanded from 1 to 12 event types |
| **stage.html** | `say`, `stream_chunk`, `done`, `skin_color_changed`, `lighting_preset`, `production_panic` WS handlers added; `appendStreamChunk()` / `closeStreamChunk()` implemented |
| **Lighting engine** | 11 presets restored from hardened build: `BLUE_HOUR`, `DBZ_AURA`, `FREEZE_DREAM`, `GREENGRASS`, `IMPRESSIONIST`, `PRODUCT_BEAUTY`, `ROTOSCOPE`, `SPORTS_FLOODLIGHT`, `STUDIO_BEAUTY`, `TARANTINO`, `UNDERWATER` (total: 36 presets) |
| **circuit_breaker.py** | Ported from March build — CLOSED/OPEN/HALF_OPEN circuit breaker for cascading failure prevention |
| **irm.py** | Ported from March build — Intelligent Resource Monitor, CPU/memory/GPU health sensing |
| **userdb.py** | Ported from March build — async SQLite user auth + moderation action logging |
| **Copyright** | `COPYRIGHT.md` created; all 70 Python files carry Rearview Foresight LLC header |
| **Junk cleanup** | Brace-expansion artifact dir removed; `data/data/` removed |
| **Tests** | 107 passing (added 8 doctor regression tests) |
