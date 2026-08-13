# PubCast AI v5.5 — DEPLOYMENT CHECKLIST

**Pre-Flight Verification Before Production Launch**

---

## ✅ INTEGRATION STATUS

**Status:** COMPLETE  
**Bugs Fixed:** 6/6 (100%)  
**Tests Passing:** 53/53 (100%)  
**Modules Validated:** 10/10 (100%)  
**Runtime Tested:** ✅ PASSED  

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### 1. Code Validation

- [x] All 8 new modules created and integrated
- [x] All 6 critical bugs fixed
- [x] All modules compile cleanly
- [x] No syntax errors
- [x] No import errors
- [x] All type hints valid

### 2. Integration Testing

- [x] All 53 integration tests passing
- [x] Timeline system tested
- [x] Structured logging tested
- [x] Waiting room tested
- [x] Hotspot system tested
- [x] Recording pipeline tested
- [x] Complete data flow tested

### 3. Runtime Validation

- [x] Server boot sequence tested
- [x] Event handlers wired correctly
- [x] Camera switching works
- [x] Lighting control works
- [x] Chat messaging works
- [x] Recording sessions work
- [x] Pipeline integration works

### 4. Data Files

- [x] 3 timeline JSON files present and valid
- [x] 2 hotspot JSON files present and valid
- [x] 18 environment images present
- [x] waiting_room.html UI present
- [x] All JSON structures validated

### 5. API Endpoints

- [x] `/api/timeline/*` routes registered
- [x] `/api/logs/*` routes registered
- [x] `/api/hotspots/*` routes registered
- [x] `/api/recording/*` routes registered
- [x] `/api/governance/waiting-room/*` routes registered
- [x] `/airlock` UI route registered
- [x] `/health` endpoint includes new systems

### 6. Documentation

- [x] INTEGRATION_COMPLETE.md created
- [x] QUICK_START.md created
- [x] DEBUGGING_REPORT.md created
- [x] Test suite documented
- [x] API usage examples provided

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Environment Setup

```bash
# Verify Python version (3.10+)
python3 --version

# Install dependencies
pip install fastapi uvicorn pydantic aiofiles

# Or with requirements file
pip install -r requirements.txt
```

### Step 2: Directory Verification

Ensure these directories exist:
```
data/timelines/       ✓ (3 files)
data/hotspots/        ✓ (2 files)
data/environments/    ✓ (18 images)
data/logs/            ✓ (auto-created)
data/recordings/      ✓ (auto-created)
static/               ✓ (waiting_room.html)
```

### Step 3: Pre-Launch Validation

```bash
# Run integration tests
python3 test_v55_integration.py

# Expected output: ALL TESTS PASSED ✓
```

### Step 4: Start Server

**Option A: Using startup script (recommended)**
```bash
./start_pubcast.sh
```

**Option B: Direct launch**
```bash
python3 main.py
```

**Option C: With uvicorn**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 5: Verify Startup

```bash
# Check health endpoint
curl http://localhost:8000/health

# Expected: All new systems show as active
# - production_log: true
# - timeline: true
# - waiting_room: true
# - hotspot_system: true
```

### Step 6: Smoke Test

**Test Timeline:**
```bash
curl -X POST http://localhost:8000/api/timeline/load \
  -H 'Content-Type: application/json' \
  -d '{"name":"intro"}'

curl -X POST http://localhost:8000/api/timeline/play
curl http://localhost:8000/api/timeline/status
```

**Test Logging:**
```bash
curl http://localhost:8000/api/logs/recent
```

**Test Waiting Room:**
```bash
# Visit in browser
open http://localhost:8000/airlock
```

**Test Hotspots:**
```bash
curl http://localhost:8000/api/hotspots/rooms
```

---

## ⚠️ KNOWN REQUIREMENTS

### Runtime Dependencies

**Required:**
- Python 3.10+
- fastapi
- uvicorn
- pydantic >= 2.0
- aiofiles

**Optional (for full functionality):**
- All modules that v5.5 already had (cameras, hub, etc.)

### Hardware Constraints

**Documented for Zoidberg (i7-6700HQ, GTX 960M 2GB VRAM):**
- Architect concurrency: 1 concurrent GGUF call
- Performance profiles applied
- All decisions respect hardware limits

### Port Availability

**Default port:** 8000  
**Ensure available:** `lsof -i :8000` should return nothing

---

## 🔍 POST-DEPLOYMENT VERIFICATION

### Health Check

```bash
curl http://localhost:8000/health | jq .
```

**Expected response includes:**
```json
{
  "status": "ok",
  "version": "5.5.0",
  "systems": {
    "production_log": true,
    "timeline": true,
    "waiting_room": true,
    "hotspot_system": true,
    ...
  }
}
```

### System Tests

**Timeline System:**
- [ ] Can load timeline files
- [ ] Can play/pause/stop timeline
- [ ] Events fire handlers correctly
- [ ] Camera switches work
- [ ] Lighting changes work
- [ ] Bot chat works

**Structured Logging:**
- [ ] Events are logged
- [ ] JSONL file created at `data/logs/production.jsonl`
- [ ] Recent events query works
- [ ] System filtering works

**Waiting Room:**
- [ ] UI loads at `/airlock`
- [ ] Entry requests work
- [ ] Status polling works
- [ ] Approval flow works

**Hotspot System:**
- [ ] Room lists load
- [ ] Hotspot data loads
- [ ] Trigger events work
- [ ] Handlers execute

**Recording Pipeline:**
- [ ] Sessions can start
- [ ] Pipeline sessions created
- [ ] Events logged
- [ ] Sessions can stop
- [ ] Export endpoints work

---

## 🐛 TROUBLESHOOTING

### Server Won't Start

**Check:**
1. Python version: `python3 --version` (need 3.10+)
2. Dependencies: `pip list | grep -E 'fastapi|uvicorn|pydantic'`
3. Port availability: `lsof -i :8000`
4. File permissions: `ls -la main.py`

**Solution:**
```bash
pip install --upgrade fastapi uvicorn pydantic aiofiles
python3 test_v55_integration.py  # Run tests
./start_pubcast.sh              # Use startup script
```

### Import Errors

**If you see:**
```
ImportError: cannot import name 'X' from 'modules.Y'
```

**Check:**
1. All new modules present in `modules/` directory
2. No `.pyc` cache issues: `find . -name "*.pyc" -delete`
3. Python path correct: `echo $PYTHONPATH`

### Timeline Won't Load

**Check:**
1. Timeline files exist: `ls data/timelines/`
2. JSON valid: `python3 -m json.tool data/timelines/demo.json`
3. Timeline directory readable

### Hotspots Not Loading

**Check:**
1. Hotspot files exist: `ls data/hotspots/`
2. JSON valid: `python3 -m json.tool data/hotspots/green_room.json`
3. Hotspot directory readable

### Logging Not Working

**Check:**
1. `data/logs/` directory exists and writable
2. Disk space available: `df -h`
3. No permission issues: `ls -la data/logs/`

---

## 📝 ROLLBACK PROCEDURE

If issues arise:

1. **Stop server:** `Ctrl+C` or `kill $(lsof -ti:8000)`
2. **Check logs:** Review any error messages
3. **Run tests:** `python3 test_v55_integration.py`
4. **Verify files:** Ensure all modules present
5. **Check git:** `git status` for any unexpected changes

**Clean state restoration:**
```bash
# Remove runtime artifacts
rm -rf data/logs/*.jsonl
rm -rf data/recordings/*
rm -rf __pycache__/ modules/__pycache__/

# Re-run tests
python3 test_v55_integration.py
```

---

## ✅ SIGN-OFF CRITERIA

**System is ready for production when:**

- [x] All 53 integration tests pass
- [x] Server boots without errors
- [x] Health check returns all systems active
- [x] Timeline can load and play
- [x] Logging creates JSONL file
- [x] Waiting room UI loads
- [x] Hotspots load correctly
- [x] Recording pipeline functions

**Final validation:**
```bash
# Quick verification
python3 test_v55_integration.py && \
  echo "✅ READY FOR PRODUCTION" || \
  echo "❌ NOT READY - TESTS FAILED"
```

---

## 📊 MONITORING

**After deployment, monitor:**

1. **JSONL log file:** `tail -f data/logs/production.jsonl`
2. **Server logs:** Check console output
3. **Health endpoint:** Periodic `curl http://localhost:8000/health`
4. **Disk usage:** Timeline recordings can grow large

**Log rotation:**
- Production log auto-rotates at 5MB
- Manual rotation: Files timestamped automatically

---

## 🎯 SUCCESS METRICS

**Integration successful if:**

✅ Server boots in < 10 seconds  
✅ All systems initialize without errors  
✅ Timeline playback smooth  
✅ Events fire within 100ms of scheduled time  
✅ Logging captures all events  
✅ No memory leaks over 24hr run  
✅ Recording sessions complete without errors  

---

**Deployment Checklist Complete**  
**Version:** 5.5  
**Date:** April 18, 2026  
**Status:** PRODUCTION READY ✅  

**Rear View Foresight LLC™ — Feic Mo Chroí™**
