from __future__ import annotations

import io
import asyncio
import json
import os
import shutil
import uuid
from pathlib import Path
import time
from typing import Any, Dict, List, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    Body,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import subprocess
import tempfile
from contextlib import asynccontextmanager
import base64
import logging

from modules.avatar import list_presets, load_avatar_async, save_avatar_async
from modules.credentials import CredentialStore
from modules.hub import Hub
from modules.models import ProductionState
from modules.persistence import (
    allowed_upload_extension,
    ensure_dirs,
    sanitize_filename,
    append_jsonl_async,
    read_yaml,
)
from modules.pubworld import (
    create_scene,
    delete_scene,
    get_scene,
    save_scene,
    get_timeline,
    list_placeholder_assets,
    list_scenes,
    update_scene,
    update_timeline,
)
from modules.choreography import get_plan as get_perf_plan, update_plan as update_perf_plan
from modules.cameras import create_default_cameras, CameraSource, CameraTransport
from modules.recording import create_recording_service
from modules.rooms import RoomManager
from modules.choreography_controller import ChoreoController
from modules.choreo_api import list_steps as choreo_list_steps, add_step as choreo_add_step, delete_step as choreo_delete_step
from modules.retarget_verify import verify_mapping as _verify_mapping
from modules.tracking.service import TrackingService
from modules.schemas import ChoreoStep
from modules.interactables import list_items as list_interactables
from modules.interactables import list_items as list_interactables
from modules.agents.base import AdapterFactory, AgentRegistry
from modules.agents.openai_adapter import OpenAIAdapter
from modules.agents.gemini_adapter import GeminiAdapter
from modules.agents.anthropic_adapter import AnthropicAdapter
from modules.agents.ollama_adapter import OllamaAdapter
from modules.agents.qwen_adapter import QwenAdapter
from modules.agents.lmcoder_adapter import LMcoderAdapter
from modules.orchestrator import ConversationOrchestrator
from modules.schemas import (
    ModelCreateRequest,
    ModelResponse,
    ModelsResponse,
    ModelUpdateRequest,
    ModelVerifyRequest,
    PerformancePlanResponse,
    PerformancePlanUpdate,
    CredentialSummaryResponse,
    PubWorldSceneCreate,
    PubWorldSceneResponse,
    PubWorldScenesResponse,
    PubWorldSceneUpdate,
    PubWorldTimelineResponse,
    PubWorldTimelineUpdate,
    RoomCreateRequest,
    AddAgentsRequest,
)
from modules.user_models import UserModelManager
from modules.bots import BotManager
from modules.audio_router import router as audio_router
from modules.providers.health_router import router as providers_router
from starlette.websockets import WebSocketState
from modules.shepard import ShepardService, ShepardConfig
from modules.jobs.worker import AudioJobWorker
from modules.security.middleware import require_permission_or_admin
from modules.security.auth import Permission
from modules.ai_router import router as ai_router


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ASSETS_DIR = BASE_DIR / "assets"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

ensure_dirs(DATA_DIR, ASSETS_DIR)

# Logging setup (controlled via PUBCAST_LOG_LEVEL env var)
_log_level = getattr(logging, os.getenv("PUBCAST_LOG_LEVEL", "INFO").upper(), logging.INFO)
logging.basicConfig(level=_log_level)
logger = logging.getLogger("pubcast")

# Optional: load .env file for local development
def _load_env_file(env_path: Optional[Path] = None) -> None:
    try:
        path = env_path or (BASE_DIR / ".env")
        if not path.exists():
            return
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            # Strip surrounding quotes if any
            val = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = val
    except Exception:
        # Best-effort loader; log at debug so env parsing issues are visible during development
        logger.debug("Failed to load .env file: %s", env_path or (BASE_DIR / ".env"), exc_info=True)


_load_env_file()


# Managers
hub = Hub(DATA_DIR)
credential_store = CredentialStore(DATA_DIR)
user_model_manager = UserModelManager(DATA_DIR, credential_store)
room_manager = RoomManager()
# Camera manager (bootstrapped once so we can expose telemetry)
camera_manager = create_default_cameras()
recording_service = create_recording_service(DATA_DIR, camera_manager)
bot_manager = BotManager(DATA_DIR, hub)
hub.set_bot_manager(bot_manager)
choreo_controller = ChoreoController(hub)
tracking_service = TrackingService(DATA_DIR)

# Optional: enable real inference worker when env flag is set
_INFERENCE_ENABLED = os.getenv("PUBCAST_ENABLE_INFERENCE_WORKER", "").strip().lower() in ("1", "true", "yes")
inference_manager = None
_AI_WORKERS_ENABLED = os.getenv("PUBCAST_ENABLE_AI_WORKERS", "").strip().lower() in ("1", "true", "yes")
ai_worker_pool = None

# --- Multi-agent orchestrator wiring ---
adapter_factory = AdapterFactory()
adapter_factory.register("openai", OpenAIAdapter)
adapter_factory.register("gemini", GeminiAdapter)
adapter_factory.register("anthropic", AnthropicAdapter)
adapter_factory.register("ollama", OllamaAdapter)
adapter_factory.register("qwen", QwenAdapter)
adapter_factory.register("lmcoder", LMcoderAdapter)

_AGENTS_CONFIG_PATH = BASE_DIR / "config" / "models.yaml"
_agents_raw = read_yaml(_AGENTS_CONFIG_PATH)
_agent_configs = []
for entry in (_agents_raw.get("agents") or []):
    try:
        from modules.schemas import AgentConfig  # local import to avoid circular at module import time

        _agent_configs.append(AgentConfig(**entry))
    except Exception:
        logger.debug("Failed to parse agent config entry: %s", entry, exc_info=True)
agent_registry = AgentRegistry(adapter_factory, _agent_configs)
orchestrator = ConversationOrchestrator(room_manager, agent_registry)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global inference_manager
    _shepard: ShepardService | None = None
    _audio_worker: AudioJobWorker | None = None
    # expose running services on app.state for control endpoints
    app.state.shepard = None
    app.state.audio_worker = None
    if _INFERENCE_ENABLED:
        try:
            from modules.inference.manager import InferenceManager  # late import to avoid hard dependency
            inference_manager = InferenceManager()
            await inference_manager.startup()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to start InferenceManager; continuing without it")
            inference_manager = None
    try:
        # Start Shepard background service (auto-enabled via env/config)
        _shepard = ShepardService(hub=hub, orchestrator=orchestrator, data_dir=DATA_DIR)
        if _shepard._config.enabled:  # noqa: SLF001
            _shepard.start()
        app.state.shepard = _shepard
        # Optional audio worker queue
        if os.getenv("PUBCAST_AUDIO_QUEUE", "").strip().lower() in ("1","true","yes"):
            _audio_worker = AudioJobWorker(DATA_DIR)
            _audio_worker.start()
            app.state.audio_worker = _audio_worker
        # Optional AI worker pool
        if _AI_WORKERS_ENABLED:
            try:
                from modules.ai_worker_pool import get_ai_worker_pool
                global ai_worker_pool
                ai_worker_pool = get_ai_worker_pool()
                ai_worker_pool.startup()
                app.state.ai_worker_pool = ai_worker_pool
            except Exception:
                logger.exception("Failed to start AIWorkerPool; continuing without it")
                ai_worker_pool = None
                app.state.ai_worker_pool = None
        yield
    finally:
        if _shepard is not None:
            try:
                await _shepard.stop()
            except Exception:
                pass
        if _audio_worker is not None:
            try:
                await _audio_worker.stop()
            except Exception:
                pass
        # clear state handles
        try:
            app.state.shepard = None
            app.state.audio_worker = None
        except Exception:
            pass
        if inference_manager is not None:
            try:
                await inference_manager.shutdown()
            except Exception:
                pass
        # Shutdown AI worker pool if running
        try:
            if getattr(app.state, 'ai_worker_pool', None) is not None:
                try:
                    app.state.ai_worker_pool.shutdown()
                except Exception:
                    logger.exception("Error shutting down AI worker pool")
                app.state.ai_worker_pool = None
        except Exception:
            pass
        try:
            await choreo_controller.stop()
        except Exception:
            pass
        try:
            await orchestrator.shutdown()
        except Exception:
            pass


app = FastAPI(title="PubCast AI v9", lifespan=lifespan)

# ---- Operational Middlewares (configurable) ----
try:
    from modules.security.middleware import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
except Exception:
    pass

# GZip
try:
    gz_min = int(os.getenv("PUBCAST_GZIP_MIN", "1024"))
    app.add_middleware(GZipMiddleware, minimum_size=max(0, gz_min))
except Exception:
    pass

# Register AI router if available
try:
    app.include_router(ai_router)
except Exception:
    logger.debug("AI router not included")

# Trusted hosts
try:
    raw_hosts = os.getenv("PUBCAST_TRUSTED_HOSTS", "*")
    hosts = [h.strip() for h in raw_hosts.split(",") if h.strip()]
    if hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
except Exception:
    pass

# CORS
try:
    # Default to local dev origins; avoid wildcard by default
    raw_origins = os.getenv(
        "PUBCAST_ALLOWED_ORIGINS",
        "http://localhost:8000,http://127.0.0.1:8000",
    )
    origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    allow_credentials = os.getenv("PUBCAST_CORS_CREDENTIALS", "false").strip().lower() in ("1", "true", "yes")
    # Do not allow credentials with wildcard origins
    if ("*" in origins or origins == ["*"]) and allow_credentials:
        allow_credentials = False
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    pass

# Simple in-memory rate limiter (best-effort)
class _SimpleRateLimiter:
    def __init__(self, capacity: int = 100, window_seconds: int = 60) -> None:
        self.capacity = int(capacity)
        self.window = int(window_seconds)
        self._buckets: Dict[str, List[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = self._buckets.setdefault(key, [])
        # prune old
        cutoff = now - self.window
        i = 0
        for i in range(len(bucket)):
            if bucket[i] >= cutoff:
                break
        if i > 0:
            del bucket[:i]
        if len(bucket) >= self.capacity:
            return False
        bucket.append(now)
        return True


_rate_health = _SimpleRateLimiter(capacity=100, window_seconds=60)

# Basic CORS (envâ€‘driven) and static mounts
_origins_env = os.getenv("PUBCAST_ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").strip()
if _origins_env == "*" or not _origins_env:
    _allow_origins = ["*"]
else:
    _allow_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

_allow_credentials = os.getenv("PUBCAST_CORS_CREDENTIALS", "false").strip().lower() in ("1","true","yes")
if ("*" in _allow_origins or _allow_origins == ["*"]) and _allow_credentials:
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional Trusted Host protection (production)
_trusted_hosts_env = os.getenv("PUBCAST_TRUSTED_HOSTS", "").strip()
if _trusted_hosts_env:
    _trusted = [h.strip() for h in _trusted_hosts_env.split(",") if h.strip()]
    if _trusted:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=_trusted)

# GZip responses for larger payloads
app.add_middleware(GZipMiddleware, minimum_size=1024)
# Security middlewares (enterprise)
try:
    from modules.security.middleware import SecurityHeadersMiddleware, RateLimitMiddleware, RequestIDMiddleware
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    # Apply app-wide rate limiting (HTTP only; WS unaffected)
    app.add_middleware(RateLimitMiddleware)
except Exception:
    pass
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
_serve_data = os.getenv("PUBCAST_SERVE_DATA", "false").strip().lower() in ("1","true","yes")
if _serve_data:
    try:
        app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
    except Exception:
        pass

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.include_router(audio_router)
from modules.media_router import router as media_router
from modules.edit_router import router as edit_router
app.include_router(media_router)
app.include_router(edit_router)
# Security routers (auth, keys, GDPR) — optional if dependencies installed
try:
    from modules.security.users_router import router as users_router
    from modules.security.apikeys_router import router as keys_router
    from modules.security.gdpr_router import router as gdpr_router
    from modules.security.users_admin_router import router as users_admin_router
    app.include_router(users_router)
    app.include_router(keys_router)
    app.include_router(gdpr_router)
    app.include_router(users_admin_router)
    app.include_router(providers_router)
except Exception:
    pass

# Shepard/Cricket helper endpoints (nudge/time-buyer) — minimal implementation
from modules.security.middleware import require_permission_or_admin
from modules.security.auth import Permission

@app.post("/api/shepard/stall", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
async def shepard_stall(body: Dict[str, Any] = Body(default_factory=dict)):
    room = str(body.get("room") or "control").strip()
    ms = int(body.get("ms") or 800)
    line = str(body.get("message") or "Hang tight — brief pause while we sort something out.")
    # Post as a bot identity so UI badges can style it
    await hub.post_chat_message(room, "bot-cricket", line)
    # Also mark production_state with a subtle cue if desired
    try:
        updated = await hub.update_production_state({"cue": {"stall_ms": ms, "t": time.time()}})
        await hub.broadcast_system_event({"type": "production_state", "payload": updated})
    except Exception:
        pass
    return {"ok": True}


@app.post("/api/shepard/invite", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
async def shepard_invite(body: Dict[str, Any] = Body(default_factory=dict)):
    room = str(body.get("room") or "control").strip()
    target = str(body.get("target") or "guest").strip()
    line = str(body.get("message") or f"{target.capitalize()}, want to jump in with your thoughts?")
    await hub.post_chat_message(room, "bot-cricket", line)
    return {"ok": True}


 


def _get_or_set_uid(request: Request, response: Optional[Response] = None) -> str:
    uid = request.cookies.get("pubcast_uid")
    if not uid:
        uid = str(uuid.uuid4())
        if response is not None:
            response.set_cookie("pubcast_uid", uid, max_age=60 * 60 * 24 * 365)
    return uid


@app.get("/health")
def health():
    """Lightweight health endpoint with optional camera stream stats and audio clock metrics.

    This returns a basic ok flag and, when available, per-camera stream
    statistics gathered from the global `camera_manager`, and audio master clock metrics.
    """
    out: Dict[str, Any] = {"ok": True}
    try:
        # include camera stream telemetry if camera_manager is available
        cams = {}
        for s in (camera_manager.list_sources() if "camera_manager" in globals() else []):
            try:
                cams[s.source_id] = camera_manager.stream_stats(s.source_id)
            except Exception:
                logger.debug("Failed to collect stream_stats for %s", s.source_id, exc_info=True)
                cams[s.source_id] = {"error": "unavailable"}
        if cams:
            out["cameras"] = cams
    except Exception:
        # Do not fail the health endpoint for telemetry errors
        logger.debug("Error while collecting camera telemetry", exc_info=True)
    
    # Include audio clock metrics if available
    try:
        from modules.audio_clock import get_master_clock
        clock = get_master_clock()
        if clock:
            out["audio_clock"] = {
                "now": round(clock.now(), 3),
                "adjustments": clock.adjustments,
                "total_adjusted_seconds": round(clock.total_adjusted_seconds, 6),
                "underrun_count": clock.underrun_count,
                "overrun_count": clock.overrun_count,
            }
    except Exception:
        logger.debug("Error while collecting audio clock telemetry", exc_info=True)

    # Include AI capability status if available
    try:
        from modules.capability_probe import get_capability_probe
        probe = get_capability_probe()
        caps = probe.probe_all()
        # Include simplified capability status (just available flags)
        out["capabilities"] = {k: {"available": v.get("available"), "status": v.get("status")} for k, v in caps.items()}
    except Exception:
        logger.debug("Error while collecting capability telemetry", exc_info=True)

    return out


@app.get("/api/health")
def api_health(request: Request):
    # rate limit by client host (best-effort fallback to global)
    key = getattr(request.client, "host", None) or "global"
    if not _rate_health.allow(str(key)):
        raise HTTPException(status_code=429, detail="rate_limited")
    return {"ok": True}


# ---------- Templates ----------
@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    resp = templates.TemplateResponse("index.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/dressing", response_class=HTMLResponse)
def dressing(request: Request):
    resp = templates.TemplateResponse("dressing.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp

# Back-compat aliases from older/static links
@app.get("/dressing-room")
def dressing_alias() -> RedirectResponse:
    return RedirectResponse(url="/dressing", status_code=307)


@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request):
    resp = templates.TemplateResponse("admin.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/map", response_class=HTMLResponse)
def world(request: Request):
    resp = templates.TemplateResponse("world.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/control", response_class=HTMLResponse)
def control(request: Request):
    resp = templates.TemplateResponse("control.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp

@app.get("/builder", response_class=HTMLResponse)
def builder(request: Request):
    resp = templates.TemplateResponse("builder.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/gallery", response_class=HTMLResponse)
def gallery(request: Request):
    resp = templates.TemplateResponse("gallery.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/pub", response_class=HTMLResponse)
def pub(request: Request):
    # Pub main room (front corridor). Sub-areas handled client-side in bar.js
    resp = templates.TemplateResponse("bar.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/outside", response_class=HTMLResponse)
def outside(request: Request):
    # Parking lot / exterior facade for Josie's front door
    resp = templates.TemplateResponse("outside.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/pose-demo", response_class=HTMLResponse)
def pose_demo(request: Request):
    resp = templates.TemplateResponse("pose_demo.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/scanner", response_class=HTMLResponse)
def scanner(request: Request):
    resp = templates.TemplateResponse("scanner.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/tracking/print-tags", response_class=HTMLResponse)
def print_tags(request: Request):
    # Query: ?ids=1,2,3&size_mm=50
    try:
        raw = request.query_params.get("ids") or ""
        ids = [s for s in (raw.split(",") if raw else []) if s]
        size_mm = int(request.query_params.get("size_mm") or 50)
    except Exception:
        ids = []
        size_mm = 50
    resp = templates.TemplateResponse("print_tags.html", {"request": request, "ids": ids, "size_mm": size_mm})
    _get_or_set_uid(request, resp)
    return resp


@app.get("/analytics", response_class=HTMLResponse)
def analytics(request: Request):
    resp = templates.TemplateResponse("analytics.html", {"request": request})
    _get_or_set_uid(request, resp)
    return resp


# ---------- Avatars ----------
@app.get("/api/avatars/presets")
def api_avatar_presets():
    presets = [
        {
            "preset_id": p.preset_id,
            "name": p.name,
            "description": p.description,
        }
        for p in list_presets()
    ]
    return {"presets": presets}


@app.get("/api/avatar/me")
async def api_avatar_me(request: Request):
    uid = _get_or_set_uid(request)
    state = await load_avatar_async(DATA_DIR, uid)
    return state.dict()


@app.post("/api/avatar/me")
async def api_avatar_save(request: Request):
    uid = _get_or_set_uid(request)
    payload = await request.json()
    state = await save_avatar_async(DATA_DIR, uid, payload or {})
    # Invalidate presence cache for updated avatar
    hub.invalidate_user_cache(uid)
    return state.dict()


@app.get("/api/avatars/assets")
def get_avatar_assets():
    manifest = DATA_DIR / "avatar_assets.json"
    if not manifest.exists():
        return {"packs": []}
    return json.loads(manifest.read_text(encoding="utf-8"))


# ---------- Avatar scans and photos ----------
@app.post("/api/avatar/scan")
async def api_avatar_scan_upload(file: UploadFile):
    name = sanitize_filename(file.filename or "scan")
    if not allowed_upload_extension(name):
        raise HTTPException(status_code=400, detail="unsupported_extension")
    rel_dir = "uploads/avatar_scans"
    (ASSETS_DIR / rel_dir).mkdir(parents=True, exist_ok=True)
    dest = ASSETS_DIR / rel_dir / name
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(512 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"write_failed: {exc}")
    rel_path = f"/assets/{rel_dir}/{name}"
    return {"ok": True, "scan": {"name": name, "url": rel_path}}


@app.get("/api/avatar/scans")
def api_avatar_scans_list():
    rel_dir = "uploads/avatar_scans"
    root = ASSETS_DIR / rel_dir
    items = []
    if root.exists():
        for f in root.iterdir():
            if not f.is_file():
                continue
            items.append({"name": f.name, "url": f"/assets/{rel_dir}/{f.name}", "size": f.stat().st_size})
    items.sort(key=lambda x: x["name"].lower())
    return {"scans": items}


@app.post("/api/avatar/scan/apply")
async def api_avatar_scan_apply(request: Request, body: Dict[str, Any]):
    uid = _get_or_set_uid(request)
    url = str(body.get("url") or "").strip()
    if not url.startswith("/assets/"):
        raise HTTPException(status_code=400, detail="invalid_scan_url")
    state = await save_avatar_async(DATA_DIR, uid, {"glb_asset": url.lstrip("/"), "asset_pack": "scan"})
    return state.dict()


@app.post("/api/avatar/photo")
async def api_avatar_photo_upload(request: Request, file: UploadFile):
    name = sanitize_filename(file.filename or "photo.jpg")
    if not allowed_upload_extension(name):
        raise HTTPException(status_code=400, detail="unsupported_extension")
    rel_dir = "uploads/avatar_photos"
    (ASSETS_DIR / rel_dir).mkdir(parents=True, exist_ok=True)
    # Prefix with uid and timestamp to avoid collisions
    uid = _get_or_set_uid(request)
    base, dot, ext = name.partition(".")
    final_name = f"{uid}_{int(time.time())}.{ext or 'jpg'}"
    dest = ASSETS_DIR / rel_dir / final_name
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(512 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"write_failed: {exc}")
    rel_path = f"/assets/{rel_dir}/{final_name}"
    state = await save_avatar_async(DATA_DIR, uid, {"photo_texture": rel_path.lstrip("/")})
    return {"ok": True, "photo": {"url": rel_path}, "avatar": state.dict()}


@app.post("/api/avatar/voice")
async def api_avatar_voice_upload(request: Request, file: UploadFile):
    name = sanitize_filename(file.filename or "voice.webm")
    if not allowed_upload_extension(name):
        raise HTTPException(status_code=400, detail="unsupported_extension")
    rel_dir = "uploads/avatar_voice"
    (ASSETS_DIR / rel_dir).mkdir(parents=True, exist_ok=True)
    uid = _get_or_set_uid(request)
    base, dot, ext = name.partition(".")
    final_name = f"{uid}_{int(time.time())}.{ext or 'webm'}"
    dest = ASSETS_DIR / rel_dir / final_name
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(512 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"write_failed: {exc}")
    rel_path = f"/assets/{rel_dir}/{final_name}"
    state = await save_avatar_async(DATA_DIR, uid, {"voice_sample_url": rel_path.lstrip("/")})
    return {"ok": True, "voice": {"url": rel_path}, "avatar": state.dict()}


# ---------- PubWorld Interactables ----------
@app.get("/api/pubworld/interactables")
def api_pubworld_interactables(request: Request):
    allow_adult = os.getenv("PUBWORLD_ALLOW_ADULT_CONTENT", "").strip().lower() in ("1", "true", "yes")
    if request.headers.get("x-allow-adult", "").strip().lower() in ("1", "true", "yes"):
        allow_adult = True
    items = [i.dict() for i in list_interactables(DATA_DIR, allow_adult=allow_adult)]
    return {"items": items}


@app.get("/api/pubworld/scenes/{scene_id}/interactables")
def api_scene_interactables(scene_id: str, request: Request):
    # Resolve placed interactables with item metadata and adult gating
    allow_adult = os.getenv("PUBWORLD_ALLOW_ADULT_CONTENT", "").strip().lower() in ("1", "true", "yes")
    if request.headers.get("x-allow-adult", "").strip().lower() in ("1", "true", "yes"):
        allow_adult = True
    from modules.pubworld import get_scene  # local import to avoid cycles
    scene = get_scene(DATA_DIR, scene_id)
    items = {row["item_id"]: row for row in (i.dict() for i in list_interactables(DATA_DIR, allow_adult=allow_adult))}
    resolved = []
    # Snapshot of current tracks for optional binding
    try:
        _tracks = {t.track_id: t for t in tracking_service.list_tracks()}
    except Exception:
        _tracks = {}
    # Snapshot of templates for attach points
    try:
        _templates = {t.template_id: t for t in tracking_service.list_templates()}
    except Exception:
        _templates = {}
    # Scene mapping scale
    scale_px_per_m = getattr(scene, "scale_px_per_m", 100.0) or 100.0
    for placement in (scene.placements or []):
        meta = items.get(placement.item_id)
        if not meta:
            continue
        # Derive x from bound track if requested
        bind_x = None
        if getattr(placement, "bind_track_id", None):
            t = _tracks.get(placement.bind_track_id)
            if t and t.last_pose and isinstance(t.last_pose.position, list) and len(t.last_pose.position) >= 1:
                try:
                    # Optional attach point offset in meters (x component)
                    attach_dx = 0.0
                    if getattr(placement, "bind_attach", None) and t.template_id and t.template_id in _templates:
                        ap = (_templates[t.template_id].attach_points or {}).get(placement.bind_attach)
                        if isinstance(ap, (list, tuple)) and len(ap) >= 1:
                            attach_dx = float(ap[0] or 0.0)
                    raw_x_m = float(t.last_pose.position[0]) + attach_dx
                    bind_x = int(round(raw_x_m * float(scale_px_per_m)))
                except Exception:
                    bind_x = None
        row = {
            "placement_id": placement.placement_id,
            "item_id": placement.item_id,
            "x": bind_x if bind_x is not None else placement.x,
            "lane": placement.lane,
            "rotation": placement.rotation,
            "label": placement.label or meta.get("label"),
            "actions": meta.get("actions", []),
            "asset": meta.get("asset"),
            "tags": meta.get("tags", []),
            # Echo binding so clients can optionally handle updates client-side
            "bind_track_id": getattr(placement, "bind_track_id", None),
            "bind_attach": getattr(placement, "bind_attach", None),
        }
        resolved.append(row)
    resolved.sort(key=lambda r: (r.get("lane", 1), r.get("x", 0)))
    return {"items": resolved}


@app.post("/api/pubworld/placement/bind")
def api_pubworld_bind_placement(payload: Dict[str, Any], request: Request):
    # Runtime admin guard to avoid import-time dependency order issues
    try:
        require_admin(request)
    except Exception as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    """Bind or unbind an interactable placement to a live track.

    Body: { scene_id, placement_id, bind_track_id?, bind_attach? }
    If bind_track_id is empty/null, binding is removed.
    """
    scene_id = str(payload.get("scene_id") or "").strip()
    placement_id = str(payload.get("placement_id") or "").strip()
    if not scene_id or not placement_id:
        raise HTTPException(status_code=400, detail="scene_id and placement_id required")
    try:
        scene = get_scene(DATA_DIR, scene_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="scene_not_found")
    found = None
    for p in (scene.placements or []):
        if p.placement_id == placement_id:
            # Update binding
            bind_track_id = payload.get("bind_track_id")
            bind_attach = payload.get("bind_attach")
            p.bind_track_id = str(bind_track_id) if bind_track_id else None
            p.bind_attach = str(bind_attach) if bind_attach else None
            found = p
            break
    if not found:
        raise HTTPException(status_code=404, detail="placement_not_found")
    # Persist
    save_scene(DATA_DIR, scene)
    # Return resolved placement payload same as in scene interactables
    meta_map = {row["item_id"]: row for row in (i.dict() for i in list_interactables(DATA_DIR))}
    meta = meta_map.get(found.item_id, {})
    row = {
        "placement_id": found.placement_id,
        "item_id": found.item_id,
        "x": found.x,
        "lane": found.lane,
        "rotation": found.rotation,
        "label": found.label or meta.get("label"),
        "actions": meta.get("actions", []),
        "asset": meta.get("asset"),
        "tags": meta.get("tags", []),
        "bind_track_id": found.bind_track_id,
        "bind_attach": found.bind_attach,
    }
    return {"placement": row}

 


# ---------- Models (BYOK) ----------
@app.get("/api/models", response_model=ModelsResponse)
def list_models(request: Request):
    uid = _get_or_set_uid(request)
    models = user_model_manager.list_models(uid)
    return {"models": [m.dict() for m in models]}


@app.post("/api/models", response_model=ModelResponse)
def create_model(request: Request, body: ModelCreateRequest):
    uid = _get_or_set_uid(request)
    model = user_model_manager.create_model(
        uid,
        provider=body.provider,
        kind=body.kind,
        display_name=body.display_name,
        settings=body.settings or {},
        secrets=body.secrets or {},
    )
    # Optional verification skipped when verify=False in tests
    return {"model": model.dict()}


@app.delete("/api/models/{model_id}")
def delete_model(request: Request, model_id: str):
    uid = _get_or_set_uid(request)
    user_model_manager.delete_model(uid, model_id)
    return {"deleted": True}


# ---------- Rooms + WebSocket ----------
@app.post("/api/rooms")
async def create_room_api(body: RoomCreateRequest):
    # Generate a simple room id
    room_id = f"rm_{uuid.uuid4().hex[:8]}"
    room = await room_manager.create_room(
        room_id=room_id,
        room_name=body.room_name,
        voice_out_enabled=body.voice_out_enabled,
        avatar_id=body.avatar_id,
    )
    snap = room.snapshot().dict()
    snap["room_id"] = room.room_id
    snap["room_name"] = room.room_name
    return {"room": snap}


@app.get("/api/rooms")
async def list_rooms_api():
    rooms = await room_manager.list_rooms()
    # Pydantic model -> dict
    return {"rooms": [r.dict() for r in rooms]}


# ---------- Choreography (steps + preview) ----------
@app.get("/api/choreo/steps")
def api_choreo_steps(scene_id: str):
    steps = [s.dict() for s in choreo_list_steps(DATA_DIR, scene_id)]
    return {"steps": steps, "scene_id": scene_id}


@app.post("/api/choreo/step")
def api_choreo_add_step(payload: Dict[str, Any]):
    scene_id = str(payload.get("scene_id") or "").strip()
    step = payload.get("step") or {}
    if not scene_id:
        raise HTTPException(status_code=400, detail="scene_id_required")
    try:
        model = choreo_add_step(DATA_DIR, scene_id, step)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "step": model.dict()}


@app.delete("/api/choreo/step/{step_id}")
def api_choreo_delete_step(step_id: str, scene_id: str):
    ok = choreo_delete_step(DATA_DIR, scene_id, step_id)
    if not ok:
        raise HTTPException(status_code=404, detail="step_not_found")
    return {"ok": True}


@app.post("/api/choreo/preview/start")
async def api_choreo_preview_start(payload: Dict[str, Any]):
    room_id = str(payload.get("room_id") or "").strip()
    steps = payload.get("steps") or []
    fps = float(payload.get("fps") or 30.0)
    if not room_id:
        raise HTTPException(status_code=400, detail="room_id_required")
    # Validate steps using ChoreoStep
    clean_steps: List[Dict[str, Any]] = []
    for raw in steps:
        try:
            _ = ChoreoStep(**raw)
            clean_steps.append(raw)
        except Exception:
            continue
    if not clean_steps:
        # allow preview with a single no-op step for smoke tests
        clean_steps = [{"animation_type": "pose_transition", "start_time": 0.0, "duration": 1.0, "target_skeleton": {}}]
    try:
        await choreo_controller.start(room=room_id, avatars=None, steps=clean_steps, tick_hz=fps)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"preview_failed: {exc}") from exc
    return {"ok": True}


@app.post("/api/choreo/preview/stop")
async def api_choreo_preview_stop():
    try:
        await choreo_controller.stop()
    except Exception:
        pass
    return {"ok": True}


# ---------- Retarget verification ----------
@app.get("/api/retarget/canonical")
def api_retarget_canonical():
    path = ASSETS_DIR / "avatar" / "canonical_skeleton.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"version": "canon/v1", "units": "meters", "joints": []}


@app.post("/api/retarget/verify")
def api_retarget_verify(payload: Dict[str, Any]):
    mapping = payload.get("mapping") or {}
    canon_path = ASSETS_DIR / "avatar" / "canonical_skeleton.json"
    try:
        canonical = json.loads(canon_path.read_text(encoding="utf-8"))
    except Exception:
        canonical = {"version": "canon/v1", "units": "meters", "joints": []}
    report = _verify_mapping(mapping, canonical)
    return report


@app.post("/api/rooms/{room_id}/agents")
async def add_agents_api(room_id: str, body: AddAgentsRequest):
    try:
        attached = await orchestrator.add_agents(room_id, body.agent_ids or [])
        room = await room_manager.require_room(room_id)
        state = room.state_event().dict()
        state["agents"] = sorted(list(room.agents))
        return {"attached": attached, "room": state}
    except KeyError:
        raise HTTPException(status_code=404, detail="room_not_found")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/agents")
def list_agents_api():
    items = []
    try:
        for cfg in agent_registry.available_agents():
            items.append(
                {
                    "agent_id": cfg.agent_id,
                    "display_name": cfg.display_name,
                    "provider": cfg.provider,
                    "model": cfg.model,
                    "priority": cfg.priority,
                    "cooldown_ms": cfg.cooldown_ms,
                }
            )
    except Exception:
        pass
    return {"agents": items}


# ---------- Tracking (templates + tracks + sim) ----------
# Local watcher registry for per-track WS listeners
TRACKER_WATCHERS: Dict[str, set] = {}

# Pose streaming/recording (canonical skeleton frames)
POSE_RECORDERS: Dict[str, Dict[str, Any]] = {}

def _now_ms() -> float:
    return time.time() * 1000.0

async def _broadcast_pose(room: str, pose: Dict[str, Any]) -> None:
    try:
        # Prefer room-specific broadcast
        await hub._broadcast(room, {"type": "pose.frame", "payload": {"pose": pose, "ts": _now_ms(), "room": room}})
    except Exception:
        # Fallback to system-broadcast
        try:
            await hub.broadcast_system_event({"type": "pose.frame", "payload": {"pose": pose, "ts": _now_ms(), "room": room}})
        except Exception:
            pass

def _record_pose_if_active(room: str, pose: Dict[str, Any]) -> None:
    rec = POSE_RECORDERS.get(room)
    if not rec:
        return
    frames = rec.setdefault("frames", [])
    frames.append({"t": _now_ms(), "pose": pose})


def _lost_bind_policy() -> str:
    return os.getenv("PUBWORLD_LOST_BIND_POLICY", "freeze").strip().lower()


def _unbind_track_bindings(track_id: str) -> int:
    """Remove bind_track_id references from all scenes for a given track.

    Returns count of updated placements.
    """
    updated = 0
    try:
        scenes = list_scenes(DATA_DIR)
    except Exception:
        return 0
    for scn in scenes:
        changed = False
        for p in (scn.placements or []):
            if getattr(p, "bind_track_id", None) == track_id:
                p.bind_track_id = None
                p.bind_attach = None
                changed = True
                updated += 1
        if changed:
            try:
                save_scene(DATA_DIR, scn)
            except Exception:
                pass
    return updated
@app.get("/api/tracking/templates")
def api_tracking_templates():
    templates = [t.dict() for t in tracking_service.list_templates()]
    return {"templates": templates}


@app.post("/api/tracking/templates")
def api_tracking_upsert_template(payload: Dict[str, Any]):
    try:
        model = tracking_service.upsert_template(payload or {})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "template": model.dict()}


@app.get("/api/tracking/tracks")
def api_tracking_tracks():
    tracks = [t.dict() for t in tracking_service.list_tracks()]
    return {"tracks": tracks}


@app.post("/api/tracking/assign")
def api_tracking_assign(payload: Dict[str, Any]):
    try:
        model = tracking_service.assign(payload or {})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        # Broadcast a bound event across rooms
        asyncio.create_task(hub.broadcast_system_event({"type": "tracking.bound", "payload": model.dict()}))
    except Exception:
        pass
    return {"ok": True, "track": model.dict()}


@app.post("/api/tracking/unassign")
def api_tracking_unassign(payload: Dict[str, Any]):
    track_id = str(payload.get("track_id") or "")
    if not track_id:
        raise HTTPException(status_code=400, detail="track_id_required")
    ok = tracking_service.unassign(track_id)
    if not ok:
        raise HTTPException(status_code=404, detail="track_not_found")
    return {"ok": True}


@app.post("/api/tracking/sim/tick")
async def api_tracking_sim_tick():
    model = tracking_service.simulate_tick()
    try:
        await hub.broadcast_system_event({"type": "tracking.update", "payload": model.dict()})
    except Exception:
        pass
    return {"ok": True, "track": model.dict()}


@app.post("/api/tracking/observe")
async def api_tracking_observe(payload: Dict[str, Any]):
    try:
        result = tracking_service.observe(payload or {})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Broadcast updates
    try:
        async def _notify(event_type: str, model: Any) -> None:
            payload = model.dict() if hasattr(model, 'dict') else model
            await hub.broadcast_system_event({"type": event_type, "payload": payload})
            # Per-track watchers
            tid = payload.get("track_id") if isinstance(payload, dict) else getattr(payload, "track_id", None)
            if tid and tid in TRACKER_WATCHERS:
                for ws in list(TRACKER_WATCHERS.get(tid, set())):
                    try:
                        if ws.application_state == WebSocketState.CONNECTED:
                            await ws.send_text(json.dumps({"type": event_type, "payload": payload}))
                        else:
                            TRACKER_WATCHERS.get(tid, set()).discard(ws)
                    except Exception:
                        TRACKER_WATCHERS.get(tid, set()).discard(ws)
        for t in result.get("updates", []):
            await _notify("tracking.update", t)
        for t in result.get("bound", []):
            await _notify("tracking.bound", t)
        for t in result.get("lost", []):
            await _notify("tracking.lost", t)
            # Optional auto-unbind policy
            try:
                if _lost_bind_policy() == "unbind":
                    tid = t.track_id if hasattr(t, 'track_id') else (t.get('track_id') if isinstance(t, dict) else None)
                    if tid:
                        _unbind_track_bindings(str(tid))
            except Exception:
                pass
    except Exception:
        pass
    # Normalize to JSON-safe
    def norm(arr):
        out = []
        for x in arr:
            out.append(x.dict() if hasattr(x, 'dict') else x)
        return out
    return {
        "ok": True,
        "updates": norm(result.get("updates", [])),
        "bound": norm(result.get("bound", [])),
        "created": norm(result.get("created", [])),
        "lost": norm(result.get("lost", [])),
    }


def _detector_key() -> str:
    return os.getenv("PUBCAST_DETECTOR_KEY", "").strip()


_INGEST_LIMITERS: Dict[str, _SimpleRateLimiter] = {}


def _ingest_limiter_for(key: str) -> _SimpleRateLimiter:
    lim = _INGEST_LIMITERS.get(key)
    if lim is None:
        lim = _SimpleRateLimiter(capacity=120, window_seconds=60)
        _INGEST_LIMITERS[key] = lim
    return lim


@app.post("/api/tracking/ingest/detections")
async def api_tracking_ingest_detections(request: Request, payload: Dict[str, Any]):
    """Accept external fiducial detections and forward to the matcher.

    Payload shape (flexible):
      { "detections": [ { "id": "42", "position": [x,y,z], "rotation": [qx,qy,qz,qw] }, ... ] }
    """
    # Optional auth
    key = _detector_key()
    if key:
        supplied = request.headers.get("x-detector-key") or request.headers.get("X-Detector-Key")
        if supplied != key:
            raise HTTPException(status_code=403, detail="detector_key_required")
        # Rate limit per key
        limiter = _ingest_limiter_for(supplied)
        if not limiter.allow("ingest:" + supplied):
            raise HTTPException(status_code=429, detail="rate_limited")
    try:
        detections = payload.get("detections") or []
        markers: Dict[str, List[float]] = {}
        for d in detections:
            try:
                mid = str(d.get("id") if isinstance(d, dict) else None)
                if not mid:
                    continue
                pos = d.get("position") or d.get("pos") or d.get("tvec")
                if not isinstance(pos, (list, tuple)) or len(pos) < 3:
                    continue
                markers[mid] = [float(pos[0]), float(pos[1]), float(pos[2])]
            except Exception:
                continue
        result = tracking_service.observe({"markers": markers})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        async def _notify(event_type: str, model: Any) -> None:
            payload = model.dict() if hasattr(model, 'dict') else model
            await hub.broadcast_system_event({"type": event_type, "payload": payload})
            tid = payload.get("track_id") if isinstance(payload, dict) else getattr(payload, "track_id", None)
            if tid and tid in TRACKER_WATCHERS:
                for ws in list(TRACKER_WATCHERS.get(tid, set())):
                    try:
                        if ws.application_state == WebSocketState.CONNECTED:
                            await ws.send_text(json.dumps({"type": event_type, "payload": payload}))
                        else:
                            TRACKER_WATCHERS.get(tid, set()).discard(ws)
                    except Exception:
                        TRACKER_WATCHERS.get(tid, set()).discard(ws)
        for t in result.get("updates", []):
            await _notify("tracking.update", t)
        for t in result.get("bound", []):
            await _notify("tracking.bound", t)
        for t in result.get("lost", []):
            await _notify("tracking.lost", t)
            try:
                if _lost_bind_policy() == "unbind":
                    tid = t.track_id if hasattr(t, 'track_id') else (t.get('track_id') if isinstance(t, dict) else None)
                    if tid:
                        _unbind_track_bindings(str(tid))
            except Exception:
                pass
    except Exception:
        pass

    def norm(arr):
        out = []
        for x in arr:
            out.append(x.dict() if hasattr(x, 'dict') else x)
        return out
    return {
        "ok": True,
        "updates": norm(result.get("updates", [])),
        "bound": norm(result.get("bound", [])),
        "created": norm(result.get("created", [])),
        "lost": norm(result.get("lost", [])),
    }

@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str):
    # Extract or mint uid from cookies (ASGI scope headers)
    headers = dict(websocket.headers or {})
    cookies = headers.get("cookie") or headers.get("Cookie") or ""
    uid = None
    if cookies:
        for part in cookies.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "pubcast_uid":
                uid = v
                break
    if not uid:
        uid = str(uuid.uuid4())

    await hub.connect(websocket, room_id, uid)
    is_agent_room = room_id.startswith("rm_")
    participant_id = f"user:{uid}"
    if is_agent_room:
        try:
            # Ensure orchestrator room exists and join
            try:
                await room_manager.require_room(room_id)
            except Exception:
                await room_manager.create_room(room_id, room_id)
            await orchestrator.join_room(room_id, participant_id, uid, websocket)
        except Exception:
            # Non-fatal: continue with hub-only behavior
            pass
    try:
        while True:
            msg = await websocket.receive_text()
            await hub.handle_message(websocket, msg)
            if is_agent_room:
                try:
                    payload = json.loads(msg)
                    kind = payload.get("type")
                    text = None
                    if kind == "chat":
                        text = (payload.get("payload") or {}).get("text")
                    elif kind == "say":
                        text = (payload.get("text") or "").strip()
                    if text:
                        await orchestrator.handle_human_message(room_id, participant_id, text)
                except Exception:
                    pass
    except WebSocketDisconnect:
        await hub.disconnect(websocket)
        if is_agent_room:
            try:
                await orchestrator.leave_room(room_id, participant_id)
            except Exception:
                pass


# Per-track watcher for viewer.js compatibility
@app.websocket("/ws/tracker/{track_id}")
async def ws_tracker_single(websocket: WebSocket, track_id: str):
    await websocket.accept()
    watchers = TRACKER_WATCHERS.setdefault(track_id, set())
    watchers.add(websocket)
    try:
        while True:
            try:
                # Keepalive or ignore messages
                _ = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                # ignore parse errors
                pass
    finally:
        try:
            TRACKER_WATCHERS.get(track_id, set()).discard(websocket)
        except Exception:
            pass
# Streaming detector ingest over WebSocket (flexible schema)
@app.websocket("/ws/tracking/ingest")
async def ws_tracking_ingest(websocket: WebSocket):
    await websocket.accept()
    # Optional auth via header or first message {"auth":"key"}
    detector_key = _detector_key()
    supplied = websocket.headers.get("x-detector-key") or websocket.headers.get("X-Detector-Key")
    authed = False if detector_key else True
    if detector_key:
        if supplied == detector_key:
            authed = True
    try:
        while True:
            try:
                msg = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            try:
                obj = json.loads(msg)
            except Exception:
                try:
                    obj = json.loads((msg or "").strip())
                except Exception:
                    await websocket.send_text(json.dumps({"ok": False, "error": "invalid_json"}))
                    continue
            # First message could be auth
            if detector_key and not authed and isinstance(obj, dict) and obj.get("auth"):
                if str(obj.get("auth")).strip() == detector_key:
                    authed = True
                    await websocket.send_text(json.dumps({"ok": True, "auth": "ok"}))
                else:
                    await websocket.send_text(json.dumps({"ok": False, "error": "auth_failed"}))
                continue
            if detector_key and not authed:
                await websocket.send_text(json.dumps({"ok": False, "error": "auth_required"}))
                continue

            detections = obj.get("detections") or []
            markers: Dict[str, List[float]] = {}
            for d in detections:
                try:
                    mid = str(d.get("id") if isinstance(d, dict) else None)
                    if not mid:
                        continue
                    pos = d.get("position") or d.get("pos") or d.get("tvec")
                    if not isinstance(pos, (list, tuple)) or len(pos) < 3:
                        continue
                    markers[mid] = [float(pos[0]), float(pos[1]), float(pos[2])]
                except Exception:
                    continue

            if not markers:
                await websocket.send_text(json.dumps({"ok": True, "updates": 0}))
                continue
            # Rate limit per detector key if configured
            if detector_key:
                key = supplied or "ws"
                limiter = _ingest_limiter_for(key)
                if not limiter.allow("ingest:" + key):
                    await websocket.send_text(json.dumps({"ok": False, "error": "rate_limited"}))
                    continue
            result = tracking_service.observe({"markers": markers})
            try:
                for t in result.get("updates", []):
                    await hub.broadcast_system_event({"type": "tracking.update", "payload": (t.dict() if hasattr(t, 'dict') else t)})
                for t in result.get("bound", []):
                    await hub.broadcast_system_event({"type": "tracking.bound", "payload": (t.dict() if hasattr(t, 'dict') else t)})
                for t in result.get("lost", []):
                    await hub.broadcast_system_event({"type": "tracking.lost", "payload": (t.dict() if hasattr(t, 'dict') else t)})
            except Exception:
                pass

            await websocket.send_text(json.dumps({
                "ok": True,
                "counts": {
                    "updates": len(result.get("updates", [])),
                    "bound": len(result.get("bound", [])),
                    "created": len(result.get("created", [])),
                    "lost": len(result.get("lost", [])),
                }
            }))
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass


# ---------- Canonical Pose ingest + record ----------

@app.post("/api/pose/frame")
async def api_pose_frame(payload: Dict[str, Any]):
    room = str(payload.get("room_id") or "green")
    pose = payload.get("pose") or {}
    if not isinstance(pose, dict):
        raise HTTPException(status_code=400, detail="invalid_pose")
    _record_pose_if_active(room, pose)
    await _broadcast_pose(room, pose)
    return {"ok": True}


@app.post("/api/pose/record/start")
def api_pose_record_start(payload: Dict[str, Any]):
    room = str(payload.get("room_id") or "green")
    scene_id = str(payload.get("scene_id") or "")
    if not scene_id:
        raise HTTPException(status_code=400, detail="scene_id_required")
    POSE_RECORDERS[room] = {"scene_id": scene_id, "frames": [], "t0": _now_ms()}
    return {"ok": True}


@app.post("/api/pose/record/stop")
def api_pose_record_stop(payload: Dict[str, Any]):
    room = str(payload.get("room_id") or "green")
    rec = POSE_RECORDERS.pop(room, None)
    if not rec:
        raise HTTPException(status_code=404, detail="no_active_recording")
    scene_id = rec.get("scene_id") or ""
    frames = rec.get("frames") or []
    if not scene_id or not frames:
        return {"ok": True, "steps": []}
    # Downsample to ~2 Hz for coarse pose transitions
    sample_ms = int(payload.get("sample_ms") or 500)
    t0 = rec.get("t0") or frames[0]["t"]
    steps: List[Dict[str, Any]] = []
    last_emit = -1e9
    for f in frames:
        t = float(f.get("t") or 0) - t0
        if (t - last_emit) >= sample_ms:
            pose = f.get("pose") or {}
            joints = (pose.get("joints") or {}) if isinstance(pose, dict) else {}
            # Build target_skeleton: joint -> quaternion list
            target = {}
            for j, data in joints.items():
                try:
                    rot = list((data or {}).get("rotation") or [])
                    if len(rot) >= 4:
                        target[str(j)] = rot[:4]
                except Exception:
                    continue
            step = {
                "animation_type": "pose_transition",
                "start_time": max(0.0, t / 1000.0),
                "duration": float(sample_ms) / 1000.0,
                "ease": "linear",
                "target_skeleton": target,
                "pins": {},
            }
            try:
                model = choreo_add_step(DATA_DIR, scene_id, step)
                steps.append(model.dict())
            except Exception:
                # continue on error
                pass
            last_emit = t
    return {"ok": True, "steps": steps}
# ---------- Production State ----------
@app.get("/api/state/production")
async def get_production_state():
    return await hub.get_production_state()


@app.post("/api/state/production")
async def update_production_state(patch: Dict[str, Any]):
    try:
        return await hub.update_production_state(patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


 


# ---------- Uploads ----------
@app.post("/api/upload")
async def upload(file: UploadFile = File(...), target: str = Form("")):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    if not allowed_upload_extension(file.filename):
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    filename = sanitize_filename(file.filename)
    rel_dir = "uploads"
    out_dir = ASSETS_DIR / rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / filename
    # Stream to disk with a server-side cap
    try:
        max_mb = int(os.getenv("PUBCAST_MAX_UPLOAD_MB", "5").strip())
    except Exception:
        max_mb = 5
    max_bytes = max(1, max_mb) * 1024 * 1024
    size = 0
    try:
        with out_path.open("wb") as handle:
            chunk_size = 1024 * 1024
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    try:
                        handle.close()
                        out_path.unlink(missing_ok=True)
                    finally:
                        pass
                    raise HTTPException(status_code=413, detail="file_too_large")
                handle.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        # Clean up on error
        out_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"upload_failed: {exc}")
    rel_path = f"/assets/{rel_dir}/{filename}"
    return {"path": rel_path}


# ---------- Inference ----------
@app.post("/api/inference/llm")
async def inference_llm(body: Dict[str, Any]):
    prompt = str(body.get("prompt", "").strip())
    if inference_manager is not None:
        try:
            result = await inference_manager.generate_text(prompt)
            return {"ok": True, "result": result}
        except Exception as exc:  # noqa: BLE001
            # Fallback to stub on error
            text = f"[worker-error {type(exc).__name__}] {prompt}".strip()
            return {"ok": True, "result": {"text": text, "engine": "stub"}}
    text = f"[stub-llm temp=0.7 max_tokens=256] {prompt}".strip()
    return {"ok": True, "result": {"text": text, "engine": "stub"}}


@app.get("/api/inference/status")
def inference_status():
    if inference_manager is not None:
        try:
            return {"ok": True, "status": inference_manager.status()}
        except Exception:
            pass
    return {"ok": True, "status": {"pending_jobs": 0, "worker_alive": False}}


# ---------- Status / Recording Profiles / Credentials ----------
@app.get("/status")
def status():
    ffmpeg_path = os.getenv("PUBCAST_FFMPEG") or shutil.which("ffmpeg")
    ffprobe_path = os.getenv("PUBCAST_FFPROBE") or shutil.which("ffprobe")
    sec_dir = DATA_DIR / "secure" / "creds"
    try:
        keys_ok = any(sec_dir.glob("*.json"))
    except Exception:
        keys_ok = False
    return {"ffmpeg_ok": bool(ffmpeg_path), "ffprobe_ok": bool(ffprobe_path), "keys_ok": keys_ok}


@app.get("/api/recordings/profiles")
def get_recording_profiles():
    profiles = []
    for p in recording_service.list_profiles():
        profiles.append(
            {
                "profile_id": p.profile_id,
                "name": p.name,
                "container": p.container.value,
                "video_codec": p.video_codec,
                "audio_codec": p.audio_codec,
                "video_bitrate": p.video_bitrate,
                "audio_bitrate": p.audio_bitrate,
                "resolution": p.resolution,
                "frame_rate": p.frame_rate,
                "description": p.description,
                "is_audio_only": p.is_audio_only,
            }
        )
    return {"profiles": profiles}


def _admin_key() -> str:
    return os.getenv("PUBCAST_ADMIN_KEY", "").strip()


def require_admin(request: Request):
    key = _admin_key()
    if not key:
        return  # no admin key required
    supplied = request.headers.get("x-admin-key") or request.headers.get("X-Admin-Key")
    if supplied != key:
        raise HTTPException(status_code=403, detail="Admin key required")


# ---------- Unified Jobs (aggregate) ----------
@app.get("/api/jobs/all")
async def jobs_all(status: Optional[str] = None) -> Dict[str, Any]:
    jobs: List[Dict[str, Any]] = []
    # Collect from audio router
    try:
        from modules.audio_router import _jobs as audio_jobs  # type: ignore
        jobs.extend(list(audio_jobs.values()))
    except Exception:
        pass
    # Collect from edit router
    try:
        from modules.edit_router import _jobs as edit_jobs  # type: ignore
        jobs.extend(list(edit_jobs.values()))
    except Exception:
        pass
    if status is not None:
        jobs = [j for j in jobs if str(j.get("status")) == status]
    jobs.sort(key=lambda j: j.get("started", 0), reverse=True)
    return {"jobs": jobs}


@app.post("/api/jobs/{job_id}/cancel")
async def jobs_cancel(job_id: str, request: Request) -> Dict[str, Any]:
    # Admin-gated
    require_admin(request)
    import signal
    cancelled = False
    for mod_name in ("modules.audio_router", "modules.edit_router"):
        try:
            mod = __import__(mod_name, fromlist=["_jobs"])  # type: ignore
            jobs = getattr(mod, "_jobs", {})
            job = jobs.get(job_id)
            if job and job.get("running"):
                pid = job.get("pid")
                if pid:
                    try:
                        os.kill(pid, signal.SIGTERM)
                        job["running"] = False
                        job["status"] = "cancelled"
                        job["ended"] = time.time()
                        cancelled = True
                        break
                    except Exception:
                        # Try to mark failed if signal fails
                        job["running"] = False
                        job["status"] = "failed"
                        job["ended"] = time.time()
        except Exception:
            continue
    if not cancelled:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, "job_id": job_id}


@app.get("/api/credentials/summary", response_model=CredentialSummaryResponse)
def get_credentials_summary(request: Request, _: None = Depends(require_admin)):
    uid = _get_or_set_uid(request)
    providers = [entry.dict() for entry in user_model_manager.credential_summary(uid)]
    return {"providers": providers}


# ---------- Recording Sessions (feature toggle) ----------


class RecordingStartRequest(BaseModel):
    session_id: Optional[str] = None
    sources: List[str]
    profile_id: str
    operator: Optional[str] = None
    preset: Optional[str] = None
    host_override: bool = False
    countdown_seconds: Optional[int] = 5


class RecordingUpdateRequest(BaseModel):
    session_id: str


class RecordingPauseRequest(BaseModel):
    session_id: str
    paused: bool


def _recording_enabled() -> bool:
    return os.getenv("PUBCAST_ENABLE_RECORDING", "").strip().lower() in ("1", "true", "yes")


@app.get("/api/recordings/sources")
def recording_sources(_: None = Depends(require_admin)):
    sources = recording_service.list_sources()
    return {"sources": [s.__dict__ for s in sources]}


@app.get("/api/recordings/storage")
def recording_storage(_: None = Depends(require_admin)):
    return recording_service.storage_status()


@app.get("/api/recordings/sessions")
def recording_sessions(_: None = Depends(require_admin)):
    sessions = [s.to_dict() for s in recording_service.list_sessions()]
    return {"sessions": sessions}


@app.get("/api/recordings/session/{session_id}")
def recording_get(session_id: str, _: None = Depends(require_admin)):
    try:
        return {"session": recording_service.get_session(session_id).to_dict()}
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found")


@app.post("/api/recordings/session/start")
def recording_start(body: RecordingStartRequest, request: Request, _: None = Depends(require_admin)):
    if not _recording_enabled():
        raise HTTPException(status_code=503, detail="Recording disabled")
    operator = body.operator or _get_or_set_uid(request)
    try:
        session = recording_service.start_session(
            session_id=body.session_id,
            sources=list(body.sources or []),
            profile_id=body.profile_id,
            operator=operator,
            preset=body.preset,
            host_override=bool(body.host_override),
            countdown_seconds=int(body.countdown_seconds or 0),
        )
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"session": session.to_dict()}


@app.post("/api/recordings/session/activate")
def recording_activate(body: RecordingUpdateRequest, _: None = Depends(require_admin)):
    if not _recording_enabled():
        raise HTTPException(status_code=503, detail="Recording disabled")
    try:
        session = recording_service.activate_session(body.session_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"session": session.to_dict()}


@app.post("/api/recordings/session/stop")
def recording_stop(body: RecordingUpdateRequest, _: None = Depends(require_admin)):
    if not _recording_enabled():
        raise HTTPException(status_code=503, detail="Recording disabled")
    try:
        session = recording_service.stop_session(body.session_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"session": session.to_dict()}


@app.post("/api/recordings/session/pause")
def recording_pause(body: RecordingPauseRequest, _: None = Depends(require_admin)):
    if not _recording_enabled():
        raise HTTPException(status_code=503, detail="Recording disabled")
    try:
        session = recording_service.pause_session(body.session_id, body.paused)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"session": session.to_dict()}


# ---------- Cameras Management ----------

class CameraRegisterRequest(BaseModel):
    source_id: str
    name: str
    description: str
    location: str
    transport: str
    endpoint: str
    audio_channels: int = 2
    video_enabled: bool = True
    audio_enabled: bool = True
    tags: List[str] = []
    is_private: bool = False


class CameraStatusUpdate(BaseModel):
    source_id: str
    online: Optional[bool] = None
    latency_ms: Optional[float] = None
    notes: Optional[str] = None


@app.get("/api/cameras", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
def cameras_list():
    sources = recording_service.list_sources()
    return {
        "sources": [
            {
                "source_id": s.source_id,
                "name": s.name,
                "description": s.description,
                "location": s.location,
                "transport": s.transport.value,
                "endpoint": s.endpoint,
                "audio_channels": s.audio_channels,
                "video_enabled": s.video_enabled,
                "audio_enabled": s.audio_enabled,
                "tags": list(s.tags or []),
                "is_private": s.is_private,
            }
            for s in sources
        ]
    }


@app.post("/api/cameras/register", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_CONFIG))])
def cameras_register(body: CameraRegisterRequest):
    try:
        transport = CameraTransport(body.transport)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid transport")
    src = CameraSource(
        source_id=body.source_id.strip(),
        name=body.name.strip(),
        description=body.description.strip(),
        location=body.location.strip(),
        transport=transport,
        endpoint=body.endpoint.strip(),
        audio_channels=int(body.audio_channels),
        video_enabled=bool(body.video_enabled),
        audio_enabled=bool(body.audio_enabled),
        tags=list(body.tags or []),
        is_private=bool(body.is_private),
    )
    try:
        recording_service.cameras.register(src)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@app.delete("/api/cameras/{source_id}", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_CONFIG))])
def cameras_remove(source_id: str):
    recording_service.cameras.remove(source_id)
    return {"ok": True}


@app.get("/api/cameras/status", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
def cameras_status():
    return {"status": [s.__dict__ for s in recording_service.cameras.list_status()]}


@app.post("/api/cameras/status", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
def cameras_status_update(body: CameraStatusUpdate):
    try:
        recording_service.cameras.set_status(
            body.source_id,
            online=body.online,
            latency_ms=body.latency_ms,
            notes=body.notes,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown camera")
    return {"ok": True}


@app.get("/api/cameras/privacy", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
def cameras_privacy():
    return {"privacy": recording_service.privacy_matrix()}


@app.put("/api/cameras/privacy", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_CONFIG))])
def cameras_privacy_put(payload: Dict[str, Dict[str, str]]):
    try:
        recording_service.configure_room_privacy(payload or {})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "privacy": recording_service.privacy_matrix()}


@app.post("/api/recordings/session/archive")
def recording_archive(body: RecordingUpdateRequest, _: None = Depends(require_admin)):
    if not _recording_enabled():
        raise HTTPException(status_code=503, detail="Recording disabled")
    try:
        session = recording_service.archive_session(body.session_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"session": session.to_dict()}


# ---------- PubWorld Scenes ----------
@app.post("/api/pubworld/scenes", response_model=PubWorldSceneResponse)
def pw_create(body: PubWorldSceneCreate):
    scene = create_scene(
        DATA_DIR,
        name=body.name,
        description=body.description,
        grid=[c for c in body.grid],
        atmosphere=body.atmosphere.dict() if hasattr(body.atmosphere, "dict") else body.atmosphere,
        triggers=[t for t in body.triggers],
    )
    return {"scene": scene.dict()}


@app.get("/api/pubworld/scenes", response_model=PubWorldScenesResponse)
def pw_list():
    scenes = [s.dict() for s in list_scenes(DATA_DIR)]
    return {"scenes": scenes}


@app.get("/api/pubworld/scenes/{scene_id}", response_model=PubWorldSceneResponse)
def pw_get(scene_id: str):
    try:
        scene = get_scene(DATA_DIR, scene_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Not found")
    return {"scene": scene.dict()}


@app.put("/api/pubworld/scenes/{scene_id}", response_model=PubWorldSceneResponse)
def pw_update(scene_id: str, body: PubWorldSceneUpdate):
    payload: Dict[str, Any] = {k: v for k, v in body.dict().items() if v is not None}
    try:
        scene = update_scene(DATA_DIR, scene_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Not found")
    return {"scene": scene.dict()}


@app.delete("/api/pubworld/scenes/{scene_id}")
def pw_delete(scene_id: str):
    delete_scene(DATA_DIR, scene_id)
    return Response(status_code=204)


@app.get("/api/pubworld/scenes/{scene_id}/timeline", response_model=PubWorldTimelineResponse)
def pw_timeline_get(scene_id: str):
    timeline = get_timeline(DATA_DIR, scene_id)
    return {"timeline": timeline.dict()}


@app.put("/api/pubworld/scenes/{scene_id}/timeline", response_model=PubWorldTimelineResponse)
def pw_timeline_put(scene_id: str, body: PubWorldTimelineUpdate):
    timeline = update_timeline(DATA_DIR, scene_id, events=body.events or [])
    return {"timeline": timeline.dict()}


@app.get("/api/pubworld/assets")
def pw_assets():
    return {"placeholders": list_placeholder_assets()}


# Keep simple performance plan storage compatible with earlier minimal API
@app.get("/api/pubworld/scenes/{scene_id}/performance", response_model=PerformancePlanResponse)
def get_scene_perf(scene_id: str):
    plan = get_perf_plan(DATA_DIR, scene_id)
    return {"plan": plan.dict()}


@app.put("/api/pubworld/scenes/{scene_id}/performance", response_model=PerformancePlanResponse)
def put_scene_perf(scene_id: str, body: PerformancePlanUpdate):
    payload = {k: v for k, v in body.dict().items() if v is not None}
    plan = update_perf_plan(DATA_DIR, scene_id, payload)
    return {"plan": plan.dict()}


# ---------- Media artifact passthrough ----------
@app.get("/api/recordings/{session_id}/artifacts/{name}")
def get_artifact(session_id: str, name: str):
    f = DATA_DIR / "media" / "recordings" / session_id / name
    if not f.exists():
        raise HTTPException(404, "Artifact not found")
    return FileResponse(f)


# ---------- Safe download helper for recordings (path constraint) ----------
@app.get("/api/recordings/download")
def download_recording(path: str):
    base = (DATA_DIR / "media" / "recordings").resolve()
    try:
        if not path or ".." in path:
            raise ValueError("invalid path")
        rel = Path(path)
        if rel.is_absolute():
            raise ValueError("absolute not allowed")
        full = (base / rel).resolve()
        if not str(full).startswith(str(base)):
            raise ValueError("outside base")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(full)


# ---------- Video (Conference) Token (optional LiveKit) ----------
@app.post("/api/video/token")
def video_token(request: Request, body: Dict[str, Any] | None = None):
    """
    Returns a LiveKit access token if VIDEO_PROVIDER=livekit and keys are set.
    .env required: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
    Token is a JWT signed with HS256 containing room join grants.
    """
    provider = os.getenv("VIDEO_PROVIDER", "local").strip().lower()
    if provider != "livekit":
        raise HTTPException(status_code=503, detail="LiveKit disabled")
    room = None
    if isinstance(body, dict):
        room = body.get("room")
    room = (room or "conference").strip()
    identity = request.cookies.get("pubcast_uid") or f"guest-{uuid.uuid4().hex[:6]}"
    name = identity[:8]

    url = os.getenv("LIVEKIT_URL", "").strip()
    api_key = os.getenv("LIVEKIT_API_KEY", "").strip()
    api_secret = os.getenv("LIVEKIT_API_SECRET", "").strip()
    if not (url and api_key and api_secret):
        raise HTTPException(status_code=503, detail="LiveKit not configured")

    try:
        import jwt  # PyJWT
    except Exception:
        raise HTTPException(status_code=503, detail="PyJWT not installed on server")

    now = int(time.time())
    payload = {
        "iss": api_key,
        "sub": "video",
        "nbf": now - 10,
        "exp": now + 3600,
        "video": {
            "room": room,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
            "identity": identity,
            "name": name,
        },
    }
    token = jwt.encode(payload, api_secret, algorithm="HS256")
    return {"ok": True, "token": token, "url": url}


# ---------- Azure Speech TTS (optional) ----------
class TTSPayload(BaseModel):
    text: str
    voice: Optional[str] = None  # e.g., en-US-JennyNeural
    style: Optional[str] = None
    provider: Optional[str] = None  # optional override


@app.post("/api/tts")
def tts_endpoint(body: TTSPayload) -> Dict[str, Any]:
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    provider = (body.provider or os.getenv("TTS_PROVIDER", "browser")).strip().lower()
    if provider == "browser":
        raise HTTPException(status_code=503, detail="Client should use browser TTS")
    if provider == "piper":
        piper_bin = os.getenv("PIPER_BIN", "piper").strip()
        piper_model = os.getenv("PIPER_MODEL", "").strip()
        if not piper_model:
            raise HTTPException(status_code=503, detail="Piper not configured (PIPER_MODEL)")
        args = [piper_bin, "-m", piper_model]
        length_scale = os.getenv("PIPER_LENGTH_SCALE", "").strip()
        noise_scale = os.getenv("PIPER_NOISE_SCALE", "").strip()
        if length_scale:
            args += ["--length_scale", length_scale]
        if noise_scale:
            args += ["--noise_scale", noise_scale]
        # Output to a temp wav
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out_path = tmp.name
        args += ["-f", out_path]
        try:
            completed = subprocess.run(args, input=text.encode("utf-8"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            data = Path(out_path).read_bytes()
        except FileNotFoundError:
            raise HTTPException(status_code=503, detail="Piper binary not found")
        except subprocess.CalledProcessError as exc:
            raise HTTPException(status_code=500, detail=f"Piper failed: {exc.stderr.decode('utf-8', 'ignore')}") from exc
        finally:
            try:
                Path(out_path).unlink(missing_ok=True)
            except Exception:
                pass
        b64 = base64.b64encode(data).decode("ascii")
        return {"ok": True, "audio_b64": b64, "format": "wav", "voice": body.voice or "piper"}
    # Default to Azure
    key = os.getenv("AZURE_SPEECH_KEY", "").strip()
    region = os.getenv("AZURE_SPEECH_REGION", "").strip()
    if not key or not region:
        raise HTTPException(status_code=503, detail="Azure TTS not configured")
    try:
        import azure.cognitiveservices.speech as speechsdk  # type: ignore
    except Exception:
        raise HTTPException(status_code=503, detail="Azure Speech SDK not installed")

    voice = body.voice or os.getenv("AZURE_SPEECH_VOICE", "en-US-JennyNeural")
    speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
    speech_config.speech_synthesis_voice_name = voice
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
    result = synthesizer.speak_text_async(text).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        err = getattr(result, 'cancellation_details', None)
        detail = getattr(err, 'reason', 'synthesis_failed') if err else 'synthesis_failed'
        raise HTTPException(status_code=500, detail=f"Azure TTS failed: {detail}")
    audio_bytes = result.audio_data
    b64 = base64.b64encode(audio_bytes).decode("ascii")
    return {"ok": True, "audio_b64": b64, "format": "wav", "voice": voice}


# ---------- Bot speak (inject chat as bot) ----------
class BotSpeakPayload(BaseModel):
    room: str
    bot_id: str
    text: str


@app.post("/api/bots/say")
async def bot_say(body: BotSpeakPayload, _: None = Depends(require_admin)) -> Dict[str, Any]:
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    cfg = bot_manager.get_config(body.bot_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="bot not found")
    room = body.room.strip() or "conference"
    profile_name = cfg.name or cfg.bot_id
    record = {
        "t": time.time(),
        "room": room,
        "user_id": f"bot-{cfg.bot_id}",
        "user": profile_name,
        "avatar_color": "#40d9ff",
        "badge": "BOT",
        "text": text,
    }
    await append_jsonl_async(hub._log_path(room), record)  # type: ignore[attr-defined]
    await hub._broadcast(room, {"type": "chat", "payload": record})  # type: ignore[attr-defined]
    return {"ok": True}


# ---------- Bots (Co-hosts) ----------
@app.get("/api/bots")
def list_bots() -> Dict[str, Any]:
    items = []
    for cfg in bot_manager.list_configs():
        items.append(
            {
                "bot_id": cfg.bot_id,
                "display_name": cfg.name,
                "provider": cfg.provider.value if hasattr(cfg.provider, "value") else str(cfg.provider),
                "model": cfg.model,
                "rooms": cfg.enabled_rooms,
                "auto_reply": cfg.auto_reply,
                "mention_only": cfg.mention_only,
                "shadow_presence": cfg.shadow_presence,
            }
        )
    return {"bots": items}


@app.post("/api/bots")
def upsert_bot(request: Request, body: Dict[str, Any], _: None = Depends(require_admin)) -> Dict[str, Any]:
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Map incoming UI payload to BotConfig fields
    from modules.models import BotConfig, BotProvider

    uid = request.cookies.get("pubcast_uid") or "system"
    bot_id = (body.get("bot_id") or body.get("agent_id") or "").strip()
    display_name = (body.get("name") or body.get("display_name") or bot_id or "Bot").strip()
    provider_raw = (body.get("provider") or "").strip().lower()
    model = (body.get("model") or "").strip()
    key_env = (body.get("api_key_env") or body.get("key_env") or "").strip()
    system_prompt = body.get("system_prompt") or ""
    enabled_rooms = body.get("enabled_rooms") or body.get("rooms") or ["green"]

    options = body.get("options") or {}
    auto_reply = bool(body.get("auto_reply", options.get("auto_reply", True)))
    mention_only = bool(body.get("mention_only", options.get("respond_on_mention", False)))
    shadow_presence = bool(body.get("shadow_presence", options.get("shadow_in_roster", True)))

    if not bot_id:
        raise HTTPException(status_code=400, detail="bot_id/agent_id is required")
    if provider_raw not in {"openai", "gemini", "anthropic", "qwen"}:
        raise HTTPException(status_code=400, detail="provider must be openai|gemini|anthropic|qwen")
    if not model:
        raise HTTPException(status_code=400, detail="model is required")
    if not key_env:
        raise HTTPException(status_code=400, detail="api_key_env/key_env is required")

    try:
        provider = BotProvider(provider_raw)
    except Exception:
        provider = BotProvider.OPENAI

    cfg = BotConfig(
        bot_id=bot_id,
        name=display_name,
        provider=provider,
        model=model,
        owner_id=uid,
        api_key_env=key_env,
        system_prompt=system_prompt,
        enabled_rooms=enabled_rooms,
        auto_reply=auto_reply,
        mention_only=mention_only,
        shadow_presence=shadow_presence,
    )
    try:
        bot_manager.upsert_config(cfg)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid bot config: {exc}") from exc
    return {"ok": True, "bot": cfg.dict()}


@app.delete("/api/bots/{bot_id}")
def delete_bot(bot_id: str, _: None = Depends(require_admin)) -> Dict[str, Any]:
    if not bot_id:
        raise HTTPException(status_code=400, detail="bot_id required")
    bot_manager.delete_config(bot_id)
    return {"ok": True}


@app.post("/api/bots/reload")
def reload_bots(_: None = Depends(require_admin)) -> Dict[str, Any]:
    bot_manager.reload()
    return {"ok": True, "count": len(bot_manager.list_configs())}


# ---------- Presence state (optional health) ----------
@app.get("/api/presence/state")
async def presence_state() -> Dict[str, Any]:
    try:
        return await hub.presence_state()
    except Exception:
        # best-effort introspection fallback
        return {"rooms": []}





# Optional configuration validation (best effort)
try:
    from config import validate_config as _validate_config
    try:
        _validate_config()
    except Exception:
        pass
except Exception:
    pass


# Shepard management endpoints

class ShepardRecoveryRequest(BaseModel):
    policy: str

@app.get("/api/shepard/status", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
async def shepard_status(request: Request):
    svc = getattr(request.app.state, "shepard", None)
    if not svc:
        return {"ok": True, "status": {"enabled": False}}
    try:
        return {"ok": True, "status": svc.status()}
    except Exception:
        return {"ok": False}


@app.post("/api/shepard/config", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_CONFIG))])
async def shepard_config(request: Request, body: Dict[str, Any] = Body(default_factory=dict)):
    svc = getattr(request.app.state, "shepard", None)
    if not svc:
        raise HTTPException(status_code=503, detail="shepard_not_running")
    cfg = svc.update_config(
        enabled=bool(body.get("enabled")) if "enabled" in body else svc._config.enabled,  # noqa: SLF001
        quiet_seconds=int(body.get("quiet_seconds") or svc._config.quiet_seconds),  # noqa: SLF001
        min_gap_seconds=int(body.get("min_gap_seconds") or svc._config.min_gap_seconds),  # noqa: SLF001
        tick_seconds=int(body.get("tick_seconds") or svc._config.tick_seconds),  # noqa: SLF001
        strategy=str(body.get("strategy") or svc._config.strategy),  # noqa: SLF001
    )
    return {"ok": True, "config": cfg.__dict__}


@app.post("/api/shepard/recovery", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_CONFIG))])
async def shepard_recovery(request: Request, body: ShepardRecoveryRequest):
    svc = getattr(request.app.state, "shepard", None)
    if not svc:
        raise HTTPException(status_code=503, detail="shepard_not_running")
    try:
        policy = svc.update_recovery_policy(body.policy)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "recovery_policy": policy}


@app.post("/api/shepard/nudge", dependencies=[Depends(require_permission_or_admin(Permission.SYSTEM_MONITOR))])
async def shepard_nudge(request: Request, body: Dict[str, Any] = Body(default_factory=dict)):
    room = str(body.get("room") or "control").strip()
    line = body.get("message")
    svc = getattr(request.app.state, "shepard", None)
    if not svc:
        raise HTTPException(status_code=503, detail="shepard_not_running")
    await svc.nudge_now(room, line=str(line) if line else None)
    return {"ok": True}
