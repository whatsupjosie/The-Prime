# PubCast AI — orchestrator.py
# Copyright © 2024–2026 Josie Curtsey Cobbley (Joshua Cobbley)
# Rearview Foresight LLC — All Rights Reserved
# Feic Mo Chroí — See My Heart
"""
modules/orchestrator.py
-----------------------
Conversation orchestrator for PubCast AI.
Re-exports ConversationOrchestrator from the implementation file.
"""
from __future__ import annotations
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
from .schemas import ParticipantRole, SayEvent, DoneEvent, ErrorEvent

logger = logging.getLogger("pubcast.orchestrator")


class ConversationOrchestrator:
    """
    Coordinates multi-participant conversations in a room.
    Routes human messages to AI bots and handles turn-taking.

    Memory note:
    The full agent-streaming implementation lives in orchestrator_raw.py, but
    main.py imports this compatibility orchestrator. To keep the memory-live
    build truthful, this class accepts CricketKeeper and exposes the same
    enrichment hook used by the raw orchestrator. This does not create a new
    memory system; it only wires the existing CricketKeeper into the active
    orchestrator wrapper.
    """

    def __init__(self):
        self._rooms: Dict[str, List[Dict[str, Any]]] = {}
        self._running = False
        self._cricket_keeper: Optional[object] = None

    def set_cricket_keeper(self, keeper: object) -> None:
        """Wire the existing CricketKeeper for memory enrichment support."""
        self._cricket_keeper = keeper
        logger.info("Orchestrator: CricketKeeper wired — memory enrichment active")

    def memory_enrichment_active(self) -> bool:
        """Return whether this orchestrator has a CricketKeeper attached."""
        return self._cricket_keeper is not None

    async def enrich_context_for_character(
        self,
        character_id: str,
        prompt: str,
        history: List[Dict[str, Any]],
        *,
        max_memories: int = 6,
        min_importance: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Enrich history through the existing CricketKeeper.

        This is a safe adapter for callers using modules.orchestrator instead
        of modules.orchestrator_raw. If CricketKeeper is unavailable or fails,
        it returns the raw history instead of crashing the app.
        """
        if self._cricket_keeper is None:
            return list(history)
        try:
            cricket = await self._cricket_keeper.get(character_id)
            return await cricket.enrich_context(
                prompt=prompt,
                history=list(history),
                max_memories=max_memories,
                min_importance=min_importance,
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Memory enrichment skipped for %s: %s", character_id, exc)
            return list(history)

    async def start_room(self, room_id: str) -> None:
        self._rooms.setdefault(room_id, [])
        logger.info("Orchestrator: room %s started", room_id)

    async def stop_room(self, room_id: str) -> None:
        self._rooms.pop(room_id, None)

    async def handle_message(self, room_id: str, participant_id: str,
                              text: str, role: ParticipantRole = ParticipantRole.HUMAN) -> None:
        messages = self._rooms.setdefault(room_id, [])
        messages.append({
            "participant_id": participant_id,
            "text": text,
            "role": role.value,
            "timestamp": time.time(),
        })
        if len(messages) > 200:
            self._rooms[room_id] = messages[-200:]

    def list_active_rooms(self) -> List[str]:
        return list(self._rooms.keys())

    def get_history(self, room_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        messages = self._rooms.get(room_id, [])
        return messages[-limit:]


__all__ = ["ConversationOrchestrator"]
