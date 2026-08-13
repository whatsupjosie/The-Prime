# PubCast v5.6 attack pass — Alex / Jeremy / weak-code report

Date: 2026-04-24
Base trunk patched: `pubcast_v56_unified_attack/`

## What I did

I treated this as a hardening pass, not a cosmetic cleanup pass. The target area was the Alex route layer, the Alex↔Jeremy bridge, and the seam between them.

I also ran a **three-solutions test** instead of assuming the newest or prettiest architecture was automatically the best.

## Best solution chosen

**Chosen solution: B — hybrid hardened integration**

Why this won:
- It keeps the existing PubCast v5.6 trunk intact.
- It fixes the real runtime weakness in the bridge instead of just moving code around.
- It unifies route-facing Alex access and bridge-facing Alex access so the system stops splitting one user across separate Alex instances.
- It adds regression tests directly on the weak seam.

## Three-solutions test

### Solution A — baseline v5.6 bridge
Source: original `work_debug/workdir` bridge and routes.

Observed result:
- `/api/alex/message` returned 200.
- Entry packet started at low care.
- **High-urgency / critical Jeremy signal still returned low care, fragility 0.1, tone steady, and no protective flags.**
- Route layer was effectively single-instance, not properly user-isolated.

Verdict: **fails the actual room-distress requirement**. The signal was recorded, but the packet Jeremy receives did not meaningfully change.

### Solution B — hybrid hardened integration (chosen)
Source: patched `pubcast_v56_unified_attack`.

Observed result:
- `/api/alex/message` returned 200.
- Route memory lookup for `u1` returned 1 record while `default` returned 0, proving user-specific routing instead of accidental shared state.
- After high-urgency / critical Jeremy signal:
  - care escalated to **high**
  - fragility escalated to **0.9**
  - tone changed to **gentle**
  - protective flags were added: `avoid_complexity`, `avoid_confrontation`, `reduce_noise`

Verdict: **best practical fit for the current trunk**.

### Solution C — uploaded replacement architecture (adapted just enough to test)
Source: uploaded `alex_memory (1).py` + uploaded `alex_jeremy_bridge (1).py`, with the enum mismatch patched in a temporary harness so it could execute.

Observed result:
- Architecture is promising.
- After high-urgency signal, care priority could become high.
- But bridge packet values stayed weak: **fragility remained 0.0 and tone stayed neutral** in the tested path.
- It also lacks direct parity with the current PubCast session/route/persistence APIs.

Verdict: **good future direction, not the best drop-in solution today**.

## Weak code I attacked

### 1) Jeremy distress signals were too weak to matter
**Problem:** `signal_from_jeremy()` stored a memory event, but the refreshed packet often stayed effectively calm. Under a high-urgency / critical room event, Jeremy could still get a low-care, steady packet.

**Fix:**
- Added live stress/clarity/energy nudges on incoming room signals.
- Recomputed Alex state after signal pressure.
- Added `_apply_signal_overlay()` so the outgoing bridge packet reflects urgency and room state immediately.
- Escalates care/tone/pace/intervention flags in a bounded, predictable way.

**Impact:** the bridge now actually tells Jeremy to soften the room when the room is going sideways.

### 2) Alex route state and bridge state were split across different Alex instances
**Problem:** `/api/alex/*` used one default Alex instance while the bridge created per-user Alex instances. That means the user-facing companion and the room-facing bridge could diverge.

**Fix:**
- Added `set_alex_provider()` to `alex_routes.py`.
- Added `_resolve_alex(user_id)` so route calls can resolve the correct Alex instance by user.
- Wired `main.py` to set the provider from `alex_bridge.alex_for`.

**Impact:** the route layer and the bridge now speak to the same per-user Alex instances instead of quietly drifting apart.

### 3) Route contract was under-specified
**Problem:** the route model did not explicitly carry `typing_speed`, and recent-memory output format depended too much on whichever Alex implementation sat behind the route.

**Fix:**
- Added `typing_speed` to the message request model.
- Route now passes normalized `metadata` and `typing_speed` explicitly.
- Added recent-memory normalization so API output stays stable across Alex implementations.

**Impact:** cleaner contract, less hidden compatibility magic, and better future migration room.

### 4) Bridge persistence was fragile
**Problem:** bridge packet and signal JSON writes were non-atomic and signal logs were unbounded.

**Fix:**
- Added atomic JSON writes via temp-file replace.
- Added IO lock for write serialization.
- Capped signal history at `MAX_SIGNAL_HISTORY = 64`.

**Impact:** lower chance of partial/corrupt bridge files and no unbounded signal-log growth.

### 5) The seam was under-tested
**Problem:** the core suite was strong, but these Alex/bridge seams were thinly covered.

**Fix:**
Added `tests/test_alex_routes_bridge.py` covering:
- route message + recent-memory behavior
- per-user route isolation
- high-urgency bridge escalation
- capped signal history

## Files changed

- `pubcast_v56_unified_attack/modules/alex_routes.py`
- `pubcast_v56_unified_attack/modules/alex_jeremy_bridge.py`
- `pubcast_v56_unified_attack/main.py`
- `pubcast_v56_unified_attack/tests/test_alex_routes_bridge.py`

## Test status

### Existing suite
Earlier in this pass, the repository test suite ran green at **110 passed** after the new seam tests were added.

### Final targeted seam checks after the provider unification patch
I manually re-ran the patched route/provider/bridge smoke path and confirmed:
- user-specific Alex routing works (`u1` memory present, `default` empty)
- route message endpoint still returns 200
- bridge escalation still produces high-care / high-fragility / gentle packet behavior

I am confident in the seam fix. The one thing I am not claiming is a second full-suite count after the very last provider-wire patch, because the local runner was being flaky about reporting completion cleanly even when the targeted smoke path succeeded.

## What is stronger now

- Alex route calls and bridge calls no longer drift across separate user memories.
- Jeremy room-distress signals now have immediate behavioral consequences.
- Bridge persistence is harder to corrupt.
- Signal history will not grow forever.
- The seam now has direct regression coverage.

## What is still weak / next best targets

### 1) AlexCore is still the older in-memory/disk-JSON style engine
The uploaded `alex_memory (1).py` is a more mature long-term direction in some ways: async SQLite/WAL, richer unified types, and a cleaner persistent model. I did **not** force-swap that in because it was not the safest way to improve the live PubCast trunk today.

### 2) The uploaded replacement bridge still needs real integration work
Even after enum patching for test purposes, it does not yet map cleanly onto the current session packet behavior the room actually needs.

### 3) Main still carries both a fallback default Alex and provider-backed user Alexes
This is acceptable now because routes prefer the provider, but the next cleanup pass could remove the fallback duplication once all startup/diagnostic paths are confirmed to use provider-backed Alex resolution cleanly.

## Bottom line

This was not a style cleanup. It was a real seam hardening pass.

The most important bug was not a crash — it was **false calm**. Jeremy could be told the room was destabilizing and still receive a packet that basically said everything was fine.

That part is fixed.
