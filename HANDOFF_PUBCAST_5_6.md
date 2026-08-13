# PubCast 5.6 Handoff

This build advances PubCast from 5.5 into 5.6 by locking three major areas:

1. **Canonical characters included in build**
2. **Session-aware personal dressing rooms routed through a shared host door**
3. **Persistent session credits + exportable credits + persistent memory/event spine**

## Added / changed systems

### Character canon
- Added canonical visual references under `assets/characters/canon/`
- Added supporting references under `assets/characters/reference/`
- Added `data/global/character_canon.json`
- Added `docs/CHARACTER_CANON_5_6.md`

### Dressing room / session runtime
- Added `modules/session_runtime.py`
- New endpoints in `main.py`:
  - `POST /api/session/register`
  - `GET /api/session/{session_id}/roster`
  - `POST /api/session/{session_id}/role`
  - `GET /api/session/{session_id}/call-menu`
  - `POST /api/dressing-room/resolve`
- Updated `static/dressing.html` to auto-register the current user into the current session and resolve a personal dressing room id
- Updated `static/waiting_room.html` to write stable `user_id` session data and route into `/world`
- Updated `static/world.html` phone and TV hotspot behaviors to use session-aware contact/channel logic
- Updated `modules/pubworld_hotspots.py` phone/TV handlers and added memory-event recording from hotspot actions

### Save / credits
- Save metadata from prior 5.5 patch retained
- Autosave route now injects live `session_credits` when a `session_id` is present
- Added `modules/credits_export.py`
- New endpoints in `main.py`:
  - `GET /api/projects/{slug}/credits/export`
  - `GET /api/projects/{slug}/credits/crawl.txt`

### Memory
- Added `modules/memory_engine.py`
- New endpoints in `main.py`:
  - `POST /api/memory/events`
  - `GET /api/memory/context`
- Hotspot actions now emit persistent memory events automatically

## Version note
This build is packaged as **PubCast 5.6** based on:
- canonical characters now physically included in build
- dressing-room/session routing moved from concept to code
- persistent memory/event storage is real and queryable
- credits generation moved from schema-only to functional export preview/crawl generation

## Limits still open
- Mirror Mirror media/call UI is not fully surfaced as a polished room interface yet
- Dressing room door routing exists as session/runtime infrastructure and API, but the final host-map door choreography may still want another front-end polish pass
- Credit export currently generates structured data + crawl text; final animated end-credit render remains future work
- Memory is now persistent and real, but EVO-style interpretation/pattern adaptation can still deepen from here


## Alex ⇄ Jeremy Bridge (new in this pass)

Added runtime bridge integration between Alex (personal/emotional layer) and Jeremy/PubCast session flow:

- `modules/alex_jeremy_bridge.py` — permissioned bridge packet generator and Jeremy->Alex signal path
- `modules/alex_core.py` — now exposes `get_state()`, `get_recent_memories()`, `grounding_check()`, and `reset()` for live API use
- `main.py` — boots Alex core + bridge during lifespan startup and wires them into:
  - `POST /api/session/register`
  - `POST /api/dressing-room/resolve`
  - `GET /api/memory/context`
  - `POST /api/alex-jeremy/signal`
  - `GET /api/alex-jeremy/packet`
  - `modules/alex_routes.py` under `/api/alex/*`

### Behavior
- On session entry / dressing-room resolution, Alex emits a minimal bridge packet for Jeremy
- Jeremy receives a generated whisper packet (tone / fragility / active threads / do-not-touch flags)
- Jeremy can signal Alex back when room state degrades
- The bridge is intentionally tiny: no raw personal memory dump into PubCast
