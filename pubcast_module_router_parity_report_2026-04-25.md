# PubCast v5.6 — Module Router Parity Hardening Report
**Date:** 2026-04-25
**Base build:** `PubCast_v5_6_input_contract_hardened_2026-04-24.zip`
**Pass type:** Modules router parity / hostile input hardening

## What this pass targeted
This pass pushed request-validation and route-contract discipline deeper into the standalone router modules, not just the main app seams.

Focus areas:
- malformed / non-object JSON bodies
- wrong field types
- blank or oversized string inputs
- out-of-range numeric limits
- mutable-default request models
- request validation ordering that could fail *after* touching backend objects
- module routers whose contracts were weaker than equivalent routes in `main.py`

## Files changed
- `modules/governance_routes.py`
- `modules/production_routes.py`
- `modules/recording_pipeline_routes.py`
- `modules/structured_log_routes.py`
- `modules/auth_routes.py`
- `modules/character_routes.py`
- `modules/memory_routes.py`
- `modules/pete_enhanced_routes.py`
- `modules/alex_routes.py`
- `tests/test_module_router_parity_guards.py`

## Key hardening changes

### 1. Governance router
Added clean JSON-object parsing and stricter field validation for:
- consent recording
- waiting-room requests
- approve / deny actions
- ban / unban
- freeze / unfreeze
- mute / unmute
- kick
- audit limit bounds

Notable fixes:
- malformed JSON now returns explicit 400s
- `consents` must be an object
- invalid `ban_type` now returns 400 instead of leaking enum errors
- negative durations are rejected cleanly
- string fields are trimmed and bounded

### 2. Production router
Added the same clean JSON-object parsing and stricter validation for:
- camera switching
- camera registration
- recording start / pause / marker / export / import

Notable fixes:
- `source_id` now required for camera switching
- camera `position` / `rotation` must be proper numeric 3-vectors
- `tags` must be string arrays
- `sources` must be a string array
- `host_override` and `paused` must be booleans
- import filenames are sanitized to basename only
- import requires `.zip`

### 3. Validation ordering bug fixed
This pass found a subtle but real brittleness bug in `modules/production_routes.py`:
`host_override` validation happened *inside* the `recording.start_session(...)` call expression.

That meant Python could fail on backend method lookup before reporting a bad payload.

Fixed by validating `host_override` **before** touching the backend call.

### 4. Recording pipeline router
Added stricter bounds:
- marker `label` must be non-empty and bounded
- events `limit` is now constrained

### 5. Structured log router
Added query bounds:
- `limit` bounded
- `system` and `severity` bounded

### 6. Pydantic request-model hardening
Hardened request models and query params in:
- `modules/auth_routes.py`
- `modules/character_routes.py`
- `modules/memory_routes.py`
- `modules/pete_enhanced_routes.py`
- `modules/alex_routes.py`

Examples:
- no empty username/password login payloads
- no empty character speech prompts
- memory importance must be `0.0–1.0`
- Alex recent-memory limit bounded
- removed mutable default dict in Pete Enhanced control command

## Tests added
New regression coverage in:
- `tests/test_module_router_parity_guards.py`

Coverage includes:
- malformed JSON handling
- governance payload-shape rejection
- invalid ban types / negative durations
- production malformed JSON and bad array/vector payloads
- production boolean-type rejection
- sanitized import filename behavior
- recording pipeline marker/limit bounds
- structured log query bounds
- request-model 422s for auth/character/memory/alex

## Validation results
- `python -m compileall -q main.py modules tests` ✅
- `pytest -q` → **157 passed, 3 skipped** ✅

## Remaining warnings
- external environment warning from `python_multipart` / ddtrace import path
- httpx deprecation warning in tests that submit raw malformed JSON payloads

These are test-environment/tooling warnings, not functional route failures.

## Bottom line
This pass made the module routers less trusting, less sloppy, and less likely to explode in embarrassing ways when callers send garbage.

Most valuable outcome:
**module routes now fail earlier and more honestly, before they drift into backend attribute errors or implicit coercion nonsense.**
