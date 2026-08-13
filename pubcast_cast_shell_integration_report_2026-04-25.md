# PubCast v5.6 — Staged Cast / Avatar + AI Shell Integration Pass

Date: 2026-04-25
Base build: `PubCast_v5_6_main_route_authorization_parity_hardened_2026-04-25.zip`

## Goal
Start integrating the current Pete / Re-Pete / Sir Purfluous avatar assets into the real PubCast runtime **without pretending they are final-lock production cast**.

This pass treats them as:
- staged cast assets
- loadable runtime GLBs
- AI shell targets
- provisional, canon-aware, not-finalized characters

## What changed

### 1. New staged cast registry
Added `modules/character_cast.py`.

This module now defines the three current cast avatars as staged runtime assets:
- `pete`
- `repete`
- `purfluous`

Each spec includes:
- canonical staged character id
- display name
- aliases
- avatar preset id
- GLB asset URL / asset path
- role
- idle mode
- voice profile id
- character profile id
- readiness flags (`ai_ready`, `avatar_ready`, `final_lock`, `provisional`)
- silhouette and wardrobe notes

### 2. Loadable cast GLBs are now packaged into the build
Added staged asset folders under:
- `assets/avatar/cast/pete/`
- `assets/avatar/cast/repete/`
- `assets/avatar/cast/purfluous/`

Included current uploaded source packages:
- Pete GLB + builder
- Re-Pete GLB + builder + handoff
- Sir Purfluous GLB + builder + Blender automation + handoff

This means the build now actually ships with the cast assets instead of merely talking about them.

### 3. Avatar presets now expose the staged cast
Patched `modules/avatar.py` so `list_presets()` and `get_preset()` include:
- `PETE`
- `REPETE`
- `PURFLUOUS`

Each staged preset now includes metadata such as:
- `character_id`
- `glb_url`
- `idle_mode`
- `voice_profile_id`
- `profile_id`
- `staged`
- `provisional`
- `final_lock`
- readiness flags

This is the first real step toward lazy-loading these characters from the runtime instead of treating them as orphan files.

### 4. Avatar manifest now includes a built-in cast pack
Patched `modules/avatar_assets.py` to:
- fix the missing logger issue
- add a built-in `pubcast_cast_v1` manifest pack

This gives Pete / Re-Pete / Sir Purfluous a formal place in the avatar asset manifest instead of only existing as uploaded extras.

### 5. Character-profile alias drift was normalized
Patched `modules/character_profiles.py` so the runtime can resolve:
- `repeat`
- `repete`
- `re_pete`
- `re-pete`
- `purfluous`
- `sir_purfluous`
- `sir-purfluous`

Added helper functions:
- `normalize_character_id()`
- `get_character_profile()`
- `list_characters()`

This removes one of the main internal drift problems in the existing codebase.

### 6. EVO voice registry now covers Sir Purfluous and aliases
Patched `modules/evo/voice_characters.py` to:
- add a real `sir_purfluous` voice profile
- resolve Re-Pete aliases to `re_pete`
- resolve Purfluous aliases to `sir_purfluous`

This is a concrete AI-shell readiness improvement, not just avatar packaging.

### 7. BYOK character packet helpers now understand the cast better
Patched:
- `modules/byok_manager.py`
- `modules/byok_routes.py`

Improvements:
- profile prompt lookup now uses canonical profile resolution instead of raw dict lookup
- `repete` and `sir_purfluous` are recognized more cleanly
- character packet display names / voice notes cover the staged cast better
- valid character ids in BYOK routes are broader and less drift-prone

### 8. New cast metadata routes in `main.py`
Added:
- `GET /api/cast/characters`
- `GET /api/cast/characters/{character_id}`

These return staged cast metadata for runtime/UI use.

## What this does **not** claim
This pass does **not** claim that the avatars are final.

It does **not** claim:
- final canon parity
- final silhouette lock
- final wardrobe lock
- full face-performance parity across all three
- final stage-behavior tuning
- full mocap / expression parity with Pete's strongest technical direction

Instead, this pass establishes a truthful first integration threshold:

> They are now real staged cast assets in the build, with actual runtime metadata,
> aliases, voice/profile hooks, and load paths.

## Validation

### Passed
- `python -m compileall -q main.py modules tests`
- targeted cast tests → **7 passed**
- `python -c "import main"` → passed
- full suite → **174 passed, 3 skipped**

## Biggest remaining gaps after this pass
1. **Final cast parity pass**
   - Pete still needs elevation, not freezing
   - Re-Pete still needs canon/readability tuning
   - Sir Purfluous still needs the hardest silhouette / costume correction

2. **Runtime stage loading hookup**
   The staged metadata is now present, but stage/front-end code still needs to deliberately prefer these GLB-backed cast presets when appropriate.

3. **AI-shell behavior binding**
   The shell metadata is ready enough to support next-step binding, but the next pass should wire default idle / voice / behavior expectations deeper into stage and character orchestration.

## Net effect
This pass turns the current trio from “uploaded avatar files adjacent to the system” into “staged cast assets that PubCast itself can identify, list, and prepare to load.”

That is the correct first implementation step.
