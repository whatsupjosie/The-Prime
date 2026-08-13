# PubCast AI v5.6 — Five-Round Three-Solution Test Report
**Date:** 2026-04-25  
**Base Build:** `PubCast_v5_6_module_router_parity_hardened_2026-04-25.zip`  
**Resulting Build:** this report's accompanying hardened zip  
**Validation:** `162 passed, 3 skipped`

---

## Executive read

I did five rounds of the three-solution test against the current hardened trunk, looking for the biggest issues, bottlenecks, and eyebrow-raising weak points rather than just whatever was easiest to patch.

The biggest surprise was not some exotic renderer problem. It was more basic and more dangerous:

- the auth substrate was half-theater
- route-module security boundaries were mostly aspirational
- `main.py` is still an oversized control center with too much responsibility
- broad exception swallowing is still extremely high
- file import/upload collision safety was not consistent

I landed the winners that were clean enough to improve the trunk immediately without destabilizing it.

---

## Baseline facts that drove the rounds

### Test baseline before this pass
- `157 passed, 3 skipped`

### Test result after this pass
- `162 passed, 3 skipped`

### Code-shape metrics that raised eyebrows
- `main.py`: **2268 lines**
- `main.py`: **92** `@app.*` route decorators
- `main.py`: **31 mutating routes** (`POST/PUT/PATCH/DELETE`)
- `main.py`: **31 mutating routes with no dependency-level auth guard**
- broad `except Exception` count excluding shadow mains (`main_temp.py`, `main_comprehensive.py`): **373**
- broad `except Exception` count including those shadow mains: **501**
- route modules present but still not mounted in `main.py`:
  - `character_routes.py`
  - `story_routes.py`
  - `memory_routes.py`
  - `pete_enhanced_routes.py`

---

# Round 1 — Authentication substrate integrity

## What raised my eyebrow
The auth router existed, but the login path was not doing real credential verification. It could mint a token without actually proving the password against the user database. On top of that, the auth router was not mounted into the app startup path at all.

That means any downstream “auth” work would be built on something that was not trustworthy enough to deserve the name.

## Three solutions considered

### Solution A — Leave auth loose and document it
- Pros: zero risk to current behavior
- Cons: dishonest foundation; every later guard is built on sand

### Solution B — Real auth foundation, staged rollout
- verify passwords against the actual user database
- put role claims into tokens
- mount auth routes during startup
- initialize and seed the user DB during app startup
- keep enforcement rollout separate from auth validity

### Solution C — Full auth rewrite now
- app-wide bearer enforcement immediately
- full user/role/session matrix in one shot
- convert all callers at once

## Winner
**Solution B**

It fixes the fake part first without detonating the entire app surface.

## Landed in this pass
- `modules/auth.py`
  - added robust JWT fallback when `python-jose` is unavailable
  - added password hashing/verification fallback when `passlib` is unavailable
- `modules/auth_routes.py`
  - login now verifies credentials against `modules.userdb`
  - issued JWTs now carry role claims
  - verify endpoint now actually rejects invalid tokens instead of smiling and handing back nonsense
- `main.py`
  - auth system is now initialized during lifespan startup
  - auth routes are now mounted
  - owner seeding is attempted through the user DB bootstrap

## Why this won
Before this, “auth” was not trustworthy enough to build on. Now it is at least real.

---

# Round 2 — Role boundaries on dangerous routes

## What raised my eyebrow
The app had a role system in `modules/auth.py`, but the dangerous route modules were mostly trusting caller-supplied body fields like `issued_by`, `approved_by`, `operator`, and similar strings.

That is not a role boundary. That is cosplay.

## Three solutions considered

### Solution A — Trust `X-Client-Id` and body fields
- Pros: minimal friction
- Cons: still spoofable and still not a real boundary

### Solution B — Add a shared staged security helper for route modules
- optional bearer parsing
- env-flag-controlled enforcement (`PUBCAST_ENFORCE_AUTH`)
- route-level `require_role(...)`
- actor binding so request bodies cannot casually lie about who performed the action

### Solution C — Immediate full policy matrix across all routes
- per-route role map
- capability-style enforcement everywhere now
- convert every mutating main route and every module router in one pass

## Winner
**Solution B**

It creates an actual enforcement spine now, while leaving room for a bigger policy matrix later.

## Landed in this pass
- new `modules/route_security.py`
  - central request identity helper
  - staged auth enforcement
  - `require_role(...)`
  - `bound_actor(...)`
- `modules/governance_routes.py`
  - moderation/waiting-room resolution actions now use the shared role helper
  - caller identity fields are now tied to the actual request identity instead of blindly trusted
- `modules/production_routes.py`
  - production control mutations now use the shared role helper
  - recording operator/marker actor fields are no longer naively caller-controlled

## Important honesty note
This is **not** full authorization coverage yet.

`main.py` still contains **31 mutating routes with no dependency-level auth guard**. This round created and landed the right foundation and applied it to high-risk module routers, but the main app still needs the same treatment.

---

# Round 3 — Main app shape and router exposure drift

## What raised my eyebrow
`main.py` is still carrying too much:
- boot orchestration
- route mounting
- many direct API handlers
- page aliases
- subsystem startup
- compatibility glue
- some routes that duplicate functionality already represented in dedicated route modules

Also: some route modules exist but still are not mounted in the real app.

## Three solutions considered

### Solution A — Leave `main.py` as the god file
- Pros: least disruption
- Cons: highest drift risk, highest cognitive load, easiest place for silent regression

### Solution B — App-factory decomposition with mounted-router manifest
- move direct routes into domain routers in phases
- create a mounted-router manifest so “exists in repo” and “reachable in app” stop diverging
- shrink `main.py` toward startup/orchestration only

### Solution C — Full rewrite into package layout now
- Pros: cleanest architecture on paper
- Cons: highest destabilization risk and token burn

## Winner
**Solution B**

## Landed now?
**Not fully.**

I did **not** attempt a wholesale `main.py` breakup in this pass because that is the kind of thing that can create more regressions than it removes if rushed.

## Why it still matters
This remains one of the largest structural risks in the trunk.

Metrics:
- `main.py`: **2268 lines**
- `main.py`: **92** route decorators
- unmounted route modules still present: `character_routes`, `story_routes`, `memory_routes`, `pete_enhanced_routes`

## Recommendation
Next serious architecture pass should be **router extraction with manifest discipline**, not another random cleanup sweep.

---

# Round 4 — Exception swallowing / observability debt

## What raised my eyebrow
The codebase still swallows a lot of failure.

Broad exception counts:
- excluding shadow mains: **373**
- including shadow mains: **501**
- `main.py` alone: **58**

Some of those are genuinely appropriate for optional subsystems and “keep booting” behavior. A lot of them are just too broad.

## Three solutions considered

### Solution A — Keep broad catches, add more comments
- Pros: low effort
- Cons: still hides the real failure modes

### Solution B — Narrow the high-signal broad catches first
- startup
- route modules
- bridge / camera / voxel seams
- use explicit exception groups and structured error detail

### Solution C — Fail-fast everything
- Pros: very honest
- Cons: breaks the product's graceful degradation philosophy

## Winner
**Solution B**

## Landed now?
**Partially, indirectly.**

This pass did not try to erase all broad catches — that would be reckless in one go. It did improve the auth/security substrate and gave better failure truth on those paths, but the broader exception-taxonomy pass is still ahead.

## Recommendation
Target the top five files first:
- `main.py`
- `modules/bridge_bulletproof.py`
- `modules/evo/camera_manager.py`
- `modules/cameras_advanced.py`
- `pubcast_agent.py`

That is where a lot of silent weirdness is still likely hiding.

---

# Round 5 — Filesystem collision safety / import-export discipline

## What raised my eyebrow
The trunk had already improved atomic writes, but import/upload paths could still behave too casually around filename reuse. That is exactly the sort of boring bug that leads to accidental clobbering and “where did my original file go?” rage.

## Three solutions considered

### Solution A — Keep current behavior and trust filenames
- Pros: simplest
- Cons: collision risk and poor operator trust

### Solution B — Central non-clobbering path policy
- sanitize filenames
- create collision-safe sibling names (`foo.zip`, `foo_1.zip`, `foo_2.zip`, ...)
- use the same policy in upload/import seams

### Solution C — Move all imports/exports behind DB/object-store abstractions
- Pros: strongest long-term tracking
- Cons: far too big for this pass

## Winner
**Solution B**

## Landed in this pass
- `modules/persistence.py`
  - added `unique_child_path(...)`
- `main.py`
  - upload path now uses sanitized non-clobbering destination selection
- `modules/production_routes.py`
  - recording import path now avoids overwriting an existing zip with the same filename

## Why this mattered
This is one of those unglamorous reliability moves that users notice only when it is missing.

---

# What I changed in the code this pass

## New / changed files
- `modules/auth.py`
- `modules/auth_routes.py`
- `modules/route_security.py` **(new)**
- `modules/governance_routes.py`
- `modules/production_routes.py`
- `modules/persistence.py`
- `main.py`
- `tests/test_three_solution_rounds_auth_foundation.py` **(new)**
- `tests/test_round5_filesystem_collision_guards.py` **(new)**

---

# Validation

## Focused validation
- auth foundation tests
- governance/production staged role-boundary tests
- collision-safe import tests

## Full suite
- `162 passed, 3 skipped`

---

# Best outcomes, bluntly stated

## Biggest issue fixed now
**Auth is no longer fake.**
That was the right place to spend prejudice first.

## Biggest issue still standing
**`main.py` is still too big and too trusted.**
Even with the new auth foundation, too many direct mutating routes in the main app still have no dependency-level boundary.

## Biggest remaining structural risk
**Exception swallowing + route concentration.**
The app still has too many places where bad behavior can degrade into “warning, continue” instead of a clean, typed failure.

## Best next pass
If continuing from this build, I would do:

### **Main-route authorization parity pass**
Take the new security helper and apply it to the direct mutating routes in `main.py`:
- session role changes
- upload/import style actions
- bots registration/deletion
- studio emergency/preflight controls
- camera program/preview mutation routes
- avatar mutation/bake routes

That is the most valuable unfinished security/workflow pass now that the auth substrate is finally real.

---

# Bottom line

This was a worthwhile five-round pass.

Not because it made the numbers prettier, but because it attacked a class of problems that would have made every later “secure” or “role-based” feature partly fraudulent.

The trunk is stronger now, but it is also clearer where the real remaining risk lives.
