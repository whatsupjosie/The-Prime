# PubCast v5.5 Integration Package
**Recovered Features + New Additions**

---

## WHAT WAS INTEGRATED

### From v5.2 (Recovered Modules)
```
✓ modules/timeline.py (243 lines)
✓ modules/recording_pipeline.py (106 lines)
✓ modules/structured_log.py (45 lines)
```

### From New Uploads (Fresh Content)
```
✓ static/waiting_room.html (11,897 bytes)
✓ data/hotspots/green_room.json (3,616 bytes)
✓ data/hotspots/dressing_room.json (3,320 bytes)
✓ DREAMS engine (1,654 lines) - distributed_engine_node_PATCHED.py
```

---

## 1. TIMELINE SYSTEM (Recovered from v5.2)

### File: modules/timeline.py (243 lines)

**What It Does:**
Deterministic show automation - script entire productions with precise timing.

**Integration Steps:**

**Step 1: Create FastAPI Router**
Create `modules/timeline_routes.py`:
```python
from fastapi import APIRouter, HTTPException
from pathlib import Path
from .timeline import TimelinePlayer, TimelineDefinition

router = APIRouter(prefix="/api/timeline", tags=["Timeline"])
player = TimelinePlayer()

@router.get("/")
async def get_status():
    return {
        "state": player.state.value,
        "elapsed": player.elapsed,
        "progress": player.progress,
    }

@router.post("/load")
async def load_timeline(name: str):
    path = Path(f"data/timelines/{name}.json")
    if not path.exists():
        raise HTTPException(404, "Timeline not found")
    timeline = TimelineDefinition.load(path)
    player.load_timeline(timeline)
    return {"loaded": name}

@router.post("/play")
async def play():
    player.play()
    return {"action": "playing"}

@router.post("/pause")
async def pause():
    player.pause()
    return {"action": "paused"}

@router.post("/stop")
async def stop():
    player.stop()
    return {"action": "stopped"}

@router.get("/list")
async def list_timelines():
    path = Path("data/timelines")
    path.mkdir(parents=True, exist_ok=True)
    return {"timelines": [f.stem for f in path.glob("*.json")]}
```

**Step 2: Wire Event Handlers**
In `main.py`, register timeline event handlers:
```python
from modules.timeline_routes import router as timeline_router, player

app.include_router(timeline_router)

# Register handlers
player.register_handler(EventType.CAMERA, handle_camera_switch)
player.register_handler(EventType.LIGHTING, handle_lighting_change)
player.register_handler(EventType.CHAT, handle_bot_chat)
player.register_handler(EventType.RECORD, handle_recording)

async def handle_camera_switch(params):
    await camera_manager.switch_to(params['to'])

async def handle_lighting_change(params):
    await lighting_engine.apply_preset(params['preset'])

async def handle_bot_chat(params):
    await bot_manager.say(params['user'], params['text'])

async def handle_recording(params):
    if params['action'] == 'start':
        await recording_service.start_session()
    else:
        await recording_service.stop_session()
```

**Step 3: Create Example Timeline**
Create `data/timelines/demo.json`:
```json
{
  "name": "Demo Show",
  "description": "Automated 2-minute demo",
  "duration": 120.0,
  "loop": false,
  "events": [
    {"t": 0.0, "type": "lighting", "params": {"preset": "GOLDEN_HOUR"}, "label": "Warmup"},
    {"t": 2.0, "type": "camera", "params": {"to": "cam_1"}, "label": "Wide shot"},
    {"t": 5.0, "type": "chat", "params": {"user": "pete", "text": "Welcome to PubCast!"}, "critical": true},
    {"t": 10.0, "type": "camera", "params": {"to": "cam_2"}, "label": "Medium"},
    {"t": 15.0, "type": "record", "params": {"action": "start"}, "critical": true},
    {"t": 110.0, "type": "record", "params": {"action": "stop"}, "critical": true}
  ]
}
```

**Step 4: Test**
```bash
# Start system
python main.py

# Load timeline
curl -X POST http://localhost:8000/api/timeline/load?name=demo

# Play
curl -X POST http://localhost:8000/api/timeline/play

# Check status
curl http://localhost:8000/api/timeline/
```

---

## 2. RECORDING PIPELINE (Recovered from v5.2)

### File: modules/recording_pipeline.py (106 lines)

**What It Does:**
Server-side detailed event logging with EDL/FCP XML export.

**Integration Steps:**

**Step 1: Merge with Existing Recording System**
Edit `modules/recording.py`:
```python
from .recording_pipeline import ServerRecordingSession

class RecordingService:
    def __init__(self, data_dir: Path):
        # ... existing init ...
        self._pipeline_sessions: Dict[str, ServerRecordingSession] = {}
    
    async def start_session(self, ...):
        # Create regular session
        session = RecordingSession(...)
        self._sessions[session_id] = session
        
        # Also create pipeline session for detailed logging
        pipeline = ServerRecordingSession(session_id, self._data_dir)
        self._pipeline_sessions[session_id] = pipeline
        
        return session_id
    
    async def record_camera_switch(self, session_id, from_cam, to_cam):
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_camera_switch(from_cam, to_cam)
    
    async def record_chat(self, session_id, user, text, user_id=""):
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_chat(user, text, user_id)
    
    async def record_marker(self, session_id, label, operator=""):
        if session_id in self._pipeline_sessions:
            self._pipeline_sessions[session_id].record_marker(label, operator)
```

**Step 2: Add Export Endpoints**
Add to `modules/production_routes.py`:
```python
@router.get("/recording/{session_id}/export/edl")
async def export_edl(session_id: str):
    if session_id not in recording_service._pipeline_sessions:
        raise HTTPException(404, "Session not found")
    
    pipeline = recording_service._pipeline_sessions[session_id]
    edl_content = pipeline.export_edl()
    
    return Response(
        content=edl_content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={session_id}.edl"}
    )

@router.get("/recording/{session_id}/export/fcpxml")
async def export_fcpxml(session_id: str):
    if session_id not in recording_service._pipeline_sessions:
        raise HTTPException(404, "Session not found")
    
    pipeline = recording_service._pipeline_sessions[session_id]
    xml_content = pipeline.export_fcpxml()
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename={session_id}.fcpxml"}
    )
```

**Step 3: Wire Camera Switches to Pipeline**
In camera manager callbacks:
```python
async def on_camera_switch(self, from_cam: str, to_cam: str):
    # Existing camera switch logic...
    
    # Log to active recording sessions
    if self.current_session_id:
        await recording_service.record_camera_switch(
            self.current_session_id, from_cam, to_cam
        )
```

---

## 3. STRUCTURED LOGGING (Recovered from v5.2)

### File: modules/structured_log.py (45 lines)

**What It Does:**
JSONL production event logging with real-time subscriptions.

**Integration Steps:**

**Step 1: Initialize on Boot**
In `main.py`:
```python
from modules.structured_log import init_production_log, emit

# During startup
production_log = init_production_log(DATA_DIR / "logs")

# Log production events
emit("startup", "boot_complete", {"duration_ms": 200})
```

**Step 2: Wire Key Production Events**
```python
# Camera switches
@camera_manager.on_switch
async def log_camera_switch(from_cam, to_cam):
    emit("cameras", "switch", {"from": from_cam, "to": to_cam})

# Recording
@recording_service.on_start
async def log_recording_start(session_id):
    emit("recording", "start", {"session_id": session_id})

# Lighting
@lighting_engine.on_preset_change
async def log_lighting(preset):
    emit("lighting", "preset_change", {"preset": preset})

# Governance
@governance.on_ban
async def log_ban(user_id, reason):
    emit("governance", "ban", {"user_id": user_id, "reason": reason}, severity="warning")
```

**Step 3: Add Query Endpoint**
```python
from modules.structured_log import get_production_log

@router.get("/api/logs/recent")
async def get_recent_logs(limit: int = 50, system: str = None, severity: str = None):
    log = get_production_log()
    if not log:
        return {"events": []}
    return {"events": log.recent(limit, system, severity)}
```

**Step 4: WebSocket Real-Time Feed**
```python
from modules.structured_log import get_production_log

@app.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket):
    await websocket.accept()
    
    def on_event(event):
        asyncio.create_task(websocket.send_json(event))
    
    get_production_log().subscribe(on_event)
    
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        pass
```

---

## 4. WAITING ROOM UI (New Upload)

### File: static/waiting_room.html (11,897 bytes)

**What It Does:**
Professional "Airlock" UI for consent/entry flow with Art Deco styling.

**Features:**
- Step 1: Terms & Consent (TOS, AI disclosure, recording consent)
- Step 2: Identity (display name, avatar color picker)
- Step 3: Waiting (host approval spinner)
- Step 4: Approved (enter stage button)

**Integration:**
```python
# In main.py, add route
@app.get("/airlock")
async def serve_airlock():
    return FileResponse("static/waiting_room.html")
```

**User Flow:**
```
User visits /airlock
  → Accepts terms
  → Enters name + picks color
  → Clicks "ENTER AIRLOCK"
  → POST /api/governance/waiting-room/request
  → Waits for approval
  → Redirects to /static/stage.html
```

**Already Wired:**
- Calls `/api/governance/terms` for terms text
- Calls `/api/governance/consent` to record consents
- Calls `/api/governance/waiting-room/request` for entry
- Currently auto-approves after 2 seconds (needs real polling)

**To Complete:**
Add polling endpoint in `modules/governance_routes.py`:
```python
@router.get("/waiting-room/status/{entry_id}")
async def check_entry_status(entry_id: str):
    # Check if entry was approved
    entry = governance.get_entry(entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    
    return {
        "status": entry.status,  # "pending" | "approved" | "denied"
        "room": entry.target_room,
    }
```

---

## 5. HOTSPOT SYSTEM (New Uploads)

### Files:
- `data/hotspots/green_room.json` (3,616 bytes)
- `data/hotspots/dressing_room.json` (3,320 bytes)

**What They Define:**
Interactive hotspots on room backgrounds with triggers and actions.

**Green Room Hotspots (8 total):**
1. **Green room tv** — Animation: turn on TV, flip channels
2. **Door to writers room/theater hall** — Menu popup, transition
3. **Control room door** — Transition to control room
4. **Door to studio** — Transition to studio wide shot
5. **Door to dressing room** — Transition to dressing room
6. **Door to vortex bar** — Transition to vortex bar
7. **Sit (couch left)** — Animation: sit and watch TV
8. **Couch** — Animation: sit and watch TV

**Dressing Room Hotspots (8 total):**
1. **Door to Green Room** — Transition back
2. **Avatar Foundry** — Launch avatar maker
3. **Message board** — Check messages
4. **Makeup station** — Hair and makeup UI
5. **Typewriter** — First-person typing interface
6. **Phone** — Video call/meeting interface
7. **Wardrobe** — Clothing maker menu
8. **Scripts** — View/read/comment on scripts

**Integration Plan:**

**Step 1: Check Existing Hotspot System**
v5.5 already has `modules/pubworld_hotspots.py`. Check if it loads these JSON files:
```python
# In pubworld_hotspots.py, verify it loads from data/hotspots/
```

**Step 2: Wire Hotspot Actions**
Map hotspot action types to handlers:
```python
HOTSPOT_HANDLERS = {
    "transition": handle_room_transition,
    "animation": handle_animation_trigger,
    "custom": handle_custom_event,
}

async def handle_room_transition(action, user_id):
    destination = action['destination']
    spawn_point = action.get('spawnPoint', 'default')
    # Emit transition event via WebSocket
    await hub.broadcast(user_id, {
        "type": "transition",
        "room": destination,
        "spawn": spawn_point,
    })

async def handle_animation_trigger(action, user_id):
    animation = action['animation']
    # Trigger avatar animation
    await avatar_performer.play_animation(user_id, animation)

async def handle_custom_event(action, user_id):
    event = action['event']
    # Dispatch custom events (typewriter, phone, wardrobe, etc.)
    await hub.broadcast(user_id, {
        "type": "custom_event",
        "event": event,
    })
```

**Step 3: Add Hotspot Trigger Endpoint**
```python
@router.post("/hotspot/trigger")
async def trigger_hotspot(room: str, hotspot_id: str, user_id: str):
    hotspot = hotspot_manager.get_hotspot(room, hotspot_id)
    if not hotspot:
        raise HTTPException(404, "Hotspot not found")
    
    handler = HOTSPOT_HANDLERS.get(hotspot['action']['type'])
    if handler:
        await handler(hotspot['action'], user_id)
    
    return {"triggered": hotspot_id}
```

---

## 6. DREAMS ENGINE (CRITICAL - New Upload)

### File: distributed_engine_node_PATCHED.py (1,654 lines)

**What It Is:**
The actual voxel rendering engine that bridge_bulletproof.py is designed to communicate with.

**Integration Steps:**

**Step 1: Copy to v5.5**
```bash
cp /home/claude/DREAMS/full_codebase/engine_fixes/distributed_engine_node_PATCHED.py \
   /home/claude/pubcast_v5_5_extracted/modules/distributed_engine.py
```

**WAIT - Check First:**
v5.5 already has `modules/evo/distributed_engine.py` (542 lines). These might be DIFFERENT:
- EVO version (542 lines) — Four-engine resource allocation
- DREAMS version (1,654 lines) — Actual voxel renderer

**Step 2: Verify Compatibility**
Read both files to understand:
1. Are they the same codebase at different versions?
2. Is DREAMS the actual renderer and EVO is just the orchestrator?
3. Do they need to coexist or merge?

**Step 3: Integration Strategy (TBD)**
```
Option A: DREAMS is the renderer, EVO is the scheduler
  → Keep both
  → EVO calls DREAMS for actual rendering
  
Option B: DREAMS supersedes EVO
  → Replace modules/evo/distributed_engine.py with DREAMS version
  → Update imports
  
Option C: Merge the two
  → Combine DREAMS rendering + EVO orchestration
  → Requires careful merging
```

**This needs Josie's decision.**

---

## INTEGRATION SUMMARY

### Completed:
✓ **timeline.py** copied to modules/
✓ **recording_pipeline.py** copied to modules/
✓ **structured_log.py** copied to modules/
✓ **waiting_room.html** copied to static/
✓ **green_room.json** copied to data/hotspots/
✓ **dressing_room.json** copied to data/hotspots/

### Next Steps:
1. **Create timeline_routes.py** (1 hour)
2. **Wire recording_pipeline into recording.py** (1 hour)
3. **Wire structured_log into main.py** (30 min)
4. **Complete waiting_room polling** (30 min)
5. **Wire hotspot triggers** (1 hour)
6. **DREAMS engine integration** (TBD - needs analysis)

### Total Integration Time (excluding DREAMS):
**~4-5 hours of wiring work**

---

## TESTING CHECKLIST

After integration:

**Timeline System:**
- [ ] Create demo timeline
- [ ] Load via API
- [ ] Play/pause/stop work
- [ ] Events trigger correctly
- [ ] Loop works

**Recording Pipeline:**
- [ ] Camera switches logged
- [ ] Chat messages logged
- [ ] Markers work
- [ ] EDL export works
- [ ] FCP XML export works

**Structured Logging:**
- [ ] Events log to JSONL
- [ ] Real-time subscriptions work
- [ ] Query API works
- [ ] File rotation works

**Waiting Room:**
- [ ] Terms load
- [ ] Consent checkboxes work
- [ ] Name + color picker work
- [ ] Entry request works
- [ ] Polling works (after implementing)
- [ ] Redirect to stage works

**Hotspots:**
- [ ] Green room hotspots trigger
- [ ] Dressing room hotspots trigger
- [ ] Transitions work
- [ ] Animations trigger
- [ ] Custom events dispatch

---

**Rear View Foresight LLC — Feic Mo Chroí™**  
**Integration Package — April 18, 2026**  
**Status: READY FOR WIRING**
