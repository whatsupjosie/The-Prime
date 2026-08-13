# Pubcast AI V9

Pubcast AI V9 is a FastAPI-based control surface for live, multi-room productions. It pairs a modular backend (avatars, choreography, tracking, recording) with a multi-agent orchestration layer so different AI co-hosts can collaborate on the same show. This repo contains everything needed to run the operator tools, builder UI, audio/video utilities, and the adapter stack that connects to commercial or self-hosted LLMs.

## Highlights

- **Multi-agent orchestration** - `ConversationOrchestrator` + `config/models.yaml` let you mix OpenAI, Gemini, Anthropic, Qwen, Ollama, or custom adapters, each with its own cadence/cooldown.
- **Production control UI** - Templates under `templates/` power `/control`, `/builder`, `/dressing`, `/map`, etc., with autosave and PubWorld placement editors.
- **Audio + video tooling** - `modules/audio_router.py` and `server/files.py` expose patching, muxing, editing, and autosave endpoints backed by ffmpeg plus job history.
- **FastAPI + WebSockets** - Real-time chat, presence, and tracking streams via `/ws/{room}` and `/ws/tracker/{track_id}`.
- **Security scaffolding** - RBAC, JWT/API keys, rate limiting, audit logs, and optional admin keys live under `modules/security/`.

## Quick start

```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements/base.txt
python smoke_test.py   # optional sanity check
uvicorn main:app --reload
```

Python already loads `sitecustomize.py` at the repo root, which boots `data/` onto `sys.path` so `import modules` works without an extra `PYTHONPATH` tweak.

Helpful routes:

- `GET /health` basic readiness
- `GET /api/avatars/presets` avatar catalog
- `GET /control`, `/builder`, `/dressing` UI surfaces
- `WS /ws/control` control-room chat/presence feed

## Configuration

Create a `.env` (or set env vars) before starting.

| Variable | Purpose |
| --- | --- |
| `PUBCAST_ALLOWED_ORIGINS` | Comma-separated list of allowed origins (defaults to `http://localhost:8000,http://127.0.0.1:8000`). |
| `PUBCAST_CORS_CREDENTIALS` | Set to `true` only if you need cookies with the origins above. |
| `PUBCAST_SERVE_DATA` | `true` to expose `/data` statics (default `false`; recommended off in prod). |
| `PUBCAST_SECRET_KEY`, `PUBCAST_ADMIN_KEY` | JWT signing + optional X-Admin-Key for control-plane calls. |
| `PUBCAST_ENABLE_INFERENCE_WORKER` | Spin up the multiprocessing inference worker (handlers live in `modules/inference/`). |
| `PUBCAST_ENABLE_AI_WORKERS` | Spawn the background AI worker pool used by `/api/ai/submit`. |
| `PUBCAST_INFERENCE_AGENT`, `PUBCAST_WHISPER_MODEL` | Choose the default agent config for background jobs and the Whisper model used when `STT_PROVIDER=whisper`. |
| `PUBCAST_OPENAI_KEY`, `PUBCAST_GEMINI_KEY`, `PUBCAST_ANTHROPIC_KEY`, etc. | Provider credentials referenced by `config/models.yaml`. |
| `PUBCAST_AUDIO_MAX_RETRIES`, `PUBCAST_AUDIO_BACKOFF`, `PUBCAST_AUDIO_AUTO_RETRY`, `PUBCAST_AUDIO_QUEUE` | Tune audio patch/mux job retries, backoff, and queueing behavior. |
| `TTS_PROVIDER`, `STT_PROVIDER`, `VIDEO_PROVIDER` | Select local vs. cloud providers for speech + video (browser/azure/piper, browser/whisper, local/livekit). |
| `PUBCAST_FFMPEG`, `PUBCAST_FFPROBE` | Override binary paths if ffmpeg/ffprobe are not on PATH. |

See `OPERATOR_GUIDE.md` for full environment coverage, deployment notes, and backup expectations. `HARDENING_CHECKLIST.md` documents the production checklist (TLS, CSP, rate limits, RBAC, auditing, backups). `DATA_STORE_MIGRATION.md` covers the move from JSON storage to relational/Redis.

## Directory guide

```
.
- main.py                  # FastAPI entry + routers/middleware
- modules/
  - agents/               # LLM adapters (openai, gemini, anthropic, ollama, qwen, lmcoder, ...)
  - audio_router.py       # Audio patch/mux/mix endpoints
  - avatar.py             # Avatar presets, load/save, visemes
  - choreography*, pubworld*, cameras*, tracking*, security*, ...
  - inference/            # Optional worker + job handlers
- server/files.py          # Project save/autosave API
- templates/, static/      # Frontend pages + assets
- data/                    # JSON state (avatars, pubworld, security, audit logs)
- scripts/                 # Adapter checks, dev helpers, tracking publisher
- tests/                   # Pytest suites + smoke helpers
- docs/                    # Operator guide, verification reports, release summaries
- requirements/            # base/dev/provider requirements
```

## Testing

- `python smoke_test.py` - exercises critical HTTP routes, WebSocket chat, bots, and toys TTS/video error codes.
- `pytest` - runs the full suite (auth flow, tracking, avatar visemes, audio clock, adapter streaming, AI worker pool, etc.).
- `tests/run_quick_tests.py` - convenience runner for CI-lite loops.

## Adapters & AI collaboration

Define agents in `config/models.yaml`. Example entry:

```yaml
- agent_id: alex
  display_name: Alex
  provider: openai
  model: gpt-4o-mini
  api_key_env: PUBCAST_OPENAI_KEY
  cooldown_ms: 4000
  system_prompt: "You are Alex, a witty and helpful co-host for PubCast streams."
```

`ConversationOrchestrator` (wired in `main.py`) uses these configs to route prompts, enforce cooldowns, and stream deltas from whichever adapters are registered with `AdapterFactory`. For physical collaboration, start multiple rooms (`/control`, `/pub`, `/map`) and connect the bots you need via `/api/bots`.

## Contributing / Next steps

- Finish wiring real inference handlers in `modules/inference/handlers.py` if you enable the worker pool.
- Hook `AudioPatchRequest.export_mux_video` into mux jobs so patched stems can be re-wrapped into video automatically.
- Replace placeholder PubWorld assets with real manifests in `data/pubworld/...`.
- Keep `README.md`, `.env.example`, and `docs/` updated whenever you add a new workflow or service.

Questions? See `docs/PR03_PR04_SUMMARY.md` for the latest milestone context, or `docs/VERIFICATION_REPORT.md` for test coverage snapshots.
