# PubCast AI — memory_routes.py
# Copyright © 2024–2026 Josie Curtsey Cobbley (Joshua Cobbley)
# Rear View Foresight LLC — All Rights Reserved
# Feic Mo Chroí — See My Heart
"""
memory_routes.py — FastAPI routes for character memory and Jeremy Cricket.

Two distinct systems wired here:

  CHARACTER MEMORY (CricketKeeper → JeremyCricket, per-character SQLite)
  -----------------------------------------------------------------------
  POST   /api/memory/remember
  GET    /api/memory/{character_id}/recall
  GET    /api/memory/{character_id}/all
  GET    /api/memory/{character_id}/health
  DELETE /api/memory/{character_id}/forget/{memory_id}

  JEREMY CRICKET — personal capacity (system speaking to individuals)
  -----------------------------------------------------------------------
  Jeremy is NOT a character. He has no character slot, no avatar, no db entry
  in CricketKeeper. He is background process infrastructure — the system's
  public-facing voice when it needs to reach a person directly.

  He reads from:
    - SystemMemory (protocols, rules, coaching history)
    - The individual's CricketKeeper slot (their personal memory, if any)

  He does NOT touch:
    - e-PETE's domain (rendering, errors, pipeline, frame rates)
    - Governance enforcement records (bans, consents, audit log)
    - Other characters' memory banks

  POST   /api/memory/jeremy/assist          — guest/AI asks Jeremy for help
  POST   /api/memory/jeremy/coaching/log    — log a coaching observation
  POST   /api/memory/jeremy/protocol        — store a system protocol
  POST   /api/memory/jeremy/insight         — store a synthesized insight

  JEREMY CRICKET — system capacity (Jeremy speaking to room/governance)
  -----------------------------------------------------------------------
  GET    /api/memory/jeremy/system/briefing
  GET    /api/memory/jeremy/system/protocols
  GET    /api/memory/jeremy/system/coaching/{subject_id}
  GET    /api/memory/jeremy/system/insights
  GET    /api/memory/jeremy/system/all-characters
  GET    /api/memory/jeremy/system/health

Wiring (main.py)
----------------
    from modules.memory_routes import router as memory_router
    from modules.memory_routes import set_cricket_keeper, set_system_memory
    set_cricket_keeper(cricket_keeper)
    set_system_memory(system_memory)
    application.include_router(memory_router)
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .jeremy_cricket import CricketKeeper, MemoryType
from .system_memory import SystemMemory, SystemEntryType

logger = logging.getLogger("pubcast.memory_routes")

router = APIRouter(prefix="/api/memory", tags=["memory"])


# ── Registry (set from main.py) ───────────────────────────────────────────────

_keeper: Optional[CricketKeeper] = None
_system_memory: Optional[SystemMemory] = None


def set_cricket_keeper(keeper: CricketKeeper) -> None:
    """Call once from main.py after CricketKeeper.init()."""
    global _keeper
    _keeper = keeper
    logger.info("memory_routes: CricketKeeper registered")


def set_system_memory(system_mem: SystemMemory) -> None:
    """Call once from main.py after SystemMemory.init()."""
    global _system_memory
    _system_memory = system_mem
    logger.info("memory_routes: SystemMemory registered")


def _require_keeper() -> CricketKeeper:
    if _keeper is None:
        raise HTTPException(503, "Character memory system not initialized")
    return _keeper


def _require_system_memory() -> SystemMemory:
    if _system_memory is None:
        raise HTTPException(503, "System memory not initialized")
    return _system_memory


# ── Request models ────────────────────────────────────────────────────────────

class RememberRequest(BaseModel):
    character_id: str
    content: str
    memory_type: str = Field("fact", description="fact|event|preference|relationship|emotion|instruction")
    importance: int = Field(5, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)
    source: str = "api"


class JeremyAssistRequest(BaseModel):
    session_id: str
    guest_id: str
    interaction_type: str = Field(
        "rule_question",
        description="rule_question | stuck | general"
    )
    query: str


class JeremyCoachingLogRequest(BaseModel):
    subject_id: str
    session_id: str
    topic: str
    content: str
    importance: int = Field(5, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)


class JeremyProtocolRequest(BaseModel):
    topic: str
    content: str
    importance: int = Field(8, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)


class JeremyInsightRequest(BaseModel):
    topic: str
    content: str
    importance: int = Field(7, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)
    session_id: Optional[str] = None


class JeremyEnrichRequest(BaseModel):
    character_id: str
    prompt: str
    history: List[dict] = Field(default_factory=list)
    max_memories: int = Field(6, ge=1, le=20)
    min_importance: int = Field(3, ge=1, le=10)


# ── Character memory routes ───────────────────────────────────────────────────

@router.post("/remember")
async def remember(req: RememberRequest):
    """Store a memory for a character. Persistent SQLite via CricketKeeper."""
    keeper = _require_keeper()
    try:
        mem_type = MemoryType(req.memory_type)
    except ValueError:
        raise HTTPException(400, f"Unknown memory_type '{req.memory_type}'. "
                            f"Valid: {[t.value for t in MemoryType]}")
    cricket = await keeper.get(req.character_id)
    mem_id = await cricket.remember(
        content=req.content,
        memory_type=mem_type,
        importance=req.importance,
        tags=req.tags,
        source=req.source,
    )
    return {"memory_id": mem_id, "character_id": req.character_id, "status": "stored"}


@router.get("/{character_id}/recall")
async def recall_memories(
    character_id: str,
    query: str = Query(..., description="Search query"),
    max_results: int = Query(10, ge=1, le=50),
    min_importance: int = Query(1, ge=1, le=10),
):
    """Search a character's memory bank. Scored by keyword + recency + importance."""
    keeper = _require_keeper()
    cricket = await keeper.get(character_id)
    memories = await cricket.recall(query, max_results=max_results, min_importance=min_importance)
    return {
        "character_id": character_id,
        "query": query,
        "count": len(memories),
        "memories": [
            {
                "id": m.id,
                "content": m.content,
                "memory_type": m.memory_type.value,
                "importance": m.importance,
                "tags": m.tags,
                "source": m.source,
                "created_at": m.created_at,
                "accessed_at": m.accessed_at,
                "access_count": m.access_count,
            }
            for m in memories
        ],
    }


@router.get("/{character_id}/all")
async def get_all_memories(
    character_id: str,
    min_importance: int = Query(1, ge=1, le=10),
):
    """List all memories for a character, sorted by importance. Host/debug use."""
    keeper = _require_keeper()
    cricket = await keeper.get(character_id)
    memories = await cricket.get_all(min_importance=min_importance)
    return {
        "character_id": character_id,
        "count": len(memories),
        "memories": [
            {
                "id": m.id,
                "content": m.content,
                "memory_type": m.memory_type.value,
                "importance": m.importance,
                "tags": m.tags,
                "source": m.source,
                "created_at": m.created_at,
            }
            for m in memories
        ],
    }


@router.get("/{character_id}/health")
async def character_memory_health(character_id: str):
    """Health snapshot for a character's memory DB."""
    keeper = _require_keeper()
    cricket = await keeper.get(character_id)
    return await cricket.health()


@router.delete("/{character_id}/forget/{memory_id}")
async def forget_memory(character_id: str, memory_id: int):
    """Delete a specific memory. Permanent."""
    keeper = _require_keeper()
    cricket = await keeper.get(character_id)
    await cricket.forget(memory_id)
    return {"character_id": character_id, "memory_id": memory_id, "status": "forgotten"}


@router.post("/enrich")
async def enrich_context(req: JeremyEnrichRequest):
    """
    Enrich conversation context before it goes to the LLM.
    Call this instead of passing raw history to adapter.stream_reply().
    Returns enriched history with a whispered memory block prepended.
    """
    keeper = _require_keeper()
    cricket = await keeper.get(req.character_id)
    enriched = await cricket.enrich_context(
        prompt=req.prompt,
        history=req.history,
        max_memories=req.max_memories,
        min_importance=req.min_importance,
    )
    return {
        "character_id": req.character_id,
        "enriched_history": enriched,
        "memory_count": max(0, len(enriched) - len(req.history)),
    }


# ── Jeremy personal capacity ──────────────────────────────────────────────────
# Jeremy is the system's public-facing voice. He is not a character.
# He reads from SystemMemory (protocols, coaching history) + the individual's
# CricketKeeper slot (their personal memory, if any).

@router.post("/jeremy/assist")
async def jeremy_personal_assist(req: JeremyAssistRequest):
    """
    Jeremy's personal capacity — the system reaching out to an individual.

    When a guest is confused, an AI needs guidance, or someone needs to
    understand a rule: this is how the system speaks to them directly.

    Returns:
      protocol_context  — relevant rules/protocols from SystemMemory
      personal_context  — this individual's memory from their CricketKeeper slot
                          (empty if they have no history yet)

    The caller assembles the response from both. Jeremy knows the rules;
    personal_context tells you what this individual needs to hear right now.
    """
    sys_mem = _require_system_memory()
    keeper = _require_keeper()

    # Rules and protocols from system memory
    protocol_context = await sys_mem.get_protocols(query=req.query, max_results=5)

    # This individual's personal history (if any)
    personal_context = []
    try:
        cricket = await keeper.get(req.guest_id)
        personal_memories = await cricket.recall(req.query, max_results=5, min_importance=1)
        personal_context = [
            {
                "content": m.content,
                "memory_type": m.memory_type.value,
                "importance": m.importance,
            }
            for m in personal_memories
        ]
    except Exception:
        pass  # No history for this individual yet — that's fine

    # Log this interaction to system coaching memory
    await sys_mem.log_coaching(
        subject_id=req.guest_id,
        session_id=req.session_id,
        topic=req.interaction_type,
        content=f"Jeremy assist ({req.interaction_type}): {req.query[:200]}",
        importance=3,
        tags=[req.guest_id, req.interaction_type, req.session_id],
    )

    return {
        "session_id": req.session_id,
        "guest_id": req.guest_id,
        "interaction_type": req.interaction_type,
        "query": req.query,
        "protocol_context": [
            {
                "id": e.id,
                "topic": e.topic,
                "content": e.content,
                "importance": e.importance,
                "tags": e.tags,
            }
            for e in protocol_context
        ],
        "personal_context": personal_context,
    }


@router.post("/jeremy/coaching/log")
async def jeremy_log_coaching(req: JeremyCoachingLogRequest):
    """
    Log a coaching observation Jeremy made about an individual.
    Used during proving ground sessions, rule clarifications, onboarding.
    Persists across sessions so Jeremy remembers what he observed.
    """
    sys_mem = _require_system_memory()
    entry_id = await sys_mem.log_coaching(
        subject_id=req.subject_id,
        session_id=req.session_id,
        topic=req.topic,
        content=req.content,
        importance=req.importance,
        tags=req.tags,
    )
    return {"entry_id": entry_id, "subject_id": req.subject_id, "status": "logged"}


@router.post("/jeremy/protocol")
async def jeremy_store_protocol(req: JeremyProtocolRequest):
    """
    Store or update a system protocol/rule.
    These are what Jeremy reads when a guest asks a rule question.
    """
    sys_mem = _require_system_memory()
    entry_id = await sys_mem.store_protocol(
        topic=req.topic,
        content=req.content,
        importance=req.importance,
        tags=req.tags,
    )
    return {"entry_id": entry_id, "topic": req.topic, "status": "stored"}


@router.post("/jeremy/insight")
async def jeremy_store_insight(req: JeremyInsightRequest):
    """
    Store a system-level insight Jeremy synthesized across sessions.
    These feed Room Conductor briefings and governance pattern reports.
    """
    sys_mem = _require_system_memory()
    entry_id = await sys_mem.store_insight(
        topic=req.topic,
        content=req.content,
        importance=req.importance,
        tags=req.tags,
        session_id=req.session_id,
    )
    return {"entry_id": entry_id, "topic": req.topic, "status": "stored"}


# ── Jeremy system capacity ────────────────────────────────────────────────────
# Jeremy synthesizing for the room, host, and governance.

@router.get("/jeremy/system/briefing")
async def jeremy_system_briefing(
    session_id: str = Query(..., description="Active session ID"),
    characters: Optional[str] = Query(None, description="Comma-separated character IDs"),
):
    """
    Jeremy briefs the Room Conductor before a session.

    Returns:
      protocols       — active system rules
      insights        — patterns Jeremy has synthesized across sessions
      character_snap  — memory health snapshot per character
    """
    sys_mem = _require_system_memory()
    keeper = _require_keeper()

    protocols = await sys_mem.get_protocols(max_results=10)
    insights = await sys_mem.get_insights(max_results=10)

    character_list = (
        [c.strip() for c in characters.split(",")]
        if characters
        else keeper.loaded_characters()
    )

    character_snapshots = []
    for char_id in character_list:
        try:
            cricket = await keeper.get(char_id)
            health = await cricket.health()
            top = await cricket.get_all(min_importance=6)
            character_snapshots.append({
                "character_id": char_id,
                "total_memories": health["total_memories"],
                "avg_importance": health["avg_importance"],
                "top_memories": [
                    {"content": m.content, "memory_type": m.memory_type.value, "importance": m.importance}
                    for m in top[:5]
                ],
            })
        except Exception:
            character_snapshots.append({"character_id": char_id, "error": "unavailable"})

    return {
        "session_id": session_id,
        "protocols": [
            {"id": e.id, "topic": e.topic, "content": e.content, "importance": e.importance}
            for e in protocols
        ],
        "insights": [
            {"id": e.id, "topic": e.topic, "content": e.content, "importance": e.importance}
            for e in insights
        ],
        "character_snapshots": character_snapshots,
    }


@router.get("/jeremy/system/protocols")
async def jeremy_get_protocols(
    query: str = Query("", description="Optional search query"),
    topic: Optional[str] = Query(None, description="Filter by topic"),
    max_results: int = Query(20, ge=1, le=100),
):
    """Retrieve system protocols. Jeremy reads these for rule questions."""
    sys_mem = _require_system_memory()
    protocols = await sys_mem.get_protocols(query=query, topic=topic, max_results=max_results)
    return {
        "count": len(protocols),
        "protocols": [
            {"id": e.id, "topic": e.topic, "content": e.content,
             "importance": e.importance, "tags": e.tags}
            for e in protocols
        ],
    }


@router.get("/jeremy/system/coaching/{subject_id}")
async def jeremy_get_coaching_history(
    subject_id: str,
    query: str = Query("", description="Optional search query"),
    max_results: int = Query(20, ge=1, le=100),
):
    """
    Retrieve coaching history for a specific individual.
    Use for governance decisions, returning AI/guest onboarding, host briefings.
    """
    sys_mem = _require_system_memory()
    history = await sys_mem.get_coaching_history(
        subject_id=subject_id, query=query, max_results=max_results
    )
    return {
        "subject_id": subject_id,
        "count": len(history),
        "coaching_history": [
            {"id": e.id, "topic": e.topic, "content": e.content,
             "importance": e.importance, "session_id": e.session_id,
             "created_at": e.created_at}
            for e in history
        ],
    }


@router.get("/jeremy/system/insights")
async def jeremy_get_insights(
    topic: Optional[str] = Query(None, description="Filter by topic"),
    query: str = Query("", description="Optional search query"),
    max_results: int = Query(20, ge=1, le=100),
):
    """System-level insights Jeremy synthesized across sessions."""
    sys_mem = _require_system_memory()
    insights = await sys_mem.get_insights(topic=topic, query=query, max_results=max_results)
    return {
        "count": len(insights),
        "insights": [
            {"id": e.id, "topic": e.topic, "content": e.content,
             "importance": e.importance, "tags": e.tags, "session_id": e.session_id}
            for e in insights
        ],
    }


@router.get("/jeremy/system/all-characters")
async def jeremy_all_characters_health():
    """Health snapshot across all loaded character memory banks."""
    keeper = _require_keeper()
    health_all = await keeper.health_all()
    return {
        "loaded_characters": keeper.loaded_characters(),
        "character_count": len(health_all),
        "health": health_all,
    }


@router.get("/jeremy/system/health")
async def jeremy_system_health():
    """Health snapshot of Jeremy's system memory store."""
    sys_mem = _require_system_memory()
    return await sys_mem.health()
