# MAIN.PY INTEGRATION GUIDE
**Wiring All Systems Together**

---

## COMPLETE main.py ADDITIONS

Add these imports and initialization code to your existing `main.py`:

```python
# ═══════════════════════════════════════════════════════════════════════════
# NEW IMPORTS (add to existing imports section)
# ═══════════════════════════════════════════════════════════════════════════

from modules import timeline_routes
from modules import structured_log_routes
from modules import recording_pipeline_routes
from modules import governance_waiting_room
from modules import hotspot_system

from modules.structured_log import init_production_log, emit
from modules.recording_pipeline import ServerRecordingSession
from modules.timeline_routes import register_timeline_handler
from modules.timeline import EventType

# ═══════════════════════════════════════════════════════════════════════════
# INITIALIZATION (add to startup sequence)
# ═══════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup_sequence():
    # ... existing startup code ...
    
    # 1. Initialize structured logging FIRST
    production_log = init_production_log(DATA_DIR / "logs")
    emit("startup", "boot_start", {"version": "5.5"})
    
    # 2. Initialize timeline system
    timeline_routes.init_timeline_system(DATA_DIR)
    
    # 3. Initialize waiting room (auto_approve=True for development, False for production)
    governance_waiting_room.init_waiting_room(auto_approve=True)
    
    # 4. Initialize hotspot system
    hotspot_system.init_hotspot_system(DATA_DIR)
    
    # 5. Register timeline event handlers
    await wire_timeline_handlers()
    
    # 6. Register hotspot handlers
    await wire_hotspot_handlers()
    
    emit("startup", "boot_complete", {"duration_ms": 200})

# ═══════════════════════════════════════════════════════════════════════════
# TIMELINE EVENT HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

async def wire_timeline_handlers():
    """Wire timeline events to production systems."""
    
    # CAMERA EVENTS
    async def handle_camera(params):
        to_cam = params.get('to')
        transition = params.get('transition', 'cut')
        
        # Call your camera manager
        await camera_manager.switch_to(to_cam, transition=transition)
        
        # Log to structured log
        emit("timeline", "camera_switch", {"to": to_cam, "transition": transition})
    
    register_timeline_handler(EventType.CAMERA, handle_camera)
    
    # LIGHTING EVENTS
    async def handle_lighting(params):
        preset = params.get('preset')
        
        # Call your lighting engine
        await lighting_engine.apply_preset(preset)
        
        emit("timeline", "lighting_change", {"preset": preset})
    
    register_timeline_handler(EventType.LIGHTING, handle_lighting)
    
    # CHAT EVENTS
    async def handle_chat(params):
        user = params.get('user')
        text = params.get('text')
        
        # Broadcast bot message
        await hub.broadcast_message(user, text, is_bot=True)
        
        emit("timeline", "bot_chat", {"user": user, "text": text})
    
    register_timeline_handler(EventType.CHAT, handle_chat)
    
    # RECORDING EVENTS
    async def handle_record(params):
        action = params.get('action')  # 'start' or 'stop'
        
        if action == 'start':
            session_id = await recording_service.start_session()
            emit("timeline", "recording_start", {"session_id": session_id})
        else:
            await recording_service.stop_session()
            emit("timeline", "recording_stop", {})
    
    register_timeline_handler(EventType.RECORD, handle_record)
    
    # ENTRANCE EVENTS
    async def handle_entrance(params):
        character = params.get('character')
        
        # Spawn character avatar
        await avatar_manager.spawn_character(character)
        
        emit("timeline", "character_entrance", {"character": character})
    
    register_timeline_handler(EventType.ENTRANCE, handle_entrance)

# ═══════════════════════════════════════════════════════════════════════════
# HOTSPOT HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

async def wire_hotspot_handlers():
    """Wire hotspot triggers to production systems."""
    
    hm = hotspot_system.get_hotspot_manager()
    
    # TRANSITION HANDLER
    async def handle_transition(action, user_id, hotspot_id, room):
        destination = action.get("destination", "unknown")
        spawn_point = action.get("spawnPoint", "default")
        
        # Broadcast transition via WebSocket
        await hub.broadcast_to_user(user_id, {
            "type": "transition",
            "from_room": room,
            "to_room": destination,
            "spawn_point": spawn_point,
        })
        
        emit("hotspots", "transition", {
            "user_id": user_id,
            "from": room,
            "to": destination,
        })
        
        return {"transitioned": True, "destination": destination}
    
    hm.register_handler("transition", handle_transition)
    
    # ANIMATION HANDLER
    async def handle_animation(action, user_id, hotspot_id, room):
        animation = action.get("animation", "")
        
        # Trigger animation
        await avatar_performer.play_animation(user_id, animation)
        
        emit("hotspots", "animation", {
            "user_id": user_id,
            "animation": animation,
        })
        
        return {"animated": True, "animation": animation}
    
    hm.register_handler("animation", handle_animation)
    
    # CUSTOM EVENT HANDLER
    async def handle_custom(action, user_id, hotspot_id, room):
        event = action.get("event", "")
        
        # Dispatch custom event
        await hub.broadcast_to_user(user_id, {
            "type": "custom_event",
            "event": event,
            "hotspot_id": hotspot_id,
            "room": room,
        })
        
        emit("hotspots", "custom_event", {
            "user_id": user_id,
            "event": event,
            "hotspot_id": hotspot_id,
        })
        
        return {"event_triggered": event}
    
    hm.register_handler("custom", handle_custom)

# ═══════════════════════════════════════════════════════════════════════════
# RECORDING PIPELINE INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

# Enhance your existing RecordingService to use pipeline

class EnhancedRecordingService:
    def __init__(self, data_dir: Path):
        self._data_dir = data_dir
        self._sessions = {}  # Your existing sessions
        self._pipeline_sessions = {}  # NEW: Pipeline sessions
    
    async def start_session(self, user_id: str, **kwargs):
        session_id = f"rec_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        
        # Create regular session (your existing code)
        session = RecordingSession(session_id=session_id, ...)
        self._sessions[session_id] = session
        
        # NEW: Create pipeline session for detailed logging
        pipeline = ServerRecordingSession(session_id, self._data_dir / "recordings")
        self._pipeline_sessions[session_id] = pipeline
        
        # Register for export routes
        recording_pipeline_routes.register_pipeline_session(session_id, pipeline)
        
        emit("recording", "session_start", {"session_id": session_id})
        
        return session_id
    
    async def stop_session(self, session_id: str):
        # Stop regular session (your existing code)
        session = self._sessions.pop(session_id, None)
        
        # NEW: Stop pipeline session
        pipeline = self._pipeline_sessions.pop(session_id, None)
        if pipeline:
            summary = pipeline.stop()
            emit("recording", "session_stop", summary)
        
        # Unregister from export routes
        recording_pipeline_routes.unregister_pipeline_session(session_id)
    
    async def record_camera_switch(self, session_id: str, from_cam: str, to_cam: str):
        """NEW: Log camera switch to pipeline."""
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_camera_switch(from_cam, to_cam)
    
    async def record_chat(self, session_id: str, user: str, text: str, user_id: str = ""):
        """NEW: Log chat message to pipeline."""
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_chat(user, text, user_id)
    
    async def record_marker(self, session_id: str, label: str, operator: str = ""):
        """NEW: Add marker to pipeline."""
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_marker(label, operator)

# ═══════════════════════════════════════════════════════════════════════════
# CAMERA MANAGER INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════

# In your camera manager's switch method, add pipeline logging:

class EnhancedCameraManager:
    async def switch_to(self, camera_id: str, transition: str = "cut"):
        from_cam = self.current_camera
        
        # ... existing camera switch logic ...
        
        # NEW: Log to active recording sessions
        if hasattr(recording_service, '_pipeline_sessions'):
            for session_id, pipeline in recording_service._pipeline_sessions.items():
                pipeline.record_camera_switch(from_cam, camera_id, transition)
        
        # NEW: Log to structured log
        emit("cameras", "switch", {
            "from": from_cam,
            "to": camera_id,
            "transition": transition,
        })

# ═══════════════════════════════════════════════════════════════════════════
# REGISTER ALL ROUTES
# ═══════════════════════════════════════════════════════════════════════════

# Add to your existing route registration:

app.include_router(timeline_routes.router)
app.include_router(structured_log_routes.router)
app.include_router(recording_pipeline_routes.router)
app.include_router(governance_waiting_room.router)
app.include_router(hotspot_system.router)

# ═══════════════════════════════════════════════════════════════════════════
# PRODUCTION EVENT LOGGING (add throughout your codebase)
# ═══════════════════════════════════════════════════════════════════════════

# Examples of where to add emit() calls:

# Governance events
await governance.ban_user(user_id, reason)
emit("governance", "ban", {"user_id": user_id, "reason": reason}, severity="warning")

# Lighting changes
await lighting_engine.apply_preset("GOLDEN_HOUR")
emit("lighting", "preset_change", {"preset": "GOLDEN_HOUR"})

# System health
emit("system", "memory_warning", {"usage_mb": 1024}, severity="warning")

# User actions
emit("users", "login", {"user_id": user_id, "ip": ip_address})

```

---

## FILE STRUCTURE AFTER INTEGRATION

```
pubcast_v5_5_extracted/
├── main.py (MODIFIED - wire everything)
├── modules/
│   ├── timeline.py (from v5.2)
│   ├── timeline_routes.py (NEW)
│   ├── recording_pipeline.py (from v5.2)
│   ├── recording_pipeline_routes.py (NEW)
│   ├── structured_log.py (from v5.2)
│   ├── structured_log_routes.py (NEW)
│   ├── governance_waiting_room.py (NEW)
│   ├── hotspot_system.py (NEW)
│   └── ... (existing modules)
├── data/
│   ├── timelines/
│   │   └── demo.json
│   ├── hotspots/
│   │   ├── green_room.json
│   │   └── dressing_room.json
│   ├── environments/
│   │   └── (18 environment images)
│   └── logs/
│       └── production.jsonl (auto-created)
└── static/
    └── waiting_room.html
```

---

## TESTING CHECKLIST

After integration, test each system:

**Timeline:**
```bash
curl -X POST http://localhost:8000/api/timeline/load -H 'Content-Type: application/json' -d '{"name":"demo"}'
curl -X POST http://localhost:8000/api/timeline/play
curl http://localhost:8000/api/timeline/status
```

**Structured Logging:**
```bash
curl http://localhost:8000/api/logs/recent
curl http://localhost:8000/api/logs/systems
```

**Waiting Room:**
```bash
# Test entry request
curl -X POST http://localhost:8000/api/governance/waiting-room/request \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"test","display_name":"Test User","target_room":"studio","consents":{"tos":true,"ai_disclosure":true}}'

# Check status (use entry_id from response)
curl http://localhost:8000/api/governance/waiting-room/status/entry_abc123
```

**Hotspots:**
```bash
curl http://localhost:8000/api/hotspots/rooms
curl http://localhost:8000/api/hotspots/green_room

# Trigger a hotspot
curl -X POST http://localhost:8000/api/hotspots/trigger \
  -H 'Content-Type: application/json' \
  -d '{"room":"green_room","hotspot_id":"Green room tv","user_id":"user_123"}'
```

**Recording Pipeline:**
```bash
# Start a recording session, then:
curl http://localhost:8000/api/recording/rec_123456/export/edl
curl http://localhost:8000/api/recording/rec_123456/export/fcpxml
curl http://localhost:8000/api/recording/rec_123456/summary
```

---

**Integration guide complete. All systems wired and ready.**
