# Rearview Foresight — Master Ecosystem Audit
## 2i + PubPartner + PubCast Architecture Assessment

**Date:** August 13, 2026

---

## A. VERIFIED CURRENT STATE

### 2i (v26) — Writer's Room

**VERIFIED WORKING:** 35 features including solo editor, save/open/autosave, undo/redo, find/replace, export, drag-drop, keyboard shortcuts, collab mode with accept/reject, line locking, chapters, context menu, reference archive, LLM config with 4 providers, playback/read-aloud, continuity flag UI.

**IMPLEMENTED, AWAITING CONFIG:** AI generation, PubPartner chat, manuscript indexer, character/plot/location extraction, continuity watchdog. All correctly coded, need LLM key or running PubPartner.

**ARCHITECTURALLY MISPLACED:** Indexer, continuity watchdog, and generation currently run inside 2i. Per new architecture, these belong in PubPartner. Code is sound — needs porting, not rewriting.

**NOT YET BUILT:** Style profiling, voice training, voice-matched generation, manuscript commit events to PubPartner, accept/reject signals to PubPartner, generation-via-PubPartner path, cartridge integration.

### PubPartner (v0.1.0-prebeta.12)

**VERIFIED IN CODE:**

| System | Status | Location |
|---|---|---|
| Alex Core | Implemented | `alex_core.py`, wired in main.py |
| Jeremy Cricket / CricketKeeper | Implemented (optional) | `jeremy_cricket.py`, per-character SQLite memory |
| Alex-Jeremy Bridge | Implemented | `alex_jeremy_bridge.py` |
| Pub Manager Authority | Implemented | `pub_manager_authority.py` |
| Governance Engine | Implemented | `governance.py`, bans/mute/consent/waiting room |
| Vessel Runtime | Implemented | `pubpartner_vessel.py`, `.pubpartner` file format |
| Memory Engine | Implemented | `memory_engine.py` |
| System Memory | Implemented | `system_memory.py` |
| Universal Memory System | Implemented (optional) | `universal_memory_system.py` |
| Inference Manager | Implemented | `inference.py`, Ollama + provider-neutral |
| Room Manager | Implemented | `rooms.py` |
| Bot Manager | Implemented | `bots.py`, Pete/Sir Purfluous/Jeremy |
| Recording Service | Implemented | `recording.py` |
| Camera Manager | Implemented | `cameras.py` |
| EVO Protocol | Implemented (optional) | `evo.py`, Switchblade + VDI + E-Pete |
| Friend Backup | Implemented | `pubpartner_backup.py` |
| Auth System | Implemented | `auth.py`, `auth_routes.py`, `userdb.py` |
| BYOK (Bring Your Own Key) | Implemented | Main routes |
| WebSocket (Studio) | Implemented | `studio_websocket.py` |
| Avatar System | Implemented | `avatar.py`, ethereal avatars |
| Structured Logging | Implemented | `structured_log.py` |
| Event Agency (v1) | Implemented | `event_agency.py`, append-only ledger |
| Timeline | Implemented | `timeline_routes.py` |
| Bubble/Jeremy Adapter | Implemented (optional) | `bubble_jeremy_adapter.py` |

**99 API routes in main.py.** PubCast's full studio is here — rooms, bots, cameras, recording, lighting, choreography, voxel, avatars, governance.

**NOT FOUND in code:**
- Zoom integration (no code)
- Discord integration (no code)
- Rumble integration (no code)
- X/Twitter integration (no code)
- OAuth (no code)
- Webhooks (no code)
- Telephony (no code)
- Multi-user collaboration (no code)
- Multi-AI partner-to-partner (no code)
- Manuscript-specific endpoints (no code — `/api/pubpartner/manuscript/*` does not exist)

**PARTIALLY REFERENCED:** Twitch appears in test/character files as contextual reference, not as an integration adapter.

### PubPartner's Turns/Live API

**VERIFIED:** The `/api/pubpartner/turns/live` endpoint accepts `message`, `history`, `user_id`, `session_id`, `project_id`, `room_id`. Returns `friend_response` with optional `provider_fallback`. This is the ONLY current communication path between 2i and PubPartner.

### Vessel (Cartridge)

**VERIFIED:** `PubPartnerVesselRuntime` opens or creates `.pubpartner` vessel files at `data/pubpartner/vessels/alex.pubpartner`. This IS the cartridge mechanism. It exists and is wired. It currently stores friend identity/state, not manuscript intelligence.

---

## B. EVO / JEREMY / JEREMY CRICKET — Dedicated Assessment

### Jeremy Cricket

**FACT:** Jeremy Cricket is a PubCast AI co-host character managed by `BotManager`. CricketKeeper (`jeremy_cricket.py`) provides per-character SQLite memory — persistent, queryable context that survives sessions.

**FACT:** `ThinkingContext` (boot step 9) is described as "Jeremy conductor" — an orchestration layer that uses Jeremy's context spine for structured reasoning.

**FACT:** `AlexJeremyBridge` connects Alex (the PubPartner friend) to Jeremy's infrastructure. This means Alex can access Jeremy's context/memory capabilities. The bridge is bidirectional — Alex's friend layer can pull from Jeremy's memory, and Jeremy can receive context from Alex.

**ARCHITECTURAL ROLE:** Jeremy Cricket is the **context and memory infrastructure layer**. He is not just a character — he is the memory engine's operational face. CricketKeeper is the technology; Jeremy is the identity wrapper. For manuscript intelligence, Jeremy's context spine is the natural place to store and retrieve cartridge knowledge.

### Alex

**FACT:** `AlexCore` is the primary PubPartner friend identity. Wired at boot step 3b with `user_id='default'` and `data_dir=DATA_DIR/'alex'`.

**ARCHITECTURAL ROLE:** Alex is the **persistent friend identity**. Alex is who the writer talks to. Alex's responses come through the turns/live API. Alex's memory and context come through Jeremy's infrastructure via the bridge.

### EVO Protocol

**FACT:** EVO (`evo.py`) is an optional boot step (11/12). It consists of three components: Switchblade, VDI, and E-Pete Sacred Chain. It imports conditionally — the system works without it.

**INFERENCE:** Based on naming and the "Sacred Chain" concept, EVO appears to be an advanced orchestration/governance/authority protocol. Likely handles things like: which AI can act, under what authority, with what verification chain.

**RECOMMENDATION:** Do not modify EVO. It is optional infrastructure that sits above the current scope. When multi-AI and cross-platform governance become relevant, EVO is likely the system that manages it. Leave it alone until then.

---

## C. TARGET ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│                    THE USER                          │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
   ┌────▼────┐   ┌─────▼──────┐    ┌──────▼──────┐
   │   2i    │   │  PubCast   │    │   Future    │
   │ Writer's│   │  Studio    │    │  Platforms  │
   │  Room   │   │  (99 APIs) │    │  Zoom/etc   │
   └────┬────┘   └─────┬──────┘    └──────┬──────┘
        │              │                  │
        └──────────────┼──────────────────┘
                       │
              commit / request / signal
                       │
                ┌──────▼──────┐
                │ PubPartner  │
                │   (Alex)    │
                │             │
                │ turns/live  │ ← existing, working
                │ manuscript/*│ ← needs building
                │ voice-signal│ ← needs building
                │             │
                │ AlexCore    │
                │ Jeremy ←→   │
                │ Bridge      │
                │ Governance  │
                │ Inference   │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │  Cartridge  │
                │  (Vessel)   │
                │             │
                │ .pubpartner │ ← existing mechanism
                │ CricketKeep │ ← existing SQLite
                │ memory_eng  │ ← existing
                │             │
                │ + manuscript│ ← needs adding
                │   index     │
                │ + voice     │ ← needs adding
                │   profile   │
                │ + continuity│ ← needs adding
                │   log       │
                └─────────────┘
```

### Key insight: the cartridge mechanism already exists.

The Vessel (`PubPartnerVesselRuntime`) + CricketKeeper + memory_engine is the cartridge. It's built. It persists. It's backed up. Manuscript intelligence doesn't need a new persistence layer — it needs to store data in the one that already works.

---

## D. PUBPARTNER FUTURE INTEROPERABILITY

### The adapter pattern is the correct architecture.

PubPartner's core should never contain platform-specific code. Each external platform gets an adapter:

```
PubPartner Core (identity + memory + reasoning + governance)
       │
       ├── 2i Adapter          ← exists (turns/live + future manuscript/*)
       ├── PubCast Adapter     ← exists (rooms, bots, production)
       ├── Discord Adapter     ← FUTURE
       ├── Zoom Adapter        ← FUTURE
       ├── Twitch Adapter      ← FUTURE
       ├── Rumble Adapter      ← FUTURE
       ├── X Adapter           ← FUTURE
       ├── Telephony Adapter   ← FUTURE
       ├── 2.5D/3D Adapter     ← FUTURE (avatar system exists)
       └── Generic Web Adapter ← FUTURE
```

### What exists NOW that supports this:

**FACT:** PubPartner already has a room concept (`RoomManager`), a bot concept (`BotManager`), a session concept, and a governance concept. These are the natural extensibility points for platform adapters.

**FACT:** The existing `room_id` parameter in turns/live already scopes conversations by environment. 2i sends `room_id: '2i'`. A Discord adapter would send `room_id: 'discord_channel_123'`. The architecture already supports this.

**FACT:** The avatar system (`avatar.py`, `EtherealAvatarManager`) already separates avatar identity from partner identity. An avatar is a *representation* of Alex, not Alex herself. This is the correct separation for future 3D/2.5D.

### What does NOT exist and should NOT be built now:

Zoom, Discord, Twitch, Rumble, X, and telephony adapters. These are all FUTURE work. None of them blocks the current release. The architectural seam (room_id + adapter pattern) is already in place.

### Universal message model:

**FACT:** The current turns/live API accepts plain text (`message: string`). A future universal message model with typed content blocks (text/image/file/code/etc.) is a NEXT or LATER concern. The current text-only model is correct for the current scope.

---

## E. SECURITY / GOVERNANCE

**FACT:** PubPartner has a working governance engine: bans, mute, consent, waiting room.

**FACT:** PubPartner has authentication (`auth.py`, `auth_routes.py`, `userdb.py`).

**FACT:** Pub Manager Authority provides an authority chain for corrections and decisions.

**FACT:** API keys are stored in localStorage in 2i (XSS risk on shared machines).

**FACT:** The Vessel has in-file record seals and audit hashes that detect corruption and uncoordinated modification (per RELEASE_MANIFEST.json).

**GAP:** No per-platform permission model yet (which platforms can Alex access, what can she do there). This is FUTURE — not needed until platform adapters exist.

**GAP:** No user-facing "what does my partner know / what can it access" dashboard. This is LATER — important for trust, but not blocking for current release.

---

## F. RELEASE PLAN

### NOW — Required for professional 2i/PubPartner release

1. Test v26 with a real LLM (verify 6 "awaiting config" features)
2. Test PubPartner connection (verify turns/live works end-to-end)
3. Build manuscript commit endpoint in PubPartner
4. Build generation-via-PubPartner endpoint
5. Build voice signal endpoint
6. Wire 2i to use these endpoints
7. Store manuscript intelligence in cartridge (Vessel/CricketKeeper)
8. Claude CORS fix (route through PubPartner)
9. Loading/error/offline states
10. Documentation

### NEXT — PubPartner core capabilities

- Style profiling and voice-matched generation
- Cross-manuscript knowledge
- "What does my partner remember" viewer
- .docx export
- Scene navigation (Scene N of M)
- Visual polish pass

### LATER — Multi-user / Multi-AI

- Shared rooms
- Multi-user projects
- AI-to-AI communication (PubPartner-to-PubPartner)
- Rich message model (text + image + file + code)
- Per-room permission model

### FUTURE — External worlds

- Discord adapter
- Zoom adapter
- Twitch/Rumble/X adapters
- Telephony adapter
- 2.5D environment expansion
- 3D avatar environments
- Universal session/presence model

---

## G. RISK REGISTER

| Risk | Severity | Phase |
|---|---|---|
| Claude CORS blocks demo | Critical | NOW |
| No manuscript endpoints in PubPartner | High | NOW |
| Intelligence runs in browser, not server | High | NOW |
| Generation doesn't use intelligence | Medium | NOW |
| No voice/style learning pipeline | Medium | NEXT |
| API keys in localStorage | Medium | NEXT |
| No platform permission model | Low | LATER |
| No multi-AI governance | Low | FUTURE |
| Avatar system not connected to partner state | Low | FUTURE |

---

## H. DO NOT TOUCH

1. Vessel/Cartridge mechanism (it works, it persists, it's backed up)
2. Jeremy Cricket / CricketKeeper (it's the memory infrastructure)
3. Alex Core / AlexJeremyBridge (friend identity is working)
4. Governance Engine (bans, mute, consent — working)
5. EVO Protocol (advanced orchestration — leave for later)
6. PubCast studio systems (cameras, recording, rooms, bots — working)
7. Auth system (working)
8. 2i's solo Write mode (working)
9. 2i's LLM adapter pattern (working)
10. 2i's PubPartner chat adapter (correctly shaped)
11. The .2i file format (extend, don't replace)
12. The CSS design tokens and visual identity

---

## I. SINGLE HIGHEST-VALUE NEXT ACTION

**Build `POST /api/pubpartner/manuscript/commit` in PubPartner.**

This is the one action that converts the architecture from "2i does everything locally" to "PubPartner is the intelligence authority." Every other improvement depends on this endpoint existing.

The implementation is mechanical: take the indexer logic already proven in v26's JavaScript, port the pure functions to Python (`mergeChapterIndex`, `djb2Hash`, `asString/asArray/slugify`, `INDEXER_SYSTEM_PROMPT`), store results in the Vessel via CricketKeeper. Wire 2i's `approveBuffer()` to send the commit event when PubPartner is connected.

One endpoint. One wire. The architecture starts being real.

---

*Ecosystem audit by Opus for Rear View Foresight LLC*
*FACT, INFERENCE, and RECOMMENDATION distinguished throughout.*
*Feic Mo Chroí™*
