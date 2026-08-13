# 🔄 Migration Guide: Existing PubCast → Camera Vision

## Overview

This guide helps you migrate your existing PubCast system to use the new camera vision capabilities **without breaking anything**.

---

## 🎯 Migration Strategy: Zero Downtime

We'll use a **parallel deployment** approach:
1. Keep your existing system running
2. Add vision system alongside it
3. Test thoroughly
4. Switch over gradually
5. Remove old code when confident

---

## 📋 Pre-Migration Checklist

### ✅ Before You Start

- [ ] Backup your current codebase
- [ ] Document your current camera setup
- [ ] List all camera-dependent features
- [ ] Note any custom camera logic
- [ ] Check Python version (3.8+ required)
- [ ] Review current API endpoints
- [ ] Identify WebSocket usage

### ✅ Current System Audit

```python
# Document your current setup
CURRENT_CAMERAS = {
    "physical_cameras": [],  # List your physical cameras
    "virtual_cameras": [],   # List your virtual cameras
    "recording_sources": [], # List recording sources
}

CURRENT_ENDPOINTS = [
    # List your camera-related endpoints
    # e.g., "/api/cameras", "/api/recording/start"
]

CURRENT_FEATURES = [
    # List features that use cameras
    # e.g., "Auto-recording", "Multi-camera switching"
]
```

---

## 🔄 Step-by-Step Migration

### Phase 1: Installation (5 minutes)

#### Step 1.1: Add Vision Files

```bash
# Copy vision system files to your project
cp pubcast_vision_integration.py your_project/
cp pubcast_vision_routes.py your_project/

# Or if using git
git add pubcast_vision_integration.py pubcast_vision_routes.py
```

#### Step 1.2: Install Dependencies

```bash
# Production install
pip install fastapi uvicorn websockets aiofiles

# Optional (recommended)
pip install structlog prometheus-client
```

#### Step 1.3: Verify Installation

```python
# Test imports
try:
    from pubcast_vision_integration import create_integrated_vision_manager
    from pubcast_vision_routes import integrate_vision_with_fastapi
    print("✅ Vision system ready")
except ImportError as e:
    print(f"❌ Import failed: {e}")
```

---

### Phase 2: Parallel Integration (10 minutes)

#### Step 2.1: Add to Your main.py

```python
# YOUR EXISTING CODE STAYS EXACTLY THE SAME
# Just add these new imports at the top

from pubcast_vision_integration import (
    create_integrated_vision_manager,
    setup_default_cameras
)
from pubcast_vision_routes import integrate_vision_with_fastapi

# ... your existing code ...
```

#### Step 2.2: Initialize During Startup

```python
@app.on_event("startup")
async def startup():
    global camera_manager, vision_manager  # Add vision_manager
    
    # YOUR EXISTING STARTUP CODE - DON'T CHANGE THIS
    # e.g.:
    camera_manager = CameraManager(data_dir=DATA_DIR)
    await camera_manager.start_monitoring()
    # ... etc ...
    
    # NEW: Add vision system (runs alongside existing)
    try:
        vision_manager = create_integrated_vision_manager(
            camera_manager=camera_manager,  # Pass your existing manager
            data_dir=DATA_DIR
        )
        
        # Setup default vision cameras
        await setup_default_cameras(vision_manager)
        
        # Add vision API routes (new endpoints only)
        integrate_vision_with_fastapi(app, vision_manager)
        
        print("✅ Vision system integrated")
    except Exception as e:
        print(f"⚠️  Vision system failed (non-critical): {e}")
        # Your existing system still works!
```

**Key Points:**
- ✅ Existing code untouched
- ✅ Vision system optional (won't break if it fails)
- ✅ New endpoints added without affecting old ones
- ✅ Can test both systems in parallel

---

### Phase 3: Testing (15 minutes)

#### Step 3.1: Test Existing System Still Works

```bash
# Test your existing endpoints still work
curl http://localhost:8000/api/cameras  # Your old endpoint
curl http://localhost:8000/health       # Your health check

# If these work, your existing system is fine!
```

#### Step 3.2: Test New Vision System

```bash
# Test new vision endpoints
curl http://localhost:8000/api/vision/cameras
curl http://localhost:8000/api/vision/metrics

# If these work, vision system is installed!
```

#### Step 3.3: Test Integration

```python
# In Python console or test script
import requests

# Get vision cameras
response = requests.get("http://localhost:8000/api/vision/cameras")
print(response.json())

# Compare with existing cameras
response = requests.get("http://localhost:8000/api/cameras")
print(response.json())

# Both should work independently!
```

---

### Phase 4: Scene Synchronization (20 minutes)

#### Step 4.1: Find Your Scene Update Logic

Look for where your PubWorld scene gets updated:

```python
# FIND THIS in your code:
async def update_pubworld_scene(scene_data):
    # Your existing scene update logic
    # ...
```

#### Step 4.2: Add Vision Sync

```python
# MODIFY TO THIS:
async def update_pubworld_scene(scene_data):
    # Your existing scene update logic (KEEP THIS!)
    # ...
    
    # NEW: Sync with vision system
    if vision_manager:  # Only if vision system is active
        try:
            # Convert your scene format to vision format
            objects = convert_scene_to_vision_objects(scene_data)
            lights = convert_scene_to_vision_lights(scene_data)
            
            # Update vision system
            vision_manager.update_scene_objects(objects, lights)
            await vision_manager.update_all_cameras()
        except Exception as e:
            print(f"Vision sync failed (non-critical): {e}")
```

#### Step 4.3: Helper Functions

```python
def convert_scene_to_vision_objects(scene_data):
    """Convert your scene format to vision format"""
    objects = []
    
    # Adapt this to YOUR scene format
    for avatar in scene_data.get("avatars", []):
        objects.append({
            "id": avatar["id"],
            "type": "avatar",
            "x": avatar["position"]["x"],  # Adjust to your format
            "y": avatar["position"]["y"],
            "z": avatar["position"]["z"]
        })
    
    for prop in scene_data.get("props", []):
        objects.append({
            "id": prop["id"],
            "type": prop.get("type", "prop"),
            "x": prop["position"]["x"],
            "y": prop["position"]["y"],
            "z": prop["position"]["z"]
        })
    
    return objects

def convert_scene_to_vision_lights(scene_data):
    """Convert your lights to vision format"""
    lights = []
    
    for light in scene_data.get("lights", []):
        lights.append({
            "id": light["id"],
            "x": light["position"]["x"],
            "y": light["position"]["y"],
            "z": light["position"]["z"],
            "intensity": light.get("intensity", 1.0)
        })
    
    return lights
```

---

### Phase 5: Feature Migration (30 minutes)

#### Migrate Recording System

**Before (your old code):**
```python
async def start_recording():
    camera_id = "cam1"  # Hardcoded
    await recording_manager.start_recording(camera_id)
```

**After (with vision intelligence):**
```python
async def start_recording():
    # Option 1: Use vision to auto-select best camera
    if vision_manager:
        best_camera = vision_manager.get_best_camera()
        if best_camera:
            camera_id = best_camera
        else:
            camera_id = "cam1"  # Fallback to old logic
    else:
        camera_id = "cam1"  # Fallback if vision not available
    
    await recording_manager.start_recording(camera_id)
```

#### Migrate Camera Switching

**Before:**
```python
async def switch_camera(camera_id: str):
    await camera_manager.switch_program(camera_id)
```

**After (with vision awareness):**
```python
async def switch_camera(camera_id: str):
    # Update both systems
    await camera_manager.switch_program(camera_id)
    
    if vision_manager:
        vision_manager.set_primary_camera(camera_id)
```

---

## 🔀 API Endpoint Mapping

Your **old endpoints** stay exactly the same. Here's how they map to **new vision endpoints**:

| Old Endpoint | New Vision Endpoint | Migration Strategy |
|--------------|---------------------|-------------------|
| `GET /api/cameras` | `GET /api/vision/cameras` | Keep both, add feature flag |
| `POST /api/recording/start` | Enhanced with vision | Upgrade logic, keep endpoint |
| `GET /api/camera/{id}/status` | `GET /api/vision/cameras/{id}` | Keep both during migration |

### Gradual Endpoint Migration

```python
@app.get("/api/cameras")
async def get_cameras(use_vision: bool = False):
    """
    Keep old endpoint, add optional vision support
    """
    if use_vision and vision_manager:
        # Return vision-enhanced data
        return vision_manager.get_all_cameras_status()
    else:
        # Return traditional data
        return camera_manager.get_cameras()
```

---

## 📊 Monitoring Migration Progress

### Create a Migration Dashboard Endpoint

```python
@app.get("/api/migration/status")
async def migration_status():
    """Track migration progress"""
    return {
        "phase": "parallel_operation",  # Update as you progress
        "old_system": {
            "active": camera_manager is not None,
            "cameras": len(camera_manager.cameras) if camera_manager else 0
        },
        "new_system": {
            "active": vision_manager is not None,
            "cameras": len(vision_manager.vision_cameras) if vision_manager else 0,
            "frames_captured": vision_manager.frames_captured if vision_manager else 0
        },
        "integration": {
            "scene_sync": "enabled",  # Update based on your config
            "recording_vision": "enabled",
            "auto_switching": "testing"
        }
    }
```

---

## 🧪 Testing Checklist

### During Migration

- [ ] Old camera endpoints still work
- [ ] New vision endpoints respond
- [ ] Scene updates sync to vision
- [ ] Recording still works
- [ ] Camera switching still works
- [ ] WebSocket connections stable
- [ ] No memory leaks (check after 1 hour)
- [ ] No performance degradation

### Before Going Full Vision

- [ ] Vision cameras see correct objects
- [ ] Frame quality assessment accurate
- [ ] Auto camera selection works well
- [ ] Exposure calculations reasonable
- [ ] WebSocket streaming smooth
- [ ] Integration with recording smooth
- [ ] No conflicts with old system

---

## 🚨 Rollback Plan

If something goes wrong, you can instantly rollback:

```python
@app.on_event("startup")
async def startup():
    global camera_manager, vision_manager
    
    # Enable/disable vision with environment variable
    ENABLE_VISION = os.getenv("ENABLE_VISION", "true").lower() == "true"
    
    # Old system (always works)
    camera_manager = CameraManager(data_dir=DATA_DIR)
    await camera_manager.start_monitoring()
    
    # New system (can be disabled)
    if ENABLE_VISION:
        try:
            vision_manager = create_integrated_vision_manager(
                camera_manager=camera_manager,
                data_dir=DATA_DIR
            )
            await setup_default_cameras(vision_manager)
            integrate_vision_with_fastapi(app, vision_manager)
        except Exception as e:
            print(f"Vision system failed: {e}")
            vision_manager = None
    else:
        print("Vision system disabled")
        vision_manager = None
```

**Rollback Command:**
```bash
# Disable vision system
export ENABLE_VISION=false
systemctl restart pubcast

# Re-enable
export ENABLE_VISION=true
systemctl restart pubcast
```

---

## 📈 Migration Timeline

### Recommended Schedule

**Week 1: Installation & Testing**
- Day 1-2: Install vision system in dev
- Day 3-4: Test parallel operation
- Day 5: Load testing

**Week 2: Integration**
- Day 1-2: Add scene synchronization
- Day 3-4: Migrate recording system
- Day 5: Migrate camera switching

**Week 3: Optimization**
- Day 1-2: Fine-tune vision settings
- Day 3-4: Performance optimization
- Day 5: Documentation update

**Week 4: Production**
- Day 1-2: Deploy to staging
- Day 3: Production deployment
- Day 4-5: Monitoring & tweaks

---

## 🎯 Success Criteria

Migration is successful when:

✅ **Functionality**
- All old features still work
- All new vision features work
- Scene stays synchronized
- No camera conflicts

✅ **Performance**
- Response times unchanged or better
- Memory usage acceptable
- CPU usage acceptable
- No frame drops in streaming

✅ **Reliability**
- No crashes for 24 hours
- Graceful degradation if vision fails
- Clean error messages
- Logging comprehensive

✅ **User Experience**
- Camera switching smooth
- Vision data accurate
- WebSocket stable
- UI responsive

---

## 💡 Pro Tips

### Tip 1: Feature Flags

Use feature flags for gradual rollout:

```python
VISION_FEATURES = {
    "auto_camera_selection": os.getenv("VISION_AUTO_SELECT", "false") == "true",
    "scene_sync": os.getenv("VISION_SCENE_SYNC", "true") == "true",
    "websocket_streaming": os.getenv("VISION_WS", "true") == "true",
}

if VISION_FEATURES["auto_camera_selection"]:
    # Use vision-based auto selection
else:
    # Use old logic
```

### Tip 2: A/B Testing

Run both systems and compare:

```python
async def select_camera():
    # Get choice from both systems
    old_choice = camera_manager.get_best_camera()
    new_choice = vision_manager.get_best_camera()
    
    # Log for comparison
    logger.info(f"Camera selection: old={old_choice}, new={new_choice}")
    
    # Use new or old based on config
    return new_choice if USE_VISION else old_choice
```

### Tip 3: Gradual User Rollout

```python
def should_use_vision(user_id: str) -> bool:
    """Gradually roll out vision to users"""
    # Hash user ID to get consistent bucket
    bucket = int(hashlib.md5(user_id.encode()).hexdigest(), 16) % 100
    
    # Enable for X% of users
    rollout_percentage = int(os.getenv("VISION_ROLLOUT_PCT", "0"))
    return bucket < rollout_percentage

# Then in your code:
if should_use_vision(user.id):
    # Use vision system
else:
    # Use old system
```

---

## 🆘 Common Migration Issues

### Issue: Vision cameras don't see anything

**Solution:**
```python
# Check scene format matches
objects = vision_manager.current_scene_objects
print(f"Scene objects: {objects}")

# Verify conversion
test_scene = {"avatars": [...]}  # Your format
converted = convert_scene_to_vision_objects(test_scene)
print(f"Converted: {converted}")
```

### Issue: Performance degradation

**Solution:**
```python
# Reduce update frequency
VISION_UPDATE_INTERVAL = 0.5  # Update every 500ms instead of every frame

async def scheduled_vision_update():
    while True:
        await vision_manager.update_all_cameras()
        await asyncio.sleep(VISION_UPDATE_INTERVAL)
```

### Issue: Memory leaks

**Solution:**
```python
# Limit frame buffer size
for bot in vision_manager.vision_cameras.values():
    bot.stream_config.buffer_size = 30  # Reduce from 60

# Clear old frames periodically
async def cleanup_task():
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        for bot in vision_manager.vision_cameras.values():
            if len(bot.frame_buffer) > 50:
                bot.frame_buffer = bot.frame_buffer[-30:]
```

---

## ✅ Final Migration Checklist

- [ ] Vision system installed
- [ ] Both systems running in parallel
- [ ] Scene synchronization working
- [ ] Recording migrated
- [ ] Camera switching migrated
- [ ] Performance acceptable
- [ ] Monitoring in place
- [ ] Rollback plan tested
- [ ] Team trained
- [ ] Documentation updated
- [ ] Old code can be safely removed

---

**Congratulations! You've successfully migrated to camera vision! 🎉**

Your cameras can now SEE! 👁️📹
