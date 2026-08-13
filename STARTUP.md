# PubCast AI v2.0 — Startup Guide
**"Feic Mo Chroí" (See My Heart) — Technology Serving Human Storytelling**
Copyright © 2024–2026 Rear View Foresight LLC. All Rights Reserved.

---

## Quick Start

```bash
# 1. Install Python dependencies (first time only)
pip install -r requirements.txt

# 2. Start everything (Rust bridge + FastAPI server)
chmod +x start_pubcast.sh
./start_pubcast.sh

# 3. Open your browser
# http://localhost:8000
```

That's it. `start_pubcast.sh` launches both the Rust animation bridge and the
Python server. Ctrl+C shuts them both down cleanly.

---

## Pages

| URL | What it is |
|-----|-----------|
| `/` | Lobby — main navigation |
| `/control` | Control Room — production switcher |
| `/studio` | Studio Control Room — preflight, audio matrix |
| `/dressing` | Dressing Room — avatar customization |
| `/byok` | BYOK — register your AI API keys |
| `/bar` | The Bar — social space |
| `/world` | PubWorld — 3D voxel environment |
| `/builder` | Voxel scene builder |
| `/gallery` | Gallery |
| `/analytics` | Analytics dashboard |

---

## What's Running

| System | Status | Notes |
|--------|--------|-------|
| Hub / WebSocket rooms | ✅ Live | |
| 6 virtual cameras + program/preview | ✅ Live | |
| Camera cut / transition | ✅ Live | |
| Recording session lifecycle | ✅ Live | |
| Avatar presets (8 holographic beings) | ✅ Live | |
| BYOK key management | ✅ Live | OpenAI, Anthropic, Gemini, Mistral, Groq |
| Studio Control Room | ✅ Live | Preflight countdown, audio matrix |
| PubWorld scene management | ✅ Live | |
| Voxel prop builder + AI generation | ✅ Live | |
| Voxel Asset Manager | ✅ Live | |
| Surfaces (placeable media panels) | ✅ Live | |
| Choreography controller | ✅ Live | |
| Projects / autosave / restore | ✅ Live | |
| C++ twin-engine bridge | ✅ Live | Graceful DISCONNECTED fallback |
| Circuit breakers + IRM health | ✅ Live | |
| Lighting presets (6 modes) | ✅ Live | |
| Inference manager (Ollama LLM/TTS) | ✅ Live | |
| Rust animation bridge | ✅ Built | ws://localhost:8765 — starts with ./start_pubcast.sh |
| Avatar Performer (mocap → Rust) | ✅ Live | Graceful fallback if Rust not running |
| Unity C# devkit | 🔧 Pending | Bridge spec in progress |

---

## BYOK (Bring Your Own Key)

Open `/byok` in the browser to register API keys for:
- **OpenAI** — GPT-4o, GPT-4, etc.
- **Anthropic** — Claude Sonnet, Opus, Haiku
- **Gemini** — Gemini 1.5 Pro/Flash
- **Mistral** — Mistral Large, Ministral
- **Groq** — Llama 3.1, Mixtral (free tier available)

Keys are stored encrypted on disk. Never echoed back in any API response.
Zero keys required — Ollama (local) is the default.

---

## Rust Animation Bridge

The `ws_renderer` binary is pre-built at `bin/ws_renderer`. It runs automatically
via `start_pubcast.sh`. If you need to rebuild it:

```bash
cd rust_crate
cargo build --release
cp target/release/ws_renderer ../bin/
```

Environment variables:
- `PUBCAST_WS_PORT` — WebSocket port (default: 8765)
- `PUBCAST_RENDER_FPS` — Render tick rate (default: 60)
- `PUBCAST_MAX_AVATARS` — Max simultaneous avatars (default: 16)
- `RUST_LOG` — Log level e.g. `pubcast=debug`

---

## API Quick Reference

```
GET  /api/health                 — System health + all subsystems
GET  /api/cameras                — Camera sources
POST /api/cameras/cut            — Hard cut program/preview
POST /api/recording/sessions     — Start recording session
GET  /api/avatars/presets        — All avatar presets
GET  /api/pubworld/scenes        — List scenes
POST /api/pubworld/generate      — AI voxel generation
GET  /api/lighting/presets       — Lighting presets
POST /api/lighting/apply/{id}    — Apply lighting preset
GET  /api/bridge/status          — C++ twin-engine bridge status
GET  /api/studio/status          — Studio Control Room state
POST /api/studio/preflight       — Run 5-second preflight countdown
GET  /api/performer/status       — Rust animation bridge status
POST /api/performer/avatars/{id} — Create avatar performer
GET  /api/byok/catalog           — Full model catalog + hardware profile
GET  /api/byok/models            — Your registered BYOK models
GET  /api/engine/status          — Full distributed engine health
WS   /ws/{room}                  — Real-time event bus
WS   /ws/studio                  — Studio Control Room WebSocket
```

---

## Module Map

```
main.py                          ← Master. Everything wired here.
start_pubcast.sh                 ← Start everything (Rust + Python)
bin/ws_renderer                  ← Pre-built Rust animation bridge binary
rust_crate/                      ← Rust source (pubcast_animation v2.0.0)
  src/
    lib.rs                       ← Crate root, bridge protocol types
    skeleton.rs                  ← Authoritative skeleton, SkeletalAnimator
    ws_renderer.rs               ← WebSocket server binary (31 tests, all pass)
    avatar_animation_system.rs   ← [feature=full-animation] blend trees
    animation_data_library.rs    ← [feature=full-animation] keyframe clips
    avatar_fitting_system.rs     ← [feature=full-animation] body proportions
    complete_animation_controller.rs ← [feature=full-animation] orchestrator

modules/
  hub.py                         ← WebSocket hub, chat, room broadcast
  cameras.py                     ← 6-source camera switcher
  cameras_advanced.py            ← PTZ, health monitoring, auto-transition
  recording.py                   ← Session lifecycle, export/archive
  avatar.py                      ← 8 avatar presets + persistence
  avatar_assets.py               ← GLB asset manifest
  avatar_motion.py               ← Motion capture integration
  avatar_performer.py            ← Python ↔ Rust animation bridge client
  mocap_precision.py             ← One-Euro filter, precision capture
  bots.py                        ← AI co-host manager
  bot_llm_adapter.py             ← LLM adapter (Anthropic/OpenAI/Gemini/Ollama)
  llm_framework.py               ← Mistral, Groq, BYOK keyed adapters
  byok_manager.py                ← BYOK session manager
  byok_routes.py                 ← BYOK FastAPI router (/api/byok/...)
  credentials.py                 ← Encrypted credential store
  orchestrator.py                ← Conversation routing
  rooms.py                       ← Room/Participant management
  studio_control.py              ← Studio Control Room iron core
  studio_websocket.py            ← Studio WS handler
  voxel_asset_manager.py         ← Voxel asset library manager
  voxel_studio_integration.py    ← Voxel ↔ Studio integration hooks
  pubworld.py                    ← Scene CRUD
  pubworld_blocks.py             ← Prop/Block/Prototype persistence
  pubworld_router.py             ← PubWorld router
  voxel_llm_adapter.py           ← Cloud + local voxel generation
  bridge.py                      ← C++ twin-engine bridge (graceful fallback)
  bridge_bulletproof.py          ← Full bulletproof bridge (SHM/TCP/File)
  circuit_breaker.py             ← Service health circuit breakers
  irm.py                         ← Intelligent Resource Monitor
  inference.py                   ← Ollama LLM/TTS inference manager
  surfaces.py                    ← Placeable media surfaces
  choreography_controller.py     ← Server-side avatar animation
  lighting.py                    ← 6 lighting presets
  projects.py                    ← Builder autosave/restore
  persistence.py                 ← Atomic JSON I/O helpers
  models.py                      ← Shared Pydantic models
  schemas.py                     ← Event types
  sculptor.py                    ← Scene sculpting tools
  auth.py                        ← Authentication helpers
  userdb.py                      ← User database
  appconfig.py                   ← App configuration
  vault_engine.py                ← Vault engine integration
  mocap_integration.py           ← MoCap system integration
```

---

*Build your world. Tell your story. See My Heart.*
