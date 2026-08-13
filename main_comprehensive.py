"""
main.py — PubCast AI v5.5 — Production Entry Point
════════════════════════════════════════════════════════════════════════════════
Boots all systems in dependency order, wires every integration hook,
and starts the FastAPI server.

Boot Sequence (12 steps + sub-steps):
  1.   Hub (message router + history)
  2.   RoomManager
  2b.  PerformanceManager (profile policy — optional)
  2c.  ChoreographyController (animation tick — optional)
  2d.  LightingEngine (preset management — optional)
  3.   InferenceManager (Ollama Studio + GGUF Architect dual-mind)
  4.   CricketKeeper (per-character SQLite memory — optional)
  5.   BotManager (AI co-hosts: Pete, Sir Purfluous, Jeremy Cricket)
  6.   Cameras + RecordingService
  7.   GovernanceEngine (bans, mute, consent, waiting room)
  8.   BYOK Manager (user-supplied API keys — optional)
  9.   ThinkingContext (Jeremy conductor — optional)
  10.  EtherealAvatarManager (57-joint neon avatars — optional)
  11.  EVO Protocol (Switchblade + VDI + E-Pete Sacred Chain — optional)
  12.  Vault (OS-level file protection — optional)
  12b. Doctor (environment verifier — optional)

Run:
  python main.py
  uvicorn main:app --host 0.0.0.0 --port 8000

Rear View Foresight LLC — Feic Mo Chroí — 2026
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# ─── Core modules (always present) ────────────────────────────────────────────
from modules.appconfig import settings
from modules.hub import Hub
from modules.bots import BotManager
from modules.rooms import RoomManager
from modules.inference import InferenceManager
from modules.models import BotConfig, BotProvider, ProductionState
from modules.cameras import CameraManager, create_default_cameras
from modules.recording import RecordingService, create_recording_service
from modules.production_routes import create_production_router
from modules.governance import GovernanceEngine
from modules.governance_routes import create_governance_router
from modules.avatar_studio_bridge import AvatarStudioBridge, create_avatar_studio_router
from modules.pubworld_hotspots import create_hotspot_router

# ─── NEW: v5.5 Integration modules ────────────────────────────────────────────
from modules import timeline_routes
from modules import structured_log_routes
from modules import recording_pipeline_routes
from modules import governance_waiting_room
from modules import hotspot_system
from modules.structured_log import init_production_log, emit
from modules.recording_pipeline import ServerRecordingSession
from modules.timeline_routes import register_timeline_handler
from modules.timeline import EventType

# ─── COMPREHENSIVE INTEGRATION: Additional Systems ──────────────────────────
from modules import alex_routes
from modules import character_routes
from modules import memory_routes
from modules import story_routes
from modules import auth_routes

# ─── Optional modules — every import guarded; server boots regardless ─────────
_HAS_CRICKET          = False
_HAS_THINKING_CONTEXT = False
_HAS_ETHEREAL         = False
_HAS_EVO              = False
_HAS_VAULT            = False
_HAS_BYOK             = False
_HAS_PERFORMANCE      = False
_HAS_CHOREO           = False
_HAS_LIGHTING         = False
_HAS_DOCTOR           = False

# Comprehensive integration flags
_HAS_ALEX            = False
_HAS_CHARACTERS      = False
_HAS_MEMORY          = False
_HAS_STORY           = False
_HAS_AUTH            = False
_HAS_USERDB          = False
_HAS_LLM_FRAMEWORK   = False
_HAS_ROOM_CONDUCTOR  = False
_HAS_AVATARS         = False
_HAS_EVO_PETE        = False
_HAS_PETE_ENHANCED   = False

try:
    from modules.jeremy_cricket import CricketKeeper
    _HAS_CRICKET = True
except ImportError:
    CricketKeeper = None

try:
    from thinking_context import mount as tc_mount, CharacterProfile
    _HAS_THINKING_CONTEXT = True
except ImportError:
    tc_mount         = None
    CharacterProfile = None

try:
    from modules.ethereal_avatars import (
        EtherealAvatarManager, create_ethereal_router,
        handle_ethereal_ws_message, ETHEREAL_TYPES,
    )
    _HAS_ETHEREAL = True
except ImportError:
    EtherealAvatarManager      = None
    handle_ethereal_ws_message = None
    ETHEREAL_TYPES             = set()

try:
    from modules.evo import _EVO_CORE_AVAILABLE, EVOOrchestrator
    _HAS_EVO = _EVO_CORE_AVAILABLE
except ImportError:
    _HAS_EVO        = False
    EVOOrchestrator = None

try:
    from modules.byok_manager import BYOKManager
    from modules.byok_routes import mount_byok_routes as create_byok_router
    _HAS_BYOK = True
except ImportError:
    BYOKManager = None

try:
    from modules.pubcast_vault import PubCastVault, create_vault_router
    _HAS_VAULT = True
except ImportError:
    PubCastVault = None

try:
    from modules.performance_manager import PerformanceManager
    _HAS_PERFORMANCE = True
except ImportError:
    PerformanceManager = None

try:
    from modules.choreography_controller import ChoreoController as ChoreographyController
    _HAS_CHOREO = True
except ImportError:
    ChoreographyController = None

try:
    from modules.lighting_engine import LightingEngine, LightingHubPatch, list_presets as list_lighting_presets
    _HAS_LIGHTING = True
except ImportError:
    LightingEngine         = None
    LightingHubPatch       = None
    list_lighting_presets  = None

try:
    from modules.doctor import run_doctor as _run_doctor_fn, run_launch_gate as _run_launch_gate_fn
    _HAS_DOCTOR = True
except ImportError:
    _run_doctor_fn = None
    _run_launch_gate_fn = None

# ─── Comprehensive integration optional imports ───────────────────────────────
try:
    from modules.alex_core import AlexCore
    _HAS_ALEX = True
except ImportError:
    AlexCore = None

try:
    from modules.character_engine import CharacterEngine
    _HAS_CHARACTERS = True
except ImportError:
    CharacterEngine = None

try:
    from modules.universal_memory_system import UniversalMemorySystem
    _HAS_MEMORY = True
except ImportError:
    UniversalMemorySystem = None

try:
    from modules.pubcast_story_bible import StoryBible
    _HAS_STORY = True
except ImportError:
    StoryBible = None

try:
    from modules import auth
    _HAS_AUTH = True
except ImportError:
    auth = None

try:
    from modules.userdb import UserDatabase
    _HAS_USERDB = True
except ImportError:
    UserDatabase = None

try:
    from modules.llm_framework import LLMFramework
    from modules.llm_orchestrator import LLMOrchestrator
    _HAS_LLM_FRAMEWORK = True
except ImportError:
    LLMFramework = LLMOrchestrator = None

try:
    from modules.room_conductor import RoomConductor
    _HAS_ROOM_CONDUCTOR = True
except ImportError:
    RoomConductor = None

try:
    from modules.avatar import AvatarManager
    _HAS_AVATARS = True
except ImportError:
    AvatarManager = None

try:
    from modules.evo.pete import PeteCharacter
    from modules.evo.vdi_engine import VDIEngine
    _HAS_EVO_PETE = True
except ImportError:
    PeteCharacter = VDIEngine = None

try:
    from modules.pete_enhanced import PeteEnhanced
    _HAS_PETE_ENHANCED = True
except ImportError:
    PeteEnhanced = None


# ─── New subsystem imports (all guarded) ──────────────────────────────────────
_HAS_PUBWORLD_ROUTER   = False
_HAS_PUBWORLD_SCENES   = False
_HAS_PUBWORLD_BLOCKS   = False
_HAS_SURFACES          = False
_HAS_PROJECTS          = False
_HAS_AVATAR_ASSETS     = False
_HAS_SCULPTOR          = False
_HAS_STUDIO_CONTROL    = False
_HAS_MOCAP             = False
_HAS_UNITY_BRIDGE      = False
_HAS_VOXEL             = False
_HAS_BRIDGE            = False
_HAS_ORCHESTRATOR      = False

try:
    from modules.pubworld_router import router as _pubworld_router, push_production_state_to_pubworld
    _HAS_PUBWORLD_ROUTER = True
except ImportError:
    _pubworld_router = None
    push_production_state_to_pubworld = None

try:
    from modules.pubworld import list_scenes, create_scene, get_scene
    _HAS_PUBWORLD_SCENES = True
except ImportError:
    list_scenes = create_scene = get_scene = None

try:
    from modules.pubworld_blocks import Block, Prop, Prototype, Tracker
    _HAS_PUBWORLD_BLOCKS = True
except ImportError:
    pass

try:
    from modules.surfaces import Surface, SurfaceManager
    _HAS_SURFACES = True
except ImportError:
    SurfaceManager = None

try:
    from modules.projects import list_autosaves, save_autosave_snapshot
    _HAS_PROJECTS = True
except ImportError:
    list_autosaves = save_autosave_snapshot = None

try:
    from modules.avatar_assets import AvatarManifest, AssetPack
    _HAS_AVATAR_ASSETS = True
except ImportError:
    pass

try:
    from modules.sculptor import Sculptor
    _HAS_SCULPTOR = True
except ImportError:
    Sculptor = None

try:
    from modules.studio_control import StudioControl, StudioState
    from modules.studio_websocket import StudioWebSocketHandler
    _HAS_STUDIO_CONTROL = True
except ImportError:
    StudioControl = None
    StudioWebSocketHandler = None

try:
    from modules.mocap_integration import MocapIntegration
    _HAS_MOCAP = True
except ImportError:
    MocapIntegration = None

try:
    from modules.unity_bridge import UnityBridge
    _HAS_UNITY_BRIDGE = True
except ImportError:
    UnityBridge = None

try:
    from modules.voxel_asset_manager import VoxelAssetManager
    from modules.voxel_llm_adapter import generate_with_cloud as voxel_generate
    from modules.voxel_studio_integration import VoxelStudioIntegration
    _HAS_VOXEL = True
except ImportError:
    VoxelAssetManager = None
    voxel_generate = None
    VoxelStudioIntegration = None

try:
    from modules.bridge_bulletproof import VoxelBridge
    _HAS_BRIDGE = True
except ImportError:
    try:
        from modules.bridge import VoxelBridge
        _HAS_BRIDGE = True
    except ImportError:
        VoxelBridge = None

try:
    from modules.orchestrator import ConversationOrchestrator
    _HAS_ORCHESTRATOR = True
except ImportError:
    ConversationOrchestrator = None

# ─── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("pubcast")

# ─── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR   = Path(settings.data_dir)
STATIC_DIR = Path(settings.static_dir)
ASSETS_DIR = Path(settings.assets_dir)

for _d in [
    DATA_DIR, DATA_DIR / "logs", DATA_DIR / "users", DATA_DIR / "bots",
    DATA_DIR / "global", DATA_DIR / "jeremy", DATA_DIR / "ethereal",
    DATA_DIR / "vault", DATA_DIR / "governance", DATA_DIR / "recordings",
    DATA_DIR / "exports", DATA_DIR / "imports", DATA_DIR / "byok",
    DATA_DIR / "evo", DATA_DIR / "pubworld" / "scenes",
    DATA_DIR / "projects", DATA_DIR / "sculptures",
    DATA_DIR / "timelines", DATA_DIR / "hotspots", DATA_DIR / "environments",
    STATIC_DIR, ASSETS_DIR,
]:
    _d.mkdir(parents=True, exist_ok=True)

# ─── Global refs ───────────────────────────────────────────────────────────────
hub:               Optional[Hub]               = None
bot_manager:       Optional[BotManager]        = None
room_manager:      Optional[RoomManager]       = None
inference:         Optional[InferenceManager]  = None
cameras:           Optional[CameraManager]     = None
recording:         Optional[RecordingService]  = None
governance:        Optional[GovernanceEngine]  = None
cricket_keeper:    Any = None
ethereal_mgr:      Any = None
avatar_studio:     Any = None
evo_orchestrator:  Any = None
vault:             Any = None
byok_mgr:          Any = None
performance_manager: Any = None
choreo_controller: Any = None
lighting_engine:   Any = None
lighting_hub_patch: Any = None
# ─── New subsystem globals ─────────────────────────────────────────────────────
surface_manager:        Any = None
studio_control:         Any = None
studio_ws_handler:      Any = None
voxel_asset_manager:    Any = None
voxel_studio:           Any = None
voxel_bridge:           Any = None
unity_bridge:           Any = None
mocap:                  Any = None
conv_orchestrator:      Any = None
# ─── NEW: v5.5 Integration globals ────────────────────────────────────────────
production_log:         Any = None
timeline_player:        Any = None
waiting_room_manager:   Any = None
hotspot_manager:        Any = None
pipeline_sessions:      Dict[str, Any] = {}


# ─── CORS ─────────────────────────────────────────────────────────────────────
def _resolve_cors_origins() -> tuple[list[str], bool]:
    raw = os.getenv("PUBCAST_ALLOWED_ORIGINS", "*")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    credentials = True
    if "*" in origins:
        if len(origins) > 1:
            origins = [o for o in origins if o != "*"]
            logger.warning("CORS: wildcard mixed with specific — wildcard dropped: %s", origins)
        else:
            credentials = False
            logger.warning("CORS: '*' — allow_credentials forced False. Set PUBCAST_ALLOWED_ORIGINS to specific origin.")
    return origins, credentials


# ─── Body-size guard ──────────────────────────────────────────────────────────
class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    MAX_BODY = 1_048_576  # 1 MB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.MAX_BODY:
                    return JSONResponse({"detail": "Request body too large (max 1MB)"}, status_code=413)
            except ValueError:
                pass
        body_size = 0
        original_receive = request._receive  # noqa: SLF001

        async def limited_receive():
            nonlocal body_size
            message = await original_receive()
            if message.get("type") == "http.request":
                body_size += len(message.get("body", b""))
                if body_size > self.MAX_BODY:
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        request._receive = limited_receive  # noqa: SLF001
        response = await call_next(request)
        if body_size > self.MAX_BODY:
            return JSONResponse({"detail": "Request body too large (max 1MB)"}, status_code=413)
        return response


# ─── ThinkingContext adapter ───────────────────────────────────────────────────
class PubCastContextAdapter:
    def __init__(self, h: Hub, bm: BotManager) -> None:
        self._hub = h
        self._bm  = bm
    async def get_recent_history(self, room: str, limit: int = 12) -> list:
        return await self._hub.get_recent_history(room, limit)
    async def nudge(self, room_id: str, hint: str) -> bool:
        return await self._bm.nudge(room_id, hint)


# ═══════════════════════════════════════════════════════════════════════════════
# Lifespan — 12-step boot
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(application: FastAPI):
    global hub, bot_manager, room_manager, inference, cameras, recording
    global governance, cricket_keeper, ethereal_mgr, avatar_studio, vault, evo_orchestrator
    global byok_mgr, performance_manager, choreo_controller, lighting_engine, lighting_hub_patch
    global surface_manager, studio_control, studio_ws_handler
    global voxel_asset_manager, voxel_studio, voxel_bridge, unity_bridge, mocap, conv_orchestrator
    global production_log, timeline_player, waiting_room_manager, hotspot_manager, pipeline_sessions

    logger.info("═══ PubCast AI v5.5 starting ═══")
    t0 = time.time()

    # 1. Hub
    hub = Hub(DATA_DIR)
    logger.info("[1/12] Hub ready")

    # 2. RoomManager
    room_manager = RoomManager()
    logger.info("[2/12] RoomManager ready — %d rooms", len(room_manager.list_rooms()))

    # 2b. PerformanceManager (optional)
    if _HAS_PERFORMANCE and PerformanceManager is not None:
        try:
            performance_manager = PerformanceManager(
                policy_path=Path("system_policy.json"),
                state_path=DATA_DIR / "global" / "performance_profile.json",
            )
            application.state.performance_manager = performance_manager
            logger.info("[2b/12] Performance profile active — %s", performance_manager.active_profile)
        except Exception as exc:
            logger.warning("[2b/12] Performance manager failed: %s", exc)
    else:
        logger.info("[2b/12] Performance profiles — not available")

    # 2c. ChoreographyController (optional)
    if _HAS_CHOREO and ChoreographyController is not None:
        try:
            requested_tick_hz = float(os.getenv("PUBCAST_CHOREO_TICK_HZ", "30"))
            tick_hz = max(10.0, min(60.0, requested_tick_hz))
            choreo_controller = ChoreographyController(hub=hub, tick_hz=tick_hz)
            logger.info("[2c/12] Choreography controller ready — %.1f Hz", tick_hz)
        except Exception as exc:
            logger.warning("[2c/12] Choreography controller failed: %s", exc)
    else:
        logger.info("[2c/12] Choreography controller — not available")

    # 2d. LightingEngine (optional)
    if _HAS_LIGHTING and LightingEngine is not None and LightingHubPatch is not None:
        try:
            lighting_engine    = LightingEngine()
            lighting_hub_patch = LightingHubPatch(lighting_engine, hub)
            preset_count = len(list_lighting_presets() or []) if list_lighting_presets else 0
            logger.info("[2d/12] Lighting engine ready — %d presets", preset_count)
        except Exception as exc:
            logger.warning("[2d/12] Lighting engine failed: %s", exc)
    else:
        logger.info("[2d/12] Lighting engine — not available")

    # 3. Inference
    inference = InferenceManager()
    await inference.startup()
    inf_status = inference.status()
    logger.info(
        "[3/12] Inference — Studio %s | Architect %s",
        "ready"   if inf_status.get("studio",    {}).get("available") else "offline",
        "ready"   if inf_status.get("architect", {}).get("available") else "optional/unavailable",
    )

    # 4. CricketKeeper
    if _HAS_CRICKET and CricketKeeper is not None:
        cricket_keeper = CricketKeeper(data_dir=DATA_DIR / "jeremy")
        await cricket_keeper.init()
        logger.info("[4/12] CricketKeeper ready")
    else:
        logger.info("[4/12] CricketKeeper — not available")

    # 5. BotManager
    bot_manager = BotManager(data_dir=DATA_DIR, hub=hub)
    if cricket_keeper:
        bot_manager.set_cricket_keeper(cricket_keeper)
    hub.on_chat_callback = bot_manager.on_chat_message
    logger.info("[5/12] BotManager ready — %d bots", len(bot_manager.list_configs()))

    # 6. Cameras + Recording
    cameras   = create_default_cameras()
    recording = create_recording_service(DATA_DIR, cameras)
    application.include_router(create_production_router(cameras, recording, hub))
    logger.info(
        "[6/12] Cameras (%d) + Recording (%d profiles) ready",
        len(cameras.list_sources()), len(recording.list_profiles()),
    )

    # 7. Governance
    governance = GovernanceEngine(DATA_DIR)
    application.include_router(create_governance_router(governance, hub))
    logger.info("[7/12] Governance ready — bans, freeze, consent, waiting room")

    # 7b. PubWorld Hotspot API
    try:
        hotspot_router = create_hotspot_router(DATA_DIR)
        application.include_router(hotspot_router)
        logger.info("[7b] PubWorld hotspot API ready")
    except Exception as exc:
        logger.warning("[7b] PubWorld hotspot API failed: %s", exc)

    # 7c. NEW: Structured Production Logging
    try:
        production_log = init_production_log(DATA_DIR / "logs")
        emit("startup", "boot_start", {"version": "5.5"})
        application.include_router(structured_log_routes.router)
        logger.info("[7c] Structured production logging ready")
    except Exception as exc:
        logger.warning("[7c] Structured logging failed: %s", exc)

    # 7d. NEW: Timeline Automation System
    try:
        timeline_routes.init_timeline_system(DATA_DIR)
        timeline_player = timeline_routes.player
        application.include_router(timeline_routes.router)
        logger.info("[7d] Timeline automation ready")
    except Exception as exc:
        logger.warning("[7d] Timeline system failed: %s", exc)

    # 7e. NEW: Waiting Room / Airlock
    try:
        waiting_room_manager = governance_waiting_room.init_waiting_room(auto_approve=True)
        application.include_router(governance_waiting_room.router)
        logger.info("[7e] Waiting room / airlock ready")
    except Exception as exc:
        logger.warning("[7e] Waiting room failed: %s", exc)

    # 7f. NEW: Hotspot Trigger System
    try:
        hotspot_manager = hotspot_system.init_hotspot_system(DATA_DIR)
        application.include_router(hotspot_system.router)
        # Register default handlers
        hotspot_manager.register_handler("transition", hotspot_system.default_transition_handler)
        hotspot_manager.register_handler("animation", hotspot_system.default_animation_handler)
        hotspot_manager.register_handler("custom", hotspot_system.default_custom_handler)
        logger.info("[7f] Hotspot system ready — %d rooms", len(hotspot_manager._rooms))
    except Exception as exc:
        logger.warning("[7f] Hotspot system failed: %s", exc)

    # 7g. NEW: Recording Pipeline Routes
    try:
        application.include_router(recording_pipeline_routes.router)
        logger.info("[7g] Recording pipeline export routes ready")
    except Exception as exc:
        logger.warning("[7g] Recording pipeline routes failed: %s", exc)

    # 8. BYOK
    if _HAS_BYOK and BYOKManager is not None:
        try:
            byok_mgr = BYOKManager(DATA_DIR / "byok")
            create_byok_router(application, byok_mgr)
            bot_manager.set_byok_manager(byok_mgr)
            logger.info("[8/12] BYOK ready — user-supplied API keys enabled")
        except Exception as exc:
            logger.warning("[8/12] BYOK failed: %s", exc)
    else:
        logger.info("[8/12] BYOK — not available")

    # 9. ThinkingContext
    if _HAS_THINKING_CONTEXT and tc_mount is not None:
        try:
            adapter    = PubCastContextAdapter(hub, bot_manager)
            characters = _build_character_profiles()
            tc_mount(
                application, adapter,
                characters=characters,
                snapshot_path=str(DATA_DIR / "memory_snapshot.json"),
                startup_rooms=["studio", "green_room"],
            )
            logger.info("[9/12] ThinkingContext mounted — %d characters", len(characters))
        except Exception as exc:
            logger.warning("[9/12] ThinkingContext failed: %s", exc)
    else:
        logger.info("[9/12] ThinkingContext — not available")

    # 10. Ethereal Avatars
    if _HAS_ETHEREAL and EtherealAvatarManager is not None:
        try:
            ethereal_mgr = EtherealAvatarManager(DATA_DIR)
            application.include_router(create_ethereal_router(ethereal_mgr))
            avatar_studio = AvatarStudioBridge(ethereal_mgr, cameras, hub)
            application.include_router(create_avatar_studio_router(avatar_studio))
            logger.info("[10/12] Ethereal Avatars ready — 57 joints, %d colors",
                        len(ethereal_mgr.get_available_colors()))
            logger.info("[10b/12] Avatar Studio bridge ready")
        except Exception as exc:
            logger.warning("[10/12] Ethereal Avatars failed: %s", exc)
    else:
        logger.info("[10/12] Ethereal Avatars — not available")

    # 11. EVO Protocol — Switchblade + VDI + E-Pete
    if _HAS_EVO and EVOOrchestrator is not None:
        try:
            evo_orchestrator = EVOOrchestrator(
                active_character="pete",
                llm_backend=inference,
            )
            logger.info("[11/12] EVO Protocol ready — Switchblade + VDI + E-Pete active")
        except Exception as exc:
            logger.warning("[11/12] EVO Protocol failed: %s", exc)
    else:
        logger.info("[11/12] EVO Protocol — not available")

    # 12. Vault
    if _HAS_VAULT and PubCastVault is not None:
        try:
            vault = PubCastVault(DATA_DIR / "vault")
            application.include_router(create_vault_router(vault))
            logger.info("[12/12] Vault ready — OS-level protection active")
        except Exception as exc:
            logger.warning("[12/12] Vault failed: %s", exc)
    else:
        logger.info("[12/12] Vault — not available")

    logger.info("[12b] Doctor — %s", "ready" if _HAS_DOCTOR else "not available")

    # ── New subsystems boot ────────────────────────────────────────────────────

    # PubWorld router — live production state broadcast to map/world clients
    if _HAS_PUBWORLD_ROUTER and _pubworld_router:
        try:
            application.include_router(_pubworld_router)
            logger.info("[13] PubWorld router ready — /pubworld/ws live broadcast")
        except Exception as exc:
            logger.warning("[13] PubWorld router failed: %s", exc)

    # Surface manager — placeable media screens in rooms
    if _HAS_SURFACES:
        try:
            surface_manager = SurfaceManager()
            logger.info("[14] Surface manager ready")
        except Exception as exc:
            logger.warning("[14] Surface manager failed: %s", exc)

    # Conversation orchestrator — multi-agent turn coordination
    if _HAS_ORCHESTRATOR:
        try:
            conv_orchestrator = ConversationOrchestrator()
            logger.info("[15] ConversationOrchestrator ready")
        except Exception as exc:
            logger.warning("[15] ConversationOrchestrator failed: %s", exc)

    # Voxel stack — asset manager + LLM generator + studio integration
    if _HAS_VOXEL:
        try:
            voxel_asset_manager = VoxelAssetManager(data_dir=DATA_DIR)
            voxel_studio = VoxelStudioIntegration(
                voxel_asset_manager=voxel_asset_manager,
            )
            logger.info("[16] Voxel stack ready — %d assets catalogued",
                        len(voxel_asset_manager.get_all_assets()))
        except Exception as exc:
            logger.warning("[16] Voxel stack failed: %s", exc)

    # Rust bridge — twin-engine connection (bulletproof → fallback → graceful miss)
    if _HAS_BRIDGE:
        try:
            voxel_bridge = VoxelBridge()
            logger.info("[17] Voxel bridge ready — %s", getattr(voxel_bridge, "status", "connected"))
        except Exception as exc:
            logger.warning("[17] Voxel bridge not connected (renderer not running): %s", exc)

    # Studio control — Iron Core preflight, audio matrix, dead man's switch
    if _HAS_STUDIO_CONTROL:
        try:
            studio_control = StudioControl(hub=hub)
            studio_ws_handler = StudioWebSocketHandler(
                studio_control=studio_control,
            )
            logger.info("[18] Studio Control ready — preflight + audio matrix active")
        except Exception as exc:
            logger.warning("[18] Studio Control failed: %s", exc)

    # Unity bridge — Unity ↔ PubCast hub WebSocket
    if _HAS_UNITY_BRIDGE:
        try:
            unity_bridge = UnityBridge(hub=hub)
            logger.info("[19] Unity bridge ready — /unity/ws")
        except Exception as exc:
            logger.warning("[19] Unity bridge failed: %s", exc)

    # MoCap integration — live motion capture streaming
    if _HAS_MOCAP:
        try:
            mocap = MocapIntegration()
            logger.info("[20] MoCap integration ready")
        except Exception as exc:
            logger.warning("[20] MoCap integration failed: %s", exc)

    elapsed = time.time() - t0
    logger.info("═══ PubCast AI v5.5 ready in %.1fs ═══", elapsed)
    logger.info("    http://%s:%d/",                                       settings.host, settings.port)
    logger.info("    Stage:         /static/stage.html")
    logger.info("    Panoramic:     /static/stage_panoramic.html")
    logger.info("    Control Room:  /static/control_room.html")
    logger.info("    Studio Ctrl:   /studio-control")
    logger.info("    World:         /static/world.html")
    logger.info("    PubWorld Stage:/pubworld-stage")
    logger.info("    Builder:       /builder")
    logger.info("    Map:           /static/map.html")
    logger.info("    Dressing:      /dressing")
    logger.info("    Launch:        /launch")
    logger.info("    Bar:           /bar")
    logger.info("    Gallery:       /gallery")
    logger.info("    Analytics:     /analytics")
    logger.info("    Health:        /health")
    logger.info("    Doctor:        /static/doctor.html  |  /api/doctor")
    logger.info("    Lighting Lab:  /static/pubcast_lighting_explorer.html")
    logger.info("    Voxel API:     /api/voxel/assets  |  /api/voxel/generate")
    logger.info("    Studio API:    /api/studio/status  |  /api/studio/preflight")
    logger.info("    Unity WS:      /unity/ws/{client_id}")
    logger.info("    Studio WS:     /studio/ws")

    # ── NEW: Wire event handlers ──────────────────────────────────────────────────
    
    # Timeline event handlers
    if timeline_player:
        try:
            # Camera switches
            async def handle_timeline_camera(params):
                to_cam = params.get('to', 'cam_1')
                transition = params.get('transition', 'cut')
                if cameras:
                    # Use correct method: set_program_source (not async)
                    cameras.set_program_source(to_cam)
                if production_log:
                    emit("timeline", "camera_switch", {"to": to_cam, "transition": transition})
            
            # Lighting changes
            async def handle_timeline_lighting(params):
                preset = params.get('preset')
                if lighting_engine and preset:
                    # Use correct method: set_preset
                    lighting_engine.set_preset(preset)
                if production_log:
                    emit("timeline", "lighting_change", {"preset": preset})
            
            # Bot chat
            async def handle_timeline_chat(params):
                user = params.get('user', '')
                text = params.get('text', '')
                room = params.get('room', 'studio')  # Default room for timeline events
                if hub and user and text:
                    # Use correct Hub method: post_chat_message(room, user_id, text)
                    await hub.post_chat_message(room, user, text)
                if production_log:
                    emit("timeline", "bot_chat", {"user": user, "room": room})
            
            # Recording control
            async def handle_timeline_record(params):
                action = params.get('action')
                if action == 'start' and recording:
                    # Create recording session with timeline-specified parameters
                    session = recording.start_session(
                        session_id=None,  # Auto-generate
                        sources=params.get('sources', ['cam_1']),  # Default to cam_1
                        profile_id=params.get('profile_id', 'broadcast_mp4'),  # Default profile
                        operator='timeline_automation',
                        preset=params.get('preset'),
                        host_override=True,  # Timeline has authority
                        countdown_seconds=0,  # Immediate start for timeline
                    )
                    if production_log:
                        emit("timeline", "recording_start", {"session_id": session.session_id})
                elif action == 'stop' and recording:
                    # Stop most recent active session
                    active_sessions = [s for s in recording.list_sessions() 
                                     if s.state in ['active', 'countdown']]
                    if active_sessions:
                        recording.stop_session(active_sessions[-1].session_id)
                    if production_log:
                        emit("timeline", "recording_stop", {})
            
            register_timeline_handler(EventType.CAMERA, handle_timeline_camera)
            register_timeline_handler(EventType.LIGHTING, handle_timeline_lighting)
            register_timeline_handler(EventType.CHAT, handle_timeline_chat)
            register_timeline_handler(EventType.RECORD, handle_timeline_record)
            
            logger.info("[INIT] Timeline event handlers registered")
        except Exception as exc:
            logger.warning("[INIT] Timeline handler registration failed: %s", exc)
    
    # Hotspot event handlers
    if hotspot_manager and hub:
        try:
            # Override default transition handler with hub broadcast
            async def handle_hotspot_transition(action, user_id, hotspot_id, room):
                destination = action.get("destination", "unknown")
                spawn_point = action.get("spawnPoint", "default")
                
                await hub.broadcast_system_event({
                    "type": "transition",
                    "user_id": user_id,
                    "from_room": room,
                    "to_room": destination,
                    "spawn_point": spawn_point,
                })
                
                if production_log:
                    emit("hotspots", "transition", {
                        "user_id": user_id,
                        "from": room,
                        "to": destination,
                    })
                
                return {"transitioned": True, "destination": destination}
            
            hotspot_manager.register_handler("transition", handle_hotspot_transition)
            logger.info("[INIT] Hotspot event handlers registered")
        except Exception as exc:
            logger.warning("[INIT] Hotspot handler registration failed: %s", exc)
    
    # Camera switch logging
    if cameras and production_log:
        try:
            original_set_program = cameras.set_program_source
            def logged_set_program(source_id: str) -> bool:
                from_cam = cameras.get_program_source()
                result = original_set_program(source_id)
                emit("cameras", "switch", {"from": from_cam.source_id if from_cam else "unknown", "to": source_id})
                return result
            cameras.set_program_source = logged_set_program
            logger.info("[INIT] Camera logging enabled")
        except Exception as exc:
            logger.warning("[INIT] Camera logging failed: %s", exc)
    
    if production_log:
        emit("startup", "boot_complete", {"duration_ms": int((time.time() - t0) * 1000)})


    # ═════════════════════════════════════════════════════════════════════════
    # COMPREHENSIVE INTEGRATION: Additional Systems
    # ═════════════════════════════════════════════════════════════════════════
    
    # Alex Core
    alex_core_instance = None
    if _HAS_ALEX and AlexCore:
        try:
            alex_core_instance = AlexCore(data_dir=DATA_DIR / "alex")
            alex_routes.set_alex_instance(alex_core_instance)
            application.include_router(alex_routes.router)
            logger.info("[INTEGRATED] Alex Core ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Alex Core failed: %s", exc)
    
    # Character Engine
    character_engine_instance = None
    if _HAS_CHARACTERS and CharacterEngine:
        try:
            character_engine_instance = CharacterEngine(hub=hub)
            character_routes.set_character_instances(character_engine_instance, {})
            application.include_router(character_routes.router)
            logger.info("[INTEGRATED] Character Engine ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Character Engine failed: %s", exc)
    
    # Memory System
    memory_system_instance = None
    if _HAS_MEMORY and UniversalMemorySystem:
        try:
            memory_system_instance = UniversalMemorySystem(data_dir=DATA_DIR / "memory")
            memory_routes.set_memory_instance(memory_system_instance)
            application.include_router(memory_routes.router)
            logger.info("[INTEGRATED] Memory System ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Memory System failed: %s", exc)
    
    # Story Bible
    story_bible_instance = None
    if _HAS_STORY and StoryBible:
        try:
            story_bible_instance = StoryBible(data_dir=DATA_DIR / "story")
            story_routes.set_story_instance(story_bible_instance)
            application.include_router(story_routes.router)
            logger.info("[INTEGRATED] Story Bible ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Story Bible failed: %s", exc)
    
    # Authentication
    if _HAS_AUTH and auth:
        try:
            auth_routes.set_auth_instance(auth)
            application.include_router(auth_routes.router)
            logger.info("[INTEGRATED] Auth System ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Auth System failed: %s", exc)
    
    # User Database
    user_db_instance = None
    if _HAS_USERDB and UserDatabase:
        try:
            user_db_instance = UserDatabase(data_dir=DATA_DIR / "users")
            logger.info("[INTEGRATED] User Database ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] User Database failed: %s", exc)
    
    # LLM Framework
    llm_framework_instance = None
    if _HAS_LLM_FRAMEWORK and LLMFramework:
        try:
            llm_framework_instance = LLMFramework()
            logger.info("[INTEGRATED] LLM Framework ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] LLM Framework failed: %s", exc)
    
    # Room Conductor
    room_conductor_instance = None
    if _HAS_ROOM_CONDUCTOR and RoomConductor:
        try:
            room_conductor_instance = RoomConductor(hub=hub, rooms=room_manager)
            logger.info("[INTEGRATED] Room Conductor ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Room Conductor failed: %s", exc)
    
    # Avatar Manager
    avatar_manager_instance = None
    if _HAS_AVATARS and AvatarManager:
        try:
            avatar_manager_instance = AvatarManager(hub=hub)
            logger.info("[INTEGRATED] Avatar Manager ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] Avatar Manager failed: %s", exc)
    
    # EVO Pete
    evo_pete_instance = None
    if _HAS_EVO_PETE and PeteCharacter:
        try:
            vdi_engine = VDIEngine()
            evo_pete_instance = PeteCharacter(vdi=vdi_engine)
            logger.info("[INTEGRATED] EVO Pete ready")
        except Exception as exc:
            logger.warning("[INTEGRATED] EVO Pete failed: %s", exc)
    
    # Pete Enhanced - Twin Engine Orchestrator
    pete_enhanced_instance = None
    if _HAS_PETE_ENHANCED and PeteEnhanced:
        try:
            if voxel_bridge:
                pete_enhanced_instance = PeteEnhanced(
                    hub=hub,
                    bridge=voxel_bridge,
                    motion_system={},
                    data_dir=DATA_DIR / "pete_enhanced"
                )
                logger.info("[INTEGRATED] Pete Enhanced - Twin engine orchestrator ready")
            else:
                logger.info("[INTEGRATED] Pete Enhanced skipped - voxel bridge not available")
        except Exception as exc:
            logger.warning("[INTEGRATED] Pete Enhanced failed: %s", exc)


    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("═══ PubCast AI shutting down ═══")
    if choreo_controller and hasattr(choreo_controller, "stop"):
        try:
            await choreo_controller.stop()
        except Exception:
            pass
    if evo_orchestrator and hasattr(evo_orchestrator, "stop"):
        try:
            await evo_orchestrator.stop()
        except Exception:
            pass
    if vault and hasattr(vault, "shutdown"):
        vault.shutdown()
    if cricket_keeper and hasattr(cricket_keeper, "close_all"):
        await cricket_keeper.close_all()
    logger.info("═══ PubCast AI stopped ═══")


# ═══════════════════════════════════════════════════════════════════════════════
# Application
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="PubCast AI",
    version="5.5.0",
    description="Collaborative AI-Infused Virtual Production — Rear View Foresight LLC",
    lifespan=lifespan,
)

_cors_origins, _cors_credentials = _resolve_cors_origins()
app.add_middleware(CORSMiddleware,
    allow_origins=_cors_origins, allow_credentials=_cors_credentials,
    allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(BodySizeLimitMiddleware)

if STATIC_DIR.exists() and any(STATIC_DIR.iterdir()):
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
_assets_files = list(ASSETS_DIR.iterdir()) if ASSETS_DIR.exists() else []
if _assets_files:
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# ═══════════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    for candidate in [STATIC_DIR / "index.html", STATIC_DIR / "waiting_room.html"]:
        if candidate.exists():
            return FileResponse(candidate)
    return {"message": "PubCast AI v5.5", "health": "/health", "doctor": "/api/doctor"}


@app.get("/airlock")
async def serve_airlock():
    """Serve the waiting room / airlock UI."""
    airlock_path = STATIC_DIR / "waiting_room.html"
    if airlock_path.exists():
        return FileResponse(airlock_path)
    return {"error": "Airlock UI not found", "expected": str(airlock_path)}


@app.get("/health")
async def health():
    return {
        "status": "ok", "version": "5.5.0",
        "systems": {
            "hub":                hub is not None,
            "rooms":              len(room_manager.list_rooms()) if room_manager else 0,
            "bots":               len(bot_manager.list_configs()) if bot_manager else 0,
            "inference":          inference.status() if inference else None,
            "cameras":            len(cameras.list_sources()) if cameras else 0,
            "recording_profiles": len(recording.list_profiles()) if recording else 0,
            "governance":         governance is not None,
            "performance":        performance_manager is not None,
            "choreography":       choreo_controller is not None,
            "lighting":           lighting_engine is not None,
            "cricket":            cricket_keeper is not None,
            "byok":               byok_mgr is not None,
            "thinking_context":   _HAS_THINKING_CONTEXT,
            "ethereal":           _HAS_ETHEREAL and ethereal_mgr is not None,
            "evo":                _HAS_EVO and evo_orchestrator is not None,
            "vault":              _HAS_VAULT and vault is not None,
            "doctor":             _HAS_DOCTOR,
            # New subsystems
            "pubworld_router":    _HAS_PUBWORLD_ROUTER,
            "surfaces":           surface_manager is not None,
            "voxel":              voxel_asset_manager is not None,
            "voxel_bridge":       voxel_bridge is not None,
            "studio_control":     studio_control is not None,
            "unity_bridge":       unity_bridge is not None,
            "mocap":              mocap is not None,
            "orchestrator":       conv_orchestrator is not None,
            # NEW: v5.5 Integration systems
            "production_log":     production_log is not None,
            "timeline":           timeline_player is not None,
            "waiting_room":       waiting_room_manager is not None,
            "hotspot_system":     hotspot_manager is not None,
            # Comprehensive integration systems
            "alex_core":         alex_core_instance is not None,
            "character_engine":  character_engine_instance is not None,
            "memory_system":     memory_system_instance is not None,
            "story_bible":       story_bible_instance is not None,
            "auth":              _HAS_AUTH,
            "user_database":     user_db_instance is not None,
            "llm_framework":     llm_framework_instance is not None,
            "room_conductor":    room_conductor_instance is not None,
            "avatar_manager":    avatar_manager_instance is not None,
            "evo_pete":          evo_pete_instance is not None,
            "pete_enhanced":     pete_enhanced_instance is not None,

        },
    }


@app.get("/api/state/production")
async def get_production_state():
    return hub.get_production_state() if hub else {}


@app.post("/api/state/production")
async def update_production_state(request: Request):
    if not hub:
        raise HTTPException(503, "Hub not initialized")
    body    = await request.json()
    updated = hub.update_production_state(body)
    await hub.broadcast_system_event({"type": "production_state", "payload": updated})
    # Also push to PubWorld map clients
    if _HAS_PUBWORLD_ROUTER and push_production_state_to_pubworld:
        await push_production_state_to_pubworld(updated)
    return updated


@app.get("/api/state/user")
async def get_user_state(request: Request):
    """Return persisted display name / avatar colour for the requesting client."""
    client_id = request.headers.get("X-Client-Id", "anon")
    user_file  = DATA_DIR / "users" / f"{client_id}.json"
    if user_file.exists():
        try:
            return json.loads(user_file.read_text())
        except Exception:
            pass
    return {"user_id": client_id, "display_name": "", "avatar_color": "#00e0ff", "badge": ""}


@app.post("/api/state/user")
async def set_user_state(request: Request):
    """Persist display name / avatar colour for the requesting client."""
    client_id  = request.headers.get("X-Client-Id", "anon")
    body       = await request.json()
    user_file  = DATA_DIR / "users" / f"{client_id}.json"
    payload    = {
        "user_id":      client_id,
        "display_name": str(body.get("display_name", ""))[:64],
        "avatar_color": str(body.get("avatar_color", "#00e0ff"))[:20],
        "badge":        str(body.get("badge", ""))[:32],
    }
    user_file.write_text(json.dumps(payload, indent=2))
    if hub:
        await hub.broadcast_presence_update(client_id, payload["display_name"])
    return {"ok": True, **payload}


@app.post("/api/upload")
async def upload_file(request: Request):
    """Accept a multipart file upload and save it to data/imports/."""
    from fastapi import UploadFile, File, Form
    import shutil, mimetypes
    try:
        form   = await request.form()
        upload = form.get("file")
        target = str(form.get("target", "")).strip()
        if not upload or not hasattr(upload, "filename"):
            raise HTTPException(400, "No file provided")
        safe_name = Path(upload.filename).name or "upload"
        dest_dir  = DATA_DIR / "imports"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / safe_name
        with dest_path.open("wb") as out:
            shutil.copyfileobj(upload.file, out)
        logger.info("Upload received: %s → %s (target=%s)", upload.filename, dest_path, target)
        return {"ok": True, "filename": safe_name, "target": target, "size": dest_path.stat().st_size}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Upload error: %s", exc)
        raise HTTPException(500, str(exc))


@app.get("/api/bots")
async def list_bots():
    return [cfg.dict() for cfg in bot_manager.list_configs()] if bot_manager else []


@app.post("/api/bots")
async def register_bot(request: Request):
    if not bot_manager:
        raise HTTPException(503, "BotManager not initialized")
    body   = await request.json()
    config = BotConfig(**body)
    bot_manager.upsert_config(config)
    return {"ok": True, "bot_id": config.bot_id}


@app.delete("/api/bots/{bot_id}")
async def delete_bot(bot_id: str):
    if bot_manager:
        bot_manager.delete_config(bot_id)
    return {"ok": True}


@app.get("/api/rooms")
async def list_rooms():
    return room_manager.to_dict() if room_manager else {"rooms": []}


@app.post("/api/inference/generate")
async def generate_text(request: Request):
    if not inference:
        raise HTTPException(503, "Inference not initialized")
    body = await request.json()
    return await inference.generate_text(
        prompt          = body.get("prompt", ""),
        temperature     = body.get("temperature", 0.7),
        max_tokens      = body.get("max_tokens", 256),
        requested_route = body.get("route", body.get("role", "auto")),
        task_type       = body.get("task_type", ""),
        user_facing     = body.get("user_facing"),
        allow_fallback  = body.get("allow_fallback"),
    )


@app.post("/api/inference/tts")
async def text_to_speech(request: Request):
    if not inference:
        raise HTTPException(503, "Inference not initialized")
    body = await request.json()
    return await inference.synthesize_speech(
        text  = body.get("text", ""),
        voice = body.get("voice", "default"),
    )


@app.get("/api/lighting/presets")
async def get_lighting_presets():
    if not lighting_engine:
        return {"available": False, "presets": []}
    presets = list_lighting_presets() if list_lighting_presets else []
    return {"available": True, "presets": presets}


@app.post("/api/lighting/apply")
async def apply_lighting_preset(request: Request):
    if not lighting_engine:
        raise HTTPException(503, "Lighting engine not initialized")
    body = await request.json()
    preset = body.get("preset", "normal")
    try:
        lighting_engine.apply_preset(preset)
        await hub.broadcast_system_event({"type": "lighting_preset", "payload": {"preset": preset}})
        return {"ok": True, "preset": preset}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/evo/status")
async def evo_status():
    if not _HAS_EVO or evo_orchestrator is None:
        return {"available": False}
    try:
        s = evo_orchestrator.get_status() if hasattr(evo_orchestrator, "get_status") else {}
        return {"available": True, **s}
    except Exception as exc:
        return {"available": True, "error": str(exc)}


@app.get("/api/doctor")
async def doctor_report():
    if not _HAS_DOCTOR or _run_doctor_fn is None:
        return {"available": False, "message": "Doctor module not loaded"}
    try:
        return _run_doctor_fn(DATA_DIR)
    except Exception as exc:
        return {"available": True, "error": str(exc)}


@app.get("/api/doctor/launch-gate")
async def doctor_launch_gate():
    """Return only the launch-gate sub-report — used by doctor.html to decide
    whether to show a GO / NO-GO banner without fetching the full report."""
    if not _HAS_DOCTOR or _run_launch_gate_fn is None:
        return {"allowed": True, "reason": "Doctor module not loaded — assuming OK", "blocking_checks": []}
    try:
        return _run_launch_gate_fn(DATA_DIR)
    except Exception as exc:
        return {"allowed": False, "reason": str(exc), "blocking_checks": []}


# ─── Choreography routes ───────────────────────────────────────────────────────

@app.get("/api/choreo/actions")
async def choreo_list_actions():
    """Return the full action catalogue (label, duration, category) for the UI."""
    if choreo_controller is None:
        # Degrade gracefully: return the static default table so the UI still renders
        from modules.choreography_controller import DEFAULT_ACTIONS
        return {"available": False, "actions": DEFAULT_ACTIONS}
    return {"available": True, "actions": choreo_controller.list_actions()}


@app.get("/api/choreo/constraints")
async def choreo_get_constraints():
    """Return current MotionConstraints as a plain dict."""
    if choreo_controller is None:
        from dataclasses import asdict
        from modules.choreography_controller import MotionConstraints
        return {"available": False, "constraints": asdict(MotionConstraints())}
    return {"available": True, "constraints": choreo_controller.get_constraints()}


@app.post("/api/choreo/constraints")
async def choreo_set_constraints(request: Request):
    """Patch MotionConstraints fields.
    Accepts either a flat body  { enabled, max_horizontal_speed, … }
    or the wrapped shape        { constraints: { enabled, … } }
    that stage_panoramic.html sends.
    """
    if choreo_controller is None:
        raise HTTPException(503, "Choreography controller not initialised")
    body = await request.json()
    # Unwrap nested { constraints: {...} } if present
    patch = body.get("constraints", body) if isinstance(body, dict) else body
    updated = choreo_controller.set_constraints(patch)
    return {"ok": True, "constraints": updated}


@app.post("/api/choreo/cue")
async def choreo_cue_action(request: Request):
    """Fire an action cue for an avatar.
    Body: { room, avatar_id, action, intensity?, duration?, props? }
    Broadcasts an avatar_action_cue WS event to all room subscribers.
    """
    if choreo_controller is None:
        raise HTTPException(503, "Choreography controller not initialised")
    body = await request.json()
    room      = body.get("room", "studio")
    avatar_id = body.get("avatar_id", "")
    action    = body.get("action", "")
    if not avatar_id or not action:
        raise HTTPException(400, "avatar_id and action are required")
    try:
        result = await choreo_controller.cue_action(
            room      = room,
            avatar_id = avatar_id,
            action    = action,
            intensity = float(body.get("intensity", 1.0)),
            duration  = body.get("duration"),
            props     = body.get("props"),
        )
        return {"ok": True, "cue": result}
    except ValueError as exc:
        raise HTTPException(400, str(exc))


# ─── Performance profile route ─────────────────────────────────────────────────

@app.get("/api/performance/status")
async def performance_status():
    """Return the active performance profile and its settings.
    stage_panoramic.html uses this to gate high-fidelity render features."""
    if performance_manager is None:
        return {
            "available": False,
            "profile": "medium",
            "settings": {"architect_enabled": True, "max_fps": 30, "shadows": True},
        }
    snap = performance_manager.current_profile_snapshot()
    return {"available": True, **snap}


# ═══════════════════════════════════════════════════════════════════════════════
# Static page routes — serve pages from the pubworld build
# ═══════════════════════════════════════════════════════════════════════════════

def _page(name: str):
    """Return FileResponse for a static HTML page, 404 if missing."""
    p = STATIC_DIR / name
    if p.exists():
        return FileResponse(p)
    raise HTTPException(404, f"Page not found: {name}")

@app.get("/control",         include_in_schema=False) 
async def page_control():        return _page("control.html")

@app.get("/studio-control",  include_in_schema=False)
async def page_studio_control(): return _page("studio_control_room.html")

@app.get("/dressing",        include_in_schema=False)
async def page_dressing():       return _page("dressing.html")

@app.get("/dressing-foundry",include_in_schema=False)
async def page_dressing_foundry(): return _page("dressing_foundry.html")

@app.get("/pubworld-stage",  include_in_schema=False)
async def page_pubworld_stage(): return _page("pubworld_stage.html")

@app.get("/builder",         include_in_schema=False)
async def page_builder():        return _page("builder.html")

@app.get("/launch",          include_in_schema=False)
async def page_launch():         return _page("launch.html")

@app.get("/bar",             include_in_schema=False)
async def page_bar():            return _page("bar.html")

@app.get("/gallery",         include_in_schema=False)
async def page_gallery():        return _page("gallery.html")

@app.get("/analytics",       include_in_schema=False)
async def page_analytics():      return _page("analytics.html")


# ═══════════════════════════════════════════════════════════════════════════════
# PubWorld Scenes API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/pubworld/scenes")
async def pw_list_scenes():
    if not _HAS_PUBWORLD_SCENES:
        return {"scenes": []}
    return {"scenes": [s.dict() for s in list_scenes(DATA_DIR)]}

@app.post("/api/pubworld/scenes")
async def pw_create_scene(request: Request):
    if not _HAS_PUBWORLD_SCENES:
        raise HTTPException(503, "PubWorld scene manager not available")
    body = await request.json()
    name = body.get("name", "Untitled Scene")
    desc = body.get("description", "")
    scene = create_scene(DATA_DIR, name=name, description=desc)
    return {"ok": True, "scene": scene.dict()}

@app.get("/api/pubworld/scenes/{scene_id}")
async def pw_get_scene(scene_id: str):
    if not _HAS_PUBWORLD_SCENES:
        raise HTTPException(503, "PubWorld scene manager not available")
    scene = get_scene(DATA_DIR, scene_id)
    if not scene:
        raise HTTPException(404, f"Scene not found: {scene_id}")
    return scene.dict()


# ═══════════════════════════════════════════════════════════════════════════════
# Surfaces API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/surfaces")
async def list_surfaces_ep(room_id: str = None):
    if surface_manager is None:
        return {"surfaces": []}
    surfaces = await surface_manager.list_surfaces(room_id=room_id)
    return {"surfaces": [s.dict() for s in surfaces]}

@app.post("/api/surfaces")
async def create_surface_ep(request: Request):
    if surface_manager is None:
        raise HTTPException(503, "Surface manager not available")
    body = await request.json()
    s = await surface_manager.create_surface(
        room_id=body.get("room_id", "studio"),
        label=body.get("label", "Screen"),
        kind=body.get("kind", "custom"),
        quad=body.get("quad"),
        creator_id=body.get("creator_id"),
        media_mode=body.get("media_mode", "video"),
    )
    return {"ok": True, "surface": s.dict()}


# ═══════════════════════════════════════════════════════════════════════════════
# Projects / autosave API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/projects/{slug}/autosaves")
async def list_project_autosaves(slug: str):
    if not _HAS_PROJECTS:
        return {"autosaves": []}
    return {"autosaves": list_autosaves(DATA_DIR, slug)}


# ═══════════════════════════════════════════════════════════════════════════════
# Voxel API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/voxel/assets")
async def voxel_list_assets(category: str = None):
    if voxel_asset_manager is None:
        return {"available": False, "assets": []}
    if category:
        assets = voxel_asset_manager.get_assets_by_category(category)
    else:
        assets = voxel_asset_manager.get_all_assets()
    return {"available": True, "count": len(assets),
            "assets": [a.to_dict() for a in assets]}

@app.get("/api/voxel/assets/search")
async def voxel_search_assets(q: str = ""):
    if voxel_asset_manager is None:
        return {"assets": []}
    results = voxel_asset_manager.search_assets(q)
    return {"assets": [a.to_dict() for a in results]}

@app.post("/api/voxel/generate")
async def voxel_generate_ep(request: Request):
    """Generate voxel blocks from a text prompt via LLM (Anthropic→OpenAI→Gemini→local)."""
    if not _HAS_VOXEL or voxel_generate is None:
        raise HTTPException(503, "Voxel generator not available")
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(400, "prompt required")
    provider = body.get("provider", "auto")
    try:
        label, blocks = await voxel_generate(prompt, provider=provider)
        return {"ok": True, "label": label, "blocks": blocks, "count": len(blocks) if blocks else 0}
    except Exception as exc:
        raise HTTPException(500, str(exc))

@app.get("/api/voxel/status")
async def voxel_status():
    return {
        "asset_manager": voxel_asset_manager is not None,
        "studio_integration": voxel_studio is not None,
        "bridge": voxel_bridge is not None,
        "bridge_status": getattr(voxel_bridge, "status", None) if voxel_bridge else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Studio Control API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/studio/status")
async def studio_status():
    if studio_control is None:
        return {"available": False}
    try:
        return {"available": True, **studio_control.get_status_summary()}
    except Exception as exc:
        return {"available": True, "error": str(exc)}

@app.post("/api/studio/preflight")
async def studio_preflight(request: Request):
    """Trigger the 5-second preflight countdown."""
    if studio_control is None:
        raise HTTPException(503, "Studio Control not available")
    body = await request.json()
    room = body.get("room", "studio")
    try:
        result = await studio_control.start_preflight(room=room)
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(500, str(exc))

@app.post("/api/studio/emergency-save")
async def studio_emergency_save(request: Request):
    """Trigger the dead man's switch emergency save."""
    if studio_control is None:
        raise HTTPException(503, "Studio Control not available")
    try:
        result = await studio_control.emergency_save()
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(500, str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# Unity Bridge API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/unity/status")
async def unity_status():
    if unity_bridge is None:
        return {"available": False}
    return {"available": True, **unity_bridge.status()}


# ═══════════════════════════════════════════════════════════════════════════════
# MoCap API
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/mocap/status")
async def mocap_status():
    if mocap is None:
        return {"available": False}
    try:
        s = mocap.get_status() if hasattr(mocap, "get_status") else {}
        return {"available": True, **s}
    except Exception as exc:
        return {"available": True, "error": str(exc)}

@app.post("/api/mocap/start")
async def mocap_start(request: Request):
    if mocap is None:
        raise HTTPException(503, "MoCap not available")
    body = await request.json()
    try:
        result = await mocap.start(rig_id=body.get("rig_id", "rig-01"))
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(500, str(exc))

@app.post("/api/mocap/stop")
async def mocap_stop():
    if mocap is None:
        raise HTTPException(503, "MoCap not available")
    try:
        await mocap.stop()
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(500, str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# Missing route stubs — frontend calls these; wire to real backends where
# available, return safe empty responses otherwise so pages don't 404.
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def api_health_alias():
    """Alias — some pages call /api/health instead of /health."""
    return {"status": "ok", "version": "5.5.0"}


@app.get("/api/agents")
async def list_agents():
    """conference.js lists agents/bots for the conference room."""
    if bot_manager is None:
        return {"agents": []}
    return {"agents": [
        {"agent_id": cfg.bot_id, "name": cfg.display_name,
         "provider": cfg.provider, "active": True}
        for cfg in bot_manager.list_configs()
    ]}


@app.get("/api/avatars/me")
async def get_my_avatar(request: Request):
    """dressing.html / dressing.js — return the caller's ethereal skin state."""
    client_id = request.headers.get("X-Client-Id", "anon")
    if ethereal_mgr is None:
        return {"user_id": client_id, "color": "#00e0ff", "mood": "neutral",
                "gesture": "none", "available": False}
    skin = ethereal_mgr.get_or_create_skin(client_id)
    return {
        "available": True,
        "user_id":  client_id,
        "color":    getattr(skin, "color_name", "#00e0ff"),
        "mood":     getattr(skin, "mood", "neutral"),
        "gesture":  getattr(skin, "current_gesture", "none"),
    }


@app.post("/api/avatars/me")
async def update_my_avatar(request: Request):
    """dressing.js — update caller's avatar skin."""
    client_id = request.headers.get("X-Client-Id", "anon")
    body = await request.json()
    if ethereal_mgr is None:
        return {"ok": False, "reason": "Ethereal avatars not available"}
    skin = ethereal_mgr.get_or_create_skin(client_id)
    if "color" in body:
        try:
            ethereal_mgr.set_color(client_id, body["color"])
        except Exception:
            pass
    if "mood" in body:
        try:
            ethereal_mgr.set_mood(client_id, body["mood"])
        except Exception:
            pass
    return {"ok": True, "user_id": client_id}


@app.get("/api/avatars/presets")
async def list_avatar_presets():
    """dressing.html — list available ethereal colour presets."""
    colors = []
    if ethereal_mgr is not None and hasattr(ethereal_mgr, "NEON_COLORS"):
        colors = list(ethereal_mgr.NEON_COLORS.keys())
    if not colors:
        colors = ["teal","blue","purple","gold","green","red","white"]
    moods  = ["neutral","happy","focused","excited","calm","tense","curious"]
    gestures = ["none","wave","nod","shrug","point","applaud","thumbsup"]
    return {"colors": colors, "moods": moods, "gestures": gestures}


@app.post("/api/avatars/me/bake")
async def bake_my_avatar(request: Request):
    """dressing.js — bake a photo into a voxel avatar portrait."""
    client_id = request.headers.get("X-Client-Id", "anon")
    if not _HAS_SCULPTOR or Sculptor is None:
        return {"ok": False, "reason": "Sculptor not available — upload a photo when it is"}
    # Multipart photo upload
    try:
        import shutil
        form = await request.form()
        photo = form.get("photo")
        if not photo or not hasattr(photo, "filename"):
            raise HTTPException(400, "photo file required")
        dest = DATA_DIR / "sculptures" / f"{client_id}_photo{__import__('pathlib').Path(photo.filename).suffix}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as f:
            shutil.copyfileobj(photo.file, f)
        sculptor = Sculptor(mode="webcam")
        result = sculptor.bake_from_photo(dest, client_id)
        if result is None:
            return {"ok": False, "reason": "No face detected in photo"}
        return {"ok": True, "bake": result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.get("/api/vod")
async def list_vod():
    """gallery.html — list completed recordings available for playback."""
    if recording is None:
        return {"sessions": []}
    try:
        sessions = recording.list_sessions() if hasattr(recording, "list_sessions") else []
        # Only return sessions with artifacts (actual recorded files)
        completed = [s for s in sessions
                     if isinstance(s, dict) and s.get("artifacts")]
        return {"sessions": completed, "count": len(completed)}
    except Exception:
        return {"sessions": [], "count": 0}


@app.get("/api/performer/status")
async def performer_status():
    """launch.html — overall performer/avatar pipeline health check."""
    return {
        "available":    True,
        "ethereal":     _HAS_ETHEREAL and ethereal_mgr is not None,
        "evo":          _HAS_EVO and evo_orchestrator is not None,
        "mocap":        mocap is not None,
        "bridge":       voxel_bridge is not None,
        "voxel":        voxel_asset_manager is not None,
        "studio":       studio_control is not None,
        "ws_renderer":  __import__('pathlib').Path("bin/ws_renderer").exists(),
    }


@app.get("/api/audio/tts")
@app.post("/api/audio/tts")
async def audio_tts_alias(request: Request):
    """tts.js calls /api/audio/tts — proxy to the inference TTS endpoint."""
    if inference is None:
        raise HTTPException(503, "Inference not available")
    try:
        body = await request.json() if request.method == "POST" else {}
    except Exception:
        body = {}
    text = body.get("text", body.get("prompt", ""))
    voice = body.get("voice", "default")
    if not text:
        raise HTTPException(400, "text required")
    # Delegate to existing TTS handler
    result = await inference.tts(text=text, voice=voice) if hasattr(inference, "tts") else \
             {"audio_url": None, "text": text, "note": "TTS engine not configured"}
    return result


@app.get("/api/cameras/program/{source_id}")
async def get_program_camera(source_id: str):
    """switcher.js — get program camera state."""
    if cameras is None:
        raise HTTPException(503, "Camera manager not available")
    src = cameras.get(source_id)
    if src is None:
        raise HTTPException(404, f"Camera not found: {source_id}")
    return {"source_id": source_id, "is_program": cameras.get_program_source() and
            cameras.get_program_source().source_id == source_id}


@app.post("/api/cameras/program/{source_id}")
async def set_program_camera(source_id: str):
    """switcher.js — set program camera."""
    if cameras is None:
        raise HTTPException(503, "Camera manager not available")
    ok = cameras.set_program_source(source_id)
    if not ok:
        raise HTTPException(404, f"Camera not found: {source_id}")
    if hub:
        await hub.broadcast_system_event({
            "type": "camera_switch",
            "payload": {"target": "program", "source_id": source_id}
        })
    if _HAS_PUBWORLD_ROUTER and push_production_state_to_pubworld:
        await push_production_state_to_pubworld({"camera": source_id})
    return {"ok": True, "program": source_id}


@app.get("/api/cameras/preview/{source_id}")
async def get_preview_camera(source_id: str):
    """switcher.js — get preview camera state."""
    if cameras is None:
        raise HTTPException(503, "Camera manager not available")
    src = cameras.get(source_id)
    if src is None:
        raise HTTPException(404, f"Camera not found: {source_id}")
    return {"source_id": source_id, "is_preview": cameras.get_preview_source() and
            cameras.get_preview_source().source_id == source_id}


@app.post("/api/cameras/preview/{source_id}")
async def set_preview_camera(source_id: str):
    """switcher.js — set preview camera."""
    if cameras is None:
        raise HTTPException(503, "Camera manager not available")
    ok = cameras.set_preview_source(source_id)
    if not ok:
        raise HTTPException(404, f"Camera not found: {source_id}")
    if hub:
        await hub.broadcast_system_event({
            "type": "camera_switch",
            "payload": {"target": "preview", "source_id": source_id}
        })
    return {"ok": True, "preview": source_id}


# ═══════════════════════════════════════════════════════════════════════════════
# WebSocket
# ═══════════════════════════════════════════════════════════════════════════════

# ── PubWorld 2.5D client WS ──────────────────────────────────────────────────
# world.html connects here. It tracks which room the player is in client-side
# and sends room_change, ping, and hotspot action messages.

_pubworld_clients: dict[str, WebSocket] = {}

@app.websocket("/pubworld/ws/{client_id}")
async def pubworld_ws(ws: WebSocket, client_id: str):
    await ws.accept()
    _pubworld_clients[client_id] = ws

    # Send welcome with production state
    welcome_payload: dict = {"type": "welcome", "payload": {}}
    if hub:
        welcome_payload["payload"]["production_state"] = hub.get_production_state()
    await ws.send_text(json.dumps(welcome_payload))

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue

            msg_type = data.get("type", "")

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "room_change":
                # Player moved to a new room in the 2.5D world
                room_id = data.get("room", "")
                logger.debug("PubWorld client %s entered room %s", client_id, room_id)
                await ws.send_text(json.dumps({"type": "room_ack", "room": room_id}))

            elif msg_type == "hotspot":
                # Hotspot action — dispatch through the hotspot handler
                from modules.pubworld_hotspots import ACTION_HANDLERS
                action = data.get("action", "")
                action_data = data.get("data", {})
                handler = ACTION_HANDLERS.get(action)
                if handler:
                    try:
                        result = handler(client_id, data.get("room", ""), action_data)
                        await ws.send_text(json.dumps({"type": "hotspot_result", **result}))
                    except Exception as exc:
                        await ws.send_text(json.dumps({"type": "hotspot_result", "status": "error", "message": str(exc)}))
                else:
                    await ws.send_text(json.dumps({"type": "hotspot_result", "status": "unknown_action", "action": action}))

            elif msg_type == "player_move":
                # Position update — could broadcast to other clients for presence
                pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("PubWorld WS error for client %s: %s", client_id, exc)
    finally:
        _pubworld_clients.pop(client_id, None)


# ── Unity bridge WebSocket ─────────────────────────────────────────────────────

@app.websocket("/unity/ws/{client_id}")
async def unity_ws(ws: WebSocket, client_id: str):
    """Unity C# clients connect here to bridge WorldBrain state and EventBus."""
    if unity_bridge is None:
        await ws.close(code=1013, reason="Unity bridge not initialized")
        return
    await unity_bridge.handle_connection(ws)


# ── Studio Control WebSocket ───────────────────────────────────────────────────

@app.websocket("/studio/ws")
async def studio_control_ws(ws: WebSocket):
    """Studio control surface (studio_control_room.html) connects here."""
    if studio_ws_handler is None:
        await ws.accept()
        await ws.send_json({"type": "error", "message": "Studio Control not initialized"})
        await ws.close()
        return
    await studio_ws_handler.handle(ws)


# ── Chat/production WS (original) ────────────────────────────────────────────

@app.websocket("/ws/{room}")
async def websocket_room(ws: WebSocket, room: str):
    if not hub:
        await ws.close(code=1013, reason="Hub not ready")
        return

    user_id = ws.query_params.get("user_id", "")

    if governance and user_id:
        banned, reason = governance.is_banned(user_id)
        if banned:
            await ws.close(code=4403, reason=f"Banned: {reason}")
            return

    user_is_muted = bool(governance and user_id and governance.is_muted(user_id))

    await hub.connect(ws, room)

    tc = getattr(app.state, "thinking_context", None)
    if tc:
        try:
            await tc.watch_room(room)
        except Exception:
            pass

    try:
        while True:
            raw = await ws.receive_text()

            if user_is_muted:
                continue

            # Ethereal avatar messages
            if _HAS_ETHEREAL and ethereal_mgr:
                try:
                    parsed = json.loads(raw)
                    if parsed.get("type", "") in ETHEREAL_TYPES:
                        await handle_ethereal_ws_message(ethereal_mgr, hub, room, parsed)
                        continue
                except Exception:
                    pass

            # Lighting messages
            if lighting_hub_patch:
                try:
                    parsed = json.loads(raw)
                    if parsed.get("type", "").startswith("lighting_"):
                        lighting_hub_patch.handle_message(parsed)
                        continue
                except Exception:
                    pass

            await hub.handle_message(ws, room, raw)

            if tc:
                try:
                    data = json.loads(raw)
                    if data.get("type") == "chat":
                        asyncio.create_task(tc.on_message(
                            room,
                            data.get("user_id", data.get("user", "anon")),
                            data.get("text", ""),
                        ))
                except Exception:
                    pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WebSocket error in room %r: %s", room, exc)
    finally:
        await hub.disconnect(ws, room)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _build_character_profiles() -> list:
    if not _HAS_THINKING_CONTEXT or not CharacterProfile or not bot_manager:
        return []
    return [
        CharacterProfile(
            character_id=f"bot-{cfg.bot_id}",
            name=cfg.name,
            role="host" if cfg.auto_reply else "guest",
        )
        for cfg in bot_manager.list_configs()
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Entry
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )
