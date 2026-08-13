# PubCast v5.6 Camera Integration Pass

**Date:** 2026-07-07

## Purpose

This pass integrates the uploaded camera subsystem into the repaired PubCast v5.6 studio runtime without replacing the working production camera/recording API.

The guiding rule was simple: **do not create another camera system just because a shiny camera file appeared.** Apparently software has enough duplicate organs already.

## Inputs Read

- `/mnt/data/PubCast_v5_6_studio_runtime_repair_pass_1_2026-07-07.zip`
- `/mnt/data/camera_manager.py`
- `/mnt/data/cameras.py`
- `/mnt/data/cameras_advanced.py`
- `/mnt/data/CAMERA_MIGRATION_GUIDE.md`
- `/mnt/data/pubcast_camera_engine.zip`
- Existing build files:
  - `modules/cameras.py`
  - `modules/cameras_advanced.py`
  - `modules/production_routes.py`
  - `modules/recording.py`
  - `modules/pete_enhanced.py`
  - `main.py`

## Files Changed

### `modules/cameras_advanced.py`

Replaced the older advanced camera implementation with the uploaded `camera_manager.py` implementation.

This keeps the advanced camera system separate from the simple production camera manager already used by `production_routes.py`.

Key capabilities now present in the advanced manager:

- USB webcam transport
- IP / RTSP camera transport
- NDI placeholder transport
- OBS virtual camera transport
- PubWorld voxel engine transport
- Screen capture transport
- File playback transport
- Program / Preview / Standby / Backup roles
- Camera health and frame statistics
- Auto-switch logic
- Voxel engine TCP handshake support
- Switchblade-vector-aware auto-switch guard

### `modules/camera_manager.py`

Added a compatibility adapter.

This file **does not duplicate logic**. It re-exports the real advanced implementation from `modules.cameras_advanced` so future or older handoff code using `modules.camera_manager` can import safely.

### `CAMERA_MIGRATION_GUIDE.md`

Copied into the build root for handoff continuity.

The migration guide explicitly recommends parallel deployment: keep the existing camera system running, add the enhanced system beside it, test, and migrate gradually.

### `rust_crate/src/`

Copied real source files from `pubcast_camera_engine.zip`:

- `rust_crate/src/camera.rs`
- `rust_crate/src/irm.rs`
- `rust_crate/src/renderer.rs`
- `rust_crate/src/lib.rs`

### `rust_crate/Cargo.toml`

Added the missing Rust dependency:

```toml
crossbeam = "0.8"
```

This is required by the uploaded Rust camera engine source.

## Files Intentionally Not Replaced

### `modules/cameras.py`

Not replaced.

Reason: this is the stable simple manager currently used by `production_routes.py`, `recording.py`, and `main.py`. Replacing it with the advanced async camera engine would require a larger migration because the APIs are different.

Current production API expects:

- `CameraManager.list_sources()`
- `CameraManager.list_status()`
- `CameraManager.get()`
- `CameraManager.set_program_source()`
- `CameraManager.set_preview_source()`
- `CameraManager.get_program_source()`
- `CameraManager.get_preview_source()`
- `create_default_cameras()`

The advanced manager uses a different API shape, including:

- `AdvancedCameraManager.sources`
- `cut_to_camera()`
- `set_preview_camera()`
- `initialize_all_cameras()`
- `get_all_stats()`

So replacing `modules/cameras.py` directly would have broken recording and production routes. We are not doing demolition cosplay today.

## Imports Repaired / Added

The new compatibility import works:

```python
from modules.camera_manager import AdvancedCameraManager
```

The advanced implementation also imports directly:

```python
import modules.cameras_advanced
```

## Validation Results

### Python Syntax Check

Command run:

```bash
python3 -m py_compile $(find . -name "*.py" -not -path "./venv/*" -not -path "./.venv/*" -not -path "./__pycache__/*")
```

Result:

```text
PASS
```

### Python Import Smoke Tests

Modules tested:

```text
modules.cameras
modules.cameras_advanced
modules.camera_manager
modules.production_routes
modules.recording
modules.recording_pipeline_routes
modules.pete_enhanced
modules.pete_enhanced_routes
```

Result:

```text
PASS
```

### Runtime Factory Smoke Test

Checked:

- simple production camera factory
- advanced camera factory
- voxel camera metadata factory
- compatibility adapter class export

Result:

```text
PASS
```

### Rust Check

Attempted:

```bash
cargo check
```

Result:

```text
NOT RUN: cargo is not installed in this environment
```

No Rust build claim is being made from this pass. The source files were copied and `Cargo.toml` was updated, but Rust compilation still needs to be verified in an environment with Cargo installed.

## Current Camera State After This Pass

| Layer | State |
|---|---|
| Production camera API | Live |
| Recording integration | Live |
| Simple camera manager | Preserved |
| Advanced camera manager | Integrated |
| Compatibility adapter | Added |
| Voxel camera TCP handshake | Present |
| Rust camera engine source | Added |
| Rust compile verification | Not verified |

## Still Not Done

1. **Do not switch production routes to `AdvancedCameraManager` yet.**
   The advanced manager has different method names and async behavior. It needs a dedicated adapter before becoming the default camera backend.

2. **Create a production-safe adapter later.**
   The right next file would be something like:

   ```text
   modules/camera_backend_adapter.py
   ```

   Its job would be to expose the simple `CameraManager` API while internally delegating to `AdvancedCameraManager`.

3. **Verify Rust camera engine with Cargo.**
   Run `cargo check` from `rust_crate/` on a machine with Rust installed.

4. **Wire voxel camera output into e-PETE later.**
   The advanced camera system now has voxel engine TCP connection logic, but e-PETE still needs the WebRTC / voxel integration modules before full studio render streaming is real.

5. **Do not remove the simple camera manager until the adapter is tested.**
   It is still what recording and production routes depend on.

## Exact Next Patch List

Recommended next pass:

1. Create `modules/camera_backend_adapter.py`.
2. Implement the simple production camera API on top of `AdvancedCameraManager`.
3. Add tests proving these methods work:
   - `list_sources()`
   - `list_status()`
   - `get()`
   - `set_program_source()`
   - `set_preview_source()`
   - `get_program_source()`
   - `get_preview_source()`
4. Only after those pass, update `main.py` to initialize the adapter instead of the simple manager.
5. Re-run recording route tests.
6. Re-run Control Room camera switch tests.

## Bottom Line

The uploaded camera system is now inside the repaired PubCast build without breaking the existing working camera and recording routes.

This pass intentionally stopped before swapping the default camera backend. That swap requires an adapter and tests, not blind faith, because blind faith is how software projects end up with three camera managers and no camera feed.
