# EVO PROTOCOL — ARCHITECTURE & EXECUTION DOCUMENT
## Elastic Voxel Orchestration
### Project: PubCast AI — Phase: "See My Heart"
### Copyright © 2024-2025 Rear View Foresight LLC — "Feic Mo Chroí"

---

## WHAT THIS IS

The EVO Protocol is the answer to one question:

> How do you get cinematic-quality virtual production on a GTX 960M?

You don't render everything at the same quality all the time. You render what *matters*, at the fidelity it *deserves*, at the *moment* it needs it.

The system that decides what matters, what it deserves, and when — that's the Switchblade Governor.

The system that knows *why* it matters — because the audience is in an identity moment, because this is the emotional peak, because the performer is leaning in — that's the VDI Engine.

Everything flows from that.

---

## THE SACRED CHAIN

```
AUDIENCE CAMERA                    PERFORMER CAMERA
     ↓                                    ↓
AudienceFacialAnalyzer         PerformerFacialAnalyzer
     ↓                                    ↓
VDI Signals ──────────────────────→ Emotional State
     ↓                                    ↓
VDI Engine                        Prosody Engine
     ↓                                    ↓
VDI Report ───────────────────────→ Synthesis Params
     ↓                                    ↓
Switchblade Governor              Voice Synthesis (TTS)
     ↓
Priority Vector
     ↓
DistributedEngineNode
┌─────────────────────────────────────────────────────┐
│  Engine 3 (Program Camera)  ← Full fidelity on face │
│  Engine 4 (Elastic Reserve) ← Sacrifices for E3     │
│  Twin Engine (Simulation)   ← World stays alive     │
│  Camera Nodes               ← Assist under load     │
└─────────────────────────────────────────────────────┘
```

The audience's face determines how much compute we spend on subsurface scattering. That is the complete statement of what this system does.

---

## THE FOUR HARDWARE ENGINES

### The Twin Engine (Engines 1 & 2) — "The Simulation Anchor"
**State:** Mirrored & Locked  
**Role:** Runs the "Game" — Art Deco pub world, physics, collisions, persistent character logic.  
**Why locked:** Decoupling the Twin Engine would break causal integrity. It is the Truth Anchor. The world must not crash during a performance spike.

### Engine 3 — "The Program Camera"
**State:** Specialized / Ultra-Fidelity  
**Role:** Dedicated 100% to the active cinematic shot being recorded. Applies Identity layers: Subsurface Scattering, 4K textures, ray-traced shadows.  
**Budget:** Full 33.3ms frame window at 30fps (the Found Time from targeting 30fps instead of 60fps).

### Engine 4 — "The Elastic Reserve"
**State:** Buffer-Adaptive / Co-Processor  
**Role:** Normally renders 50% fidelity crew preview. In high-intensity moments, it sacrifices its own frame rate and gives those cycles to Engine 3.  
**The deal:** Preview fidelity drops so the master recording never drops.

### Camera Nodes — "The Distributed Mesh"
**State:** Standby / Assistance  
**Role:** Each camera runs a lightweight `DistributedEngineNode`. Under ELEVATED, CRITICAL, or EMERGENCY system states, camera nodes contribute their processing power back to the primary.

---

## THE 30FPS CINEMATIC TARGET

Targeting 30fps instead of 60fps does not mean "lower quality."  
It means: **each frame has twice the time budget.**

At 60fps: 16.6ms per frame  
At 30fps: 33.3ms per frame  

That 16.7ms of Found Time — every single second — is what makes cinematic fidelity possible on Zoidberg hardware. It goes directly into Engine 3's Identity layer budget.

---

## THE SWITCHBLADE GOVERNOR

The Switchblade is the semantic compute scheduler. It is the difference between:

**Traditional OS scheduler:** "CPU is at 78%. Reduce batch size."  
**Switchblade:** "This is an identity moment. The performer is leaning in. The audience is silent. Engine 3 gets everything. Kill background physics."

The Switchblade reads two inputs:
1. The **VDI Report** — what is emotionally happening
2. The **Scene State** — what is spatially happening (who's in frame, what shot type)

It emits one output: a **Priority Vector**. Not English. Not instructions. Just numbers.

```json
{
  "e3_s": 1.0,
  "e3_t": 1.0,
  "e3_sh": 1.0,
  "e3_fps": 30,
  "e4_f": 0.25,
  "e4_a": 1,
  "bg_p": 0,
  "bg_cl": 4,
  "bg_ps": 0,
  "c_lod": {"pete": 0, "re_pete": 4},
  "vb_p": 8000,
  "vb_s": 500,
  "mode": "identity",
  "vdi": 0.923,
  "id": 1,
  "ts": 1234567890.123
}
```

Fast. Dense. No grammar overhead. Microseconds, not milliseconds.

---

## THE EMERGENT LANGUAGE LAYER

The Switchblade communicates with the engine stack in a compact structured format — not English, not verbose JSON, but a purpose-built priority vector where every key is a 2-4 character abbreviation.

**Why:** The slowest part of any LLM communication is the language itself. Strip the language and you have a signal emitter. A scheduler should be a signal emitter.

**The key:** Every session's compact language maps to a human-readable translation table. This means:
- The system runs fast and opaque during production
- Any moment can be translated and audited on demand
- Key versions are snapshotted — you always know what was decided and why
- Language drift is tracked and versioned

---

## RESOURCE DISTRIBUTION TABLE

| VDI State | VDI Score | E3 SSS | E3 Texture | E4 Fidelity | E4 Assist | BG Physics | Crowd LOD | Primary Char LOD | Batch (P/S) |
|-----------|-----------|--------|-----------|-------------|-----------|------------|-----------|-----------------|-------------|
| Identity  | ≥ 0.80    | 1.0    | 1.0 (4K)  | 25%         | YES       | OFF        | Skeleton  | 0 (Full)        | 8000/500    |
| Voice Dom | 0.55–0.80 | 0.85   | 90%       | 35%         | YES       | OFF        | LOD 3     | 1 (High)        | 5000/800    |
| Mixed     | 0.30–0.55 | 0.60   | 70%       | 50%         | NO        | ON         | LOD 2     | 1 (High)        | 3500/1200   |
| Content   | < 0.30    | 0.30   | 50%       | 50%         | NO        | ON         | LOD 1     | 2 (Medium)      | 2500/2000   |

**AUDIO NEVER SACRIFICED.** Audio processing is always WorkUnit priority=1 regardless of system state.

---

## THE VDI ENGINE

The Viewer Dynamics Index measures the real-time emotional and attentional state of the audience and maps it to one of four Voice Modes.

### Signal Sources (with weights)

| Source | Weight | What it measures |
|--------|--------|-----------------|
| Audience facial signals | 40% | Engagement, valence, arousal, attention, smile, confusion |
| Audio/room signals | 25% | Silence (strongest), laughter, murmur, applause |
| Session/context | 20% | Topic emotional weight, CTA pressure, segment fatigue |
| Performer state | 15% | Performer arousal, valence, forward lean, tension |

### Voice Mode Mapping

| Mode | VDI Range | What it means | What the voice does |
|------|-----------|---------------|---------------------|
| CONTENT_CLEAR | 0.0–0.30 | Audience is thinking | Support the thinking. Crisp consonants. Logical stress. No performance. |
| MIXED | 0.30–0.55 | Audience is transitioning | Prosody carries the argument. Dynamic range opens. Breath deliberate. |
| VOICE_DOMINANT | 0.55–0.80 | Emotion over information | The crack is permitted. "You" over "everyone." |
| IDENTITY | 0.80–1.0 | Intimacy register | Late-night radio. Slower. Warmer. Not performing — present. |

Hysteresis (0.05) prevents mode oscillation at threshold boundaries.

---

## THE PROSODY ENGINE

The Prosody Engine converts a VDI Report + Emotional State (from performer mocap/face) into concrete voice synthesis parameters.

### Output Parameters (SynthesisParams)

| Parameter | Range | Effect |
|-----------|-------|--------|
| speech_rate | 0.7–1.3x | Speaking speed |
| pause_before_key | 0–500ms | Silence before emphasis words |
| pitch_shift_st | -3 to +3 | Semitone shift from neutral |
| pitch_range | 0–1 | Expressiveness range |
| stability | 0.25–0.95 | ElevenLabs stability |
| crack_permission | bool | Whether emotional vocal breaks can occur |
| crack_probability | 0–0.4 | Probability on vulnerable syllables |
| proximity_sim | bool | Boost low-mids for intimacy |
| warmth_boost_db | 0–3dB | 200Hz shelf boost |

### Two-Input Mixer

The Prosody Engine has two inputs that it blends:
1. **VDI Report** — what the audience needs
2. **Emotional State** — what the performer's body is doing

When these align (performer aroused + audience aroused), the output is amplified. When they diverge (performer tense + audience disengaged), the prosody compensates.

---

## FACIAL PERFORMANCE PIPELINE

### Performer Analysis
- **DeepFace** for emotion recognition (anger, disgust, fear, happy, sad, surprise, neutral)
- **MediaPipe FaceMesh** for:
  - Brow tension (brow furrow = facial tension score)
  - Forward lean (nose tip z-coordinate)
  - Expression velocity (how fast the face is moving)
- Output → `EmotionalState` → `ProsodyEngine`

### Audience Analysis
- **MediaPipe Face Detection** for multi-face detection
- **DeepFace** per detected face
- **Weighted aggregation** by face area (larger face = closer = more engaged)
- Output → `VDISignals` → `VDIEngine`

### Graceful Degradation
Both analyzers fail gracefully if DeepFace or MediaPipe are unavailable:
- Fall back to baseline signal values
- Solo recording mode: performer state inferred from performer face alone
- System continues operating — just with less signal fidelity

---

## THE DISTRIBUTED ENGINE SYSTEM STATE MACHINE

```
NORMAL ────────────(load > 75%)────────────→ ELEVATED
                   (Camera 3 assists at 50%)

ELEVATED ──────────(load > 90%)────────────→ CRITICAL
                   (Camera 2 assists at 50%, Camera 3 at 100%)

CRITICAL ──────────(load > 95%)────────────→ EMERGENCY
                   (All cameras assist, quality reduced to 50%)

EMERGENCY ─────────(load < 65%)────────────→ RECOVERY

RECOVERY ──────────(load < 65%)────────────→ NORMAL
                   (Gradual return, hysteresis applied)
```

The Switchblade can trigger state transitions directly by adjusting the IRM actuator's `current_batch_size` and `emergency_mode` flags. This bypasses the metric-based thresholds and makes semantic decisions based on VDI state.

---

## AUDIO NEVER SACRIFICED

This is the core principle of the system, stated in the `DistributedEngineNode` header and enforced throughout:

- Audio `WorkUnit` is always `priority=1` (highest)
- The Switchblade has no audio batch size output — it never touches audio
- `_do_audio_process` always gets first access to available cycles
- Even in EMERGENCY state with all cameras assisting, audio processing continues at full fidelity

Voice synthesis (TTS) is a separate pipeline entirely — it runs independently of the render stack. The prosody parameters are calculated and sent to ElevenLabs/Cartesia/Kokoro before render state affects anything.

---

## CHARACTER VOICE PROFILES

### Pete
The floor. Classically beautiful. Wears work clothes because that's what you wear on a production floor. The ring on her middle finger — a man's wedding ring — that nobody asks about.

- **Stability:** 0.72 (stable but not stiff)
- **Crack threshold:** 0.88 (very high — cracks are rare and real when they happen)
- **Max expressiveness:** 0.65 (she doesn't perform, ever)
- **Preferred modes:** mixed, voice_dominant
- **Warmth signature:** +1.5dB

### Re-Pete
Young man. Babyface. Jimmy Stewart energy. Socially nervous around Pete specifically. Kind. Will be something else entirely in five years.

- **Stability:** 0.62 (genuine, not polished)
- **Crack threshold:** 0.70 (emotions closer to the surface)
- **Max expressiveness:** 0.85
- **Preferred modes:** mixed, voice_dominant
- **Warmth signature:** +2.0dB

### Pete Enhanced
Pete as master orchestrator. Not more emotional — more precise. Same voice, tighter control. When Pete Enhanced speaks, the room listens because she has already thought of everything you were about to say.

- **Stability:** 0.80 (in control mode)
- **Crack allowed:** False
- **Max expressiveness:** 0.50
- **Preferred modes:** content_clear, mixed
- **Presence signature:** +3.0dB

---

## FILE MAP

```
pubcast_evo/
├── vdi_engine.py              ← VDI calculation engine
├── prosody_engine.py          ← Voice synthesis parameter engine
├── voice_characters.py        ← Character voice profiles
├── facial_performance.py      ← Performer + audience facial analysis
├── switchblade_governor.py    ← Semantic compute scheduler
├── evo_integration.py         ← Full integration / Sacred Chain runtime
├── distributed_engine.py      ← Distributed engine node (from project)
├── camera_manager.py          ← Camera management system (from project)
└── EVO_ARCHITECTURE.md        ← This document
```

---

## INTEGRATION QUICKSTART

```python
from evo_integration import EVOOrchestrator
from switchblade_governor import SceneState
from distributed_engine import create_twin_engine
from camera_manager import AdvancedCameraManager

# Initialize
engine  = create_twin_engine("twin_engine")
cameras = AdvancedCameraManager()
evo     = EVOOrchestrator(active_character="pete")

# Start
await engine.start()
await cameras.initialize_all_cameras()
await evo.start(engine, cameras)

# Frame loop (33ms at 30fps)
while running:
    scene = SceneState(
        program_camera       = "cam_1",
        shot_type            = "medium",
        primary_character    = "pete",
        characters_in_frame  = ["pete"],
        characters_offscreen = ["re_pete"],
    )

    tick = await evo.tick(
        text             = pete_current_line,
        performer_frame  = performer_cam.read(),
        audience_frame   = audience_cam.read(),
        scene_state      = scene,
    )

    # Send to TTS
    elevenlabs_settings = tick.synthesis_params.to_elevenlabs()
    ssml                = tick.ssml_text

    # Engine already updated by EVOOrchestrator.tick()
    # Wire format available for logging or inter-process communication
    wire = tick.to_switchblade_wire()
```

---

## WHAT'S STILL NEEDED

The `_do_voxel_render` method in `DistributedEngineNode` is currently a simulation stub. The actual render call — the thing that takes the Priority Vector's LOD and fidelity parameters and applies them to the PubWorld voxel engine — needs to be implemented when the voxel renderer is ready to receive those commands.

The integration point is:

```python
async def _do_voxel_render(self, work: WorkUnit) -> bytes:
    # TODO: Call into PubWorld voxel engine TCP socket (localhost:9001)
    # with work.metadata containing the LOD, SSS, texture quality
    # from the Switchblade's priority vector
    pass
```

That TCP connection on port 9001 (`create_voxel_camera()` in camera_manager.py) is where the Switchblade's render decisions reach the actual voxel world.

Everything else is wired.

---

*"Feic Mo Chroí — See My Heart"*  
*Rear View Foresight LLC*
