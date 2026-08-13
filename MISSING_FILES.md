# MISSING FILES — What You May Need to Provide

This document lists files that may need to be provided based on the comprehensive integration.

---

## FILES THAT DEFINITELY EXIST (Already in codebase)

✅ All 91 modules in `modules/` directory
✅ All EVO submodules in `modules/evo/`
✅ All v5.5 integration files
✅ All route files (newly created + existing)

---

## FILES THAT MAY BE MISSING (Check your backups)

### Data/Configuration Files

1. **Bot Configuration JSONs**
   - Location: `data/bots/*.json`
   - Needed for: Pete, RePete, Sir Purfluous bot configs
   - Status: May exist in your backups
   - Impact: Bots won't load without these

2. **Timeline JSON Files**
   - ✅ `data/timelines/demo.json` - EXISTS
   - ✅ `data/timelines/intro.json` - EXISTS
   - ✅ `data/timelines/three_host_dialog.json` - EXISTS
   - Additional timelines from your backups

3. **Environment Images**
   - ✅ `data/environments/*.png` - 18 images EXISTS
   - Additional room images from your backups

4. **Hotspot Definitions**
   - ✅ `data/hotspots/green_room.json` - EXISTS
   - ✅ `data/hotspots/dressing_room.json` - EXISTS
   - Additional hotspot files for other 16 rooms

5. **Story Bible Data**
   - Location: `data/story/*.json`
   - Needed for: Belle Époque narrative system
   - Status: May exist in your backups
   - Format: Character profiles, story beats, narrative structure

6. **Character Profile Data**
   - Sir Purfluous complete profile
   - Pete complete profile (beyond code)
   - RePete profile
   - Any other character data files

7. **Avatar Assets**
   - Avatar skeleton definitions
   - Avatar texture/model files
   - Mocap calibration data

8. **Lighting Presets**
   - Lighting preset JSON files
   - Custom lighting scenes

9. **Recording Profiles**
   - Recording quality presets
   - Encoder configurations

10. **User Authentication Data**
    - If you had existing users: `data/users/*.json`
    - Auth secrets/keys (should be in env variables)

11. **Vault Data**
    - Any files that were in the vault system
    - Vault configuration

---

## CONFIGURATION FILES THAT MAY BE NEEDED

### 1. Environment Variables (.env file)

```bash
# API Keys (if using BYOK)
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# Auth Secrets (if using auth system)
JWT_SECRET=your_secret_here
JWT_ALGORITHM=HS256

# Database URLs (if using external DBs)
DATABASE_URL=sqlite:///data/pubcast.db

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Ollama Configuration
OLLAMA_HOST=http://localhost:11434

# Hardware Constraints (Zoidberg settings)
MAX_CONCURRENT_GGUF=1
VRAM_LIMIT_MB=2048
```

### 2. Appconfig Settings

Check `modules/appconfig.py` - may need:
- Server host/port overrides
- Path configurations
- Feature flags

---

## SYSTEM-SPECIFIC FILES TO CHECK

### Alex Core
- ✅ `modules/alex_core.py` - EXISTS (871 lines)
- ❓ Alex memory/state data files
- ❓ Grounding anchor configurations

### EVO Subsystem
- ✅ All 10 EVO modules exist in `modules/evo/`
- ❓ EVO configuration files
- ❓ Pete character state data
- ❓ VDI engine trained models (if any)
- ❓ Switchblade priority configurations

### Character Engine
- ✅ `modules/character_engine.py` - EXISTS
- ✅ `modules/character_profiles.py` - EXISTS
- ✅ `modules/sir_purfluous_character_profile.py` - EXISTS
- ❓ Complete character profile data files
- ❓ Character voice samples (if used)

### Universal Memory
- ✅ `modules/universal_memory_system.py` - EXISTS
- ❓ Existing memory database files
- ❓ Memory index files

### LLM Framework
- ✅ `modules/llm_framework.py` - EXISTS
- ✅ `modules/llm_orchestrator.py` - EXISTS
- ✅ `modules/ollama_provider.py` - EXISTS
- ❓ Model configuration files
- ❓ Prompt templates

### Room Systems
- ✅ `modules/room_conductor.py` - EXISTS
- ✅ `modules/pubcast_room_layout.py` - EXISTS
- ❓ Complete room layout definitions
- ❓ Room state persistence files

### Avatar Systems
- ✅ All 6 avatar modules exist
- ❓ Avatar model files
- ❓ Skeleton/rig definitions
- ❓ Animation data

### Mocap
- ✅ `modules/mocap_integration.py` - EXISTS
- ✅ `modules/mocap_precision.py` - EXISTS
- ❓ Mocap calibration data
- ❓ Mocap device configurations

### Vault
- ✅ `modules/vault_engine.py` - EXISTS
- ✅ `modules/vault_engine_hardened.py` - EXISTS
- ❓ Existing vault-protected files
- ❓ Vault encryption keys (should be secure)

---

## HOW TO PROVIDE MISSING FILES

### Step 1: Identify What You Have

Go through your backups and find:
1. `data/` directory with all subdirectories
2. Any `.env` or configuration files
3. Any JSON configuration files
4. Any model/asset files

### Step 2: Organize Files

Create this structure:
```
missing_files/
├── data/
│   ├── bots/           # Bot configs
│   ├── timelines/      # Additional timelines
│   ├── environments/   # Additional images
│   ├── hotspots/       # Additional hotspots
│   ├── story/          # Story bible data
│   ├── memory/         # Memory databases
│   ├── users/          # User data
│   └── vault/          # Vault files
├── config/
│   ├── .env            # Environment variables
│   └── settings.json   # Additional settings
└── assets/
    ├── avatars/        # Avatar assets
    ├── models/         # Model files
    └── audio/          # Audio assets
```

### Step 3: Send Files

Zip up `missing_files/` and we'll integrate them.

---

## WHAT WILL WORK WITHOUT MISSING FILES

### Fully Functional (No additional files needed):
✅ Hub system
✅ Basic rooms
✅ Basic cameras
✅ Inference system (if Ollama is running)
✅ Governance system
✅ Timeline system (with existing 3 timelines)
✅ Structured logging
✅ Hotspots (with existing 2 rooms)
✅ Waiting room
✅ Recording pipeline
✅ WebSocket communication

### Partially Functional (Will work but limited):
⚠️ Bots (need bot config JSONs)
⚠️ BYOK (needs API keys in .env)
⚠️ Story Bible (needs story data files)
⚠️ Character Engine (needs profile data)
⚠️ Memory System (will work but start empty)
⚠️ Lighting (preset files enhance functionality)

### Requires Files to Function:
❌ Alex Core (may need state data)
❌ EVO Subsystem (may need config/model files)
❌ Vault (needs existing vault files if any)
❌ Avatar Systems (needs asset files)
❌ Auth (needs JWT secret)

---

## PRIORITY ORDER FOR FILE RECOVERY

### Priority 1 — Essential for Production
1. Bot configuration JSONs (`data/bots/`)
2. Environment variables (`.env`)
3. Story bible data (if Belle Époque is active)

### Priority 2 — Important Features
4. Character profile data
5. Additional timeline files
6. Additional hotspot definitions
7. Lighting preset files

### Priority 3 — Nice to Have
8. Memory database files (can rebuild)
9. User data files (can rebuild)
10. Avatar assets
11. Additional environment images

### Priority 4 — Optional
12. Vault files (if vault was in use)
13. Mocap calibration data
14. Advanced camera configurations

---

## VERIFICATION CHECKLIST

After providing files, verify:
- [ ] All bot configs load (`/health` shows bot count)
- [ ] All timelines parse (`/api/timeline/list`)
- [ ] All hotspots load (`/api/hotspots/rooms`)
- [ ] Story bible initializes (`/api/story/`)
- [ ] Memory system accessible (`/api/memory/`)
- [ ] Characters load (`/api/characters/list`)
- [ ] Auth system works (`/api/auth/verify`)

---

## NEXT STEPS

1. **Check this list** against your backups
2. **Gather missing files** in organized structure
3. **Send files** as zip archive
4. **We'll integrate** and test everything
5. **Verify** all systems operational

**The comprehensive integration is complete — we just need your data files to make it fully functional.**
