# PubCast v5.6 Studio Runtime Repair Pass 1

**Date:** 2026-07-07  
**Canonical source:** `/mnt/data/PubCast_v5_6_memory_live_2026-07-06.zip`  
**Working directory:** `/mnt/data/pubcast_v5_6_studio_runtime_repair_pass_1/`

## Scope

This pass did not rebuild PubCast, replace architecture, or create duplicate runtime systems.

The goal was narrower: repair studio-runtime wiring enough that e-PETE-related modules can import safely, initialize behind a guard, and fail gracefully when external renderer/WebRTC pieces are missing.

## Files Changed

### `modules/pete_enhanced.py`

Repaired import behavior and added minimal inactive compatibility fallbacks.

Changed:

- Replaced broken `from bridge import ...` import with local package import:
  - `from .bridge import VoxelBridge, BridgeStatus`
- Wrapped missing upstream `pete` import in a guarded fallback.
- Added minimal fallback classes for:
  - `SystemHealth`
  - `ResourceMetrics`
  - `RePeteWorker`
  - `BasePete`
- Added inactive fallback for missing `voxel_webrtc_bridge.py`.
- Added inactive fallback for missing `pubcast_voxel_integration.py`.
- Normalized bridge status and metrics handling so e-PETE can work with multiple bridge implementations.
- Replaced unsafe assumptions about bridge internals with guarded access.
- Made bridge shutdown safe for both sync and async implementations.
- Added fallback recording-control behavior if the bridge lacks `send_recording_control()`.

These fallbacks are clearly marked as compatibility fallbacks. They are not production replacements.

### `modules/bridge.py`

Added small compatibility methods needed by `pete_enhanced.py`.

Added:

- `_command_queue = []`
- `status()`
- `get_status()`
- `get_metrics()`
- `send_recording_control()`
- async `shutdown()`

This did not create a new bridge. It only made the existing simple bridge satisfy the existing e-PETE expectations.

### `modules/pete_enhanced_routes.py`

Changed route prefix from public-facing:

```text
/api/pete-enhanced
```

to internal/developer diagnostics:

```text
/api/internal/pete
```

This keeps e-PETE from being surfaced to normal users or guests.

### `main.py`

Added guarded e-PETE wiring.

Changed:

- Added optional import for:
  - `modules.pete_enhanced.PeteEnhanced`
  - `modules.pete_enhanced_routes`
- Added global `pete_enhanced` reference.
- Added guarded initialization block after voxel bridge setup.
- If e-PETE initializes successfully, it registers internal diagnostics at:
  - `/api/internal/pete`
- If e-PETE cannot initialize, the app logs disabled status and continues booting.
- `StudioControl` now receives real `pete_enhanced` only if it is safely initialized; otherwise it uses the existing `_StudioPeteShim`.
- `VoxelStudioIntegration` receives `pete_enhanced` when available.

## Imports Repaired

Known broken imports from the audit were handled as follows.

| Original import | Repair result |
|---|---|
| `from pete import ...` | Guarded fallback added because upstream `pete.py` is missing. |
| `from bridge import ...` | Repaired to local package import `.bridge`. |
| `from voxel_webrtc_bridge import ...` | Guarded inactive fallback added. File still missing. |
| `from pubcast_voxel_integration import ...` | Guarded inactive fallback added. File still missing. |

## Missing Dependencies Still Found

These are still missing from the canonical build and were not faked as complete systems:

- `pete.py`
- `voxel_webrtc_bridge.py`
- `pubcast_voxel_integration.py`
- `distributed_engine.py`
- `facial_performance_1.py`
- dedicated advanced `camera_manager_1.py`

The new compatibility layer only prevents imports and guarded boot from crashing. It does not make those systems real.

## Compatibility Fallbacks Added

Fallbacks added in `modules/pete_enhanced.py`:

- Minimal `BasePete`
- Minimal `SystemHealth`
- Minimal `ResourceMetrics`
- Minimal `RePeteWorker`
- Inactive `VoxelWebRTCBridge`
- Inactive `PubCastVoxelIntegration`

Purpose:

- allow safe import
- allow guarded initialization
- keep missing systems disabled instead of pretending they are complete

## Systems Still Disabled or Partial

### e-PETE

Now imports safely.

Still not guaranteed to become operational unless the renderer/bridge conditions are real. If the Rust renderer is absent, initialization returns false and e-PETE remains disabled.

### WebRTC bridge

Still missing. The fallback reports:

```text
voxel_webrtc_bridge.py missing
```

### PubCast voxel integration

Still missing. Restart requests log a warning and return false.

### Distributed engine

Still absent from the canonical build.

### Facial performance

Still absent from the canonical build.

## Existing Systems Confirmed Not Duplicated

No duplicate systems were created for:

- e-PETE
- Jeremy
- memory
- recording
- camera manager
- bridge
- IRM
- circuit breaker
- production routes

Existing camera and recording routes were left intact.

## Syntax Check Results

Command run from working directory:

```bash
python3 -m py_compile $(find . -name '*.py' -not -path './venv/*' -not -path './.venv/*')
```

Result:

```text
PASS — no syntax errors
```

## Import Smoke Test Results

Command tested these modules:

```text
modules.pete_enhanced
modules.pete_enhanced_routes
modules.bridge
modules.irm
modules.circuit_breaker
modules.production_routes
modules.recording_pipeline_routes
modules.studio_control
modules.studio_websocket
```

Results:

```text
PASS modules.pete_enhanced
PASS modules.pete_enhanced_routes
PASS modules.bridge
PASS modules.irm
PASS modules.circuit_breaker
PASS modules.production_routes
PASS modules.recording_pipeline_routes
PASS modules.studio_control
PASS modules.studio_websocket
```

Additional smoke check:

```text
PASS main import
```

Warnings observed:

- `PUBCAST_JWT_SECRET is not set — using insecure default.`
- CORS warning about wildcard origin.

These are environment/security configuration warnings, not syntax or import failures.

## Exact Next Patch List

### 1. Bring in missing real upstream modules

Locate and integrate the real versions of:

- `pete.py`
- `voxel_webrtc_bridge.py`
- `pubcast_voxel_integration.py`
- `distributed_engine.py`
- `facial_performance_1.py`
- `camera_manager_1.py` if it is truly distinct from existing `cameras.py` and `cameras_advanced.py`

Do not rebuild them. Port them from their existing packages.

### 2. Replace compatibility fallbacks with real imports

Once real files are present, remove or bypass the inactive fallbacks in `modules/pete_enhanced.py`.

### 3. Runtime test e-PETE with renderer absent

Expected result:

- app boots
- e-PETE logs disabled
- no crash
- internal route either absent or returns 503 if included

### 4. Runtime test e-PETE with renderer present

Expected result:

- bridge connects
- e-PETE initializes
- `/api/internal/pete/status` returns real status
- StudioControl receives real e-PETE instead of shim

### 5. Wire ControlRoom frontend after backend runtime stabilizes

Do not start frontend wiring until e-PETE can initialize cleanly or fail safely.

## Final State

Studio runtime repair pass 1 succeeded at the import-safety and guarded-wiring level.

The build is not claiming full studio runtime completion. It is now safer and cleaner for the next integration pass because e-PETE no longer crashes on import and no missing production system was faked as complete.
