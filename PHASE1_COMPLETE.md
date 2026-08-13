# PubCast AI — Phase 1 Complete
*Last updated: February 2026*

## Status: Broadcasting Platform (no longer a prototype)

Phase-1 is now real. The nervous system is wired. `main.py` instantiates `Hub`, `CameraManager`, `RecordingService`, and `Avatar` system at startup. The Control Room UI is now driven by real REST + WebSocket events.

---

## What Was Built

| System | File | Status |
|---|---|---|
| WebSocket Hub (chat, presence, broadcast) | `modules/hub.py` | ✅ Wired |
| Camera Manager (program/preview/cut) | `modules/cameras.py` | ✅ Wired |
| Recording Service (sessions, profiles, export) | `modules/recording.py` | ✅ Wired |
| Avatar System (presets, save/load, broadcast) | `modules/avatar.py` | ✅ Wired |
| REST API (35 routes) | `main.py` | ✅ Complete |
| Control Room UI (7 stations) | `static/control_stations.js` | ✅ Complete |
| Frontend state machine | `static/app.js` | ✅ Complete |

---

## 🔴 DO NOT BREAK — Two Fragile Wins

### 1. The `modules/` Package
All module files must live inside `modules/` as a proper Python package with `modules/__init__.py`.  
`main.py` imports as: `from modules.hub import Hub`, `from modules.cameras import ...` etc.  
If you move files back to root, all imports break.  
`pubcast_patch.py` creates this structure — run it once from project root if `modules/` is missing.

### 2. The Frontend Event Bus
`app.js` is a JS module. `control_stations.js` is a separate module. They communicate via two `window` globals:

```js
// app.js emits to these on every relevant event:
window.__pubcastStationsHook(ev)   // ALL WebSocket events
window.__pubcastRecHandler(ev)     // recording_* events only

// control_stations.js registers handlers at load time:
window.__pubcastStationsHook = function(ev) { ... }
window.__pubcastRecHandler   = function(ev) { ... }
```

This is how the recording timer ticks, the badge updates, and the station tabs react to live events.  
**Do not make `onWsEvent` a named export or attach it to `window` directly** — it is a module-scoped function in `app.js` by design.

---

## What's Left (Phase 2)

- **Hub authorization** — control-room-only signals should require an operator role. Public chat and control chat share the same `/ws/{room}` endpoint but need different permission gates.
- **Orchestrator / Bots** — `orchestrator.py` and `bots.py` exist and are quality code. They need to be instantiated in `main.py` and given routes so AI co-hosts can post into rooms.
- **Avatar animation / choreography** — `choreography.py`, `choreography_runtime.py`, and `choreography_controller.py` all exist. They need wiring to the TTS pipeline so avatars lip-sync and animate.
- **FFmpeg capture** — `RecordingService` manages session state but doesn't yet spawn FFmpeg. Actual A/V capture is Phase 2.
- **GLB avatar assets** — drop `.glb` files into `assets/avatar/` and reference them in `data/avatar_assets.json`.

---

## Deploy Checklist (fresh machine)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create modules/ package and patch HTML
python pubcast_patch.py

# 3. Copy files to static/
#    main.py       → project root
#    app.js        → static/app.js
#    control_stations.js → static/control_stations.js

# 4. Start server
uvicorn main:app --reload
# → http://localhost:8000

# 5. Verify health
curl http://localhost:8000/api/health
```

---

## API Surface (35 routes)

```
GET/POST  /api/state/production      — production state (broadcast to all via WS)
GET/POST  /api/state/user            — per-user profile
GET       /api/me                    — identity + cookie bootstrap
GET       /api/cameras               — all camera sources + status
GET/POST  /api/cameras/program       — program source
GET/POST  /api/cameras/preview       — preview source
POST      /api/cameras/cut           — swap program/preview
PUT       /api/cameras/{id}/status   — health update
GET       /api/recording/profiles    — encoding profiles
GET/POST  /api/recording/sessions    — list / start recording
POST      /api/recording/sessions/{id}/stop
POST      /api/recording/sessions/{id}/pause
POST      /api/recording/sessions/{id}/marker
POST      /api/recording/sessions/{id}/archive
GET       /api/recording/sessions/{id}/export  — ZIP download
GET       /api/recording/storage     — disk usage
GET       /api/recording/privacy     — room recording policies
GET       /api/avatars/presets       — built-in avatar presets
GET/POST  /api/avatars/me            — my avatar state
GET       /api/avatars/{user_id}     — another user's avatar
GET       /api/health                — full system health check
GET       /api/vod                   — list replay files
POST      /api/upload                — file upload (≤5MB)
WS        /ws/{room}                 — WebSocket (chat, presence, events)
```

---

*Built by a baby who builds legacy software.* 🩷
