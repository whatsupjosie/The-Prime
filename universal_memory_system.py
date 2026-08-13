"""
universal_memory_system.py — Shared character memory for PubCast AI
════════════════════════════════════════════════════════════════════════════════
Rear View Foresight LLC · Feic Mo Chroí™

Provides the per-character memory banks that RoomConductor (Jeremy Cricket)
uses to remember what each character knows, feels, and has experienced.

Interface contract (consumed by room_conductor.py):
    - UniversalMemorySystem._banks       : Dict[str, CharacterMemoryBank]
    - UniversalMemorySystem._profiles    : Dict[str, CharacterProfile]
    - UniversalMemorySystem.get_or_create_bank(char_id) -> CharacterMemoryBank
    - CharacterMemoryBank.add(entry: MemoryEntry)
    - CharacterMemoryBank.search(query: str, limit: int) -> List[MemoryEntry]
    - MemoryEntry.content       : str
    - MemoryEntry.memory_type   : MemoryType
    - MemoryEntry.importance    : float
    - MemoryEntry.tags          : List[str]
    - MemoryEntry.source        : str
    - MemoryType.EPISODIC, .EMOTIONAL, .FACT, .RELATIONSHIP, .PREFERENCE
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger("pubcast.universal_memory")


# ────────────────────────────────────────────────────────────────────────────
# MemoryType — superset of values used across room_conductor & jeremy_cricket
# ────────────────────────────────────────────────────────────────────────────

class MemoryType(str, Enum):
    FACT         = "fact"
    EVENT        = "event"
    EPISODIC     = "episodic"
    PREFERENCE   = "preference"
    RELATIONSHIP = "relationship"
    EMOTION      = "emotion"
    EMOTIONAL    = "emotional"
    INSTRUCTION  = "instruction"


# ────────────────────────────────────────────────────────────────────────────
# MemoryEntry — lightweight data object for a single memory
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class MemoryEntry:
    content: str
    memory_type: MemoryType = MemoryType.FACT
    importance: float = 0.5
    tags: List[str] = field(default_factory=list)
    source: str = "system"
    created_at: float = field(default_factory=time.time)
    accessed_at: float = field(default_factory=time.time)
    access_count: int = 0

    def touch(self) -> None:
        """Mark this memory as recently accessed."""
        self.accessed_at = time.time()
        self.access_count += 1


# ────────────────────────────────────────────────────────────────────────────
# CharacterProfile — minimal profile stub for memory-system registration
#
# The full CharacterProfile lives in character_profiles.py; this is a
# compatible subset so room_conductor can reference it without pulling
# the entire character_profiles module.
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class CharacterProfile:
    character_id: str
    display_name: str = ""
    role: str = ""
    voice_notes: str = ""
    system_prompt: str = ""


# ────────────────────────────────────────────────────────────────────────────
# CharacterMemoryBank — per-character memory store
# ────────────────────────────────────────────────────────────────────────────

class CharacterMemoryBank:
    """In-memory bank of MemoryEntry objects for a single character."""

    __slots__ = ("character_id", "_entries", "_max_entries")

    def __init__(self, character_id: str, max_entries: int = 500) -> None:
        self.character_id = character_id
        self._entries: List[MemoryEntry] = []
        self._max_entries = max_entries

    # ── write ──────────────────────────────────────────────────────────────

    def add(self, entry: MemoryEntry) -> None:
        """Store a memory entry, evicting the least-important if at capacity."""
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            # Evict lowest importance, oldest first
            self._entries.sort(
                key=lambda e: (e.importance, e.accessed_at), reverse=True
            )
            self._entries = self._entries[: self._max_entries]

    # ── read ───────────────────────────────────────────────────────────────

    def search(self, query: str, limit: int = 5) -> List[MemoryEntry]:
        """Return the most relevant memories matching *query*.

        Relevance scoring:
          - keyword overlap between query tokens and entry content/tags
          - importance weight
          - recency boost
        """
        if not query or not self._entries:
            return []

        tokens = query.lower().split()
        now = time.time()
        scored: List[tuple] = []

        for entry in self._entries:
            text = (entry.content + " " + " ".join(entry.tags)).lower()
            overlap = sum(1 for t in tokens if t in text)
            if overlap == 0:
                continue

            age_days = max(0.001, (now - entry.accessed_at) / 86400)
            recency = max(0.05, 1.0 - (age_days / 90) ** 0.5)
            score = overlap * entry.importance * recency
            scored.append((score, entry))

        scored.sort(key=lambda pair: pair[0], reverse=True)

        results = []
        for _score, entry in scored[:limit]:
            entry.touch()
            results.append(entry)
        return results

    def recent(self, limit: int = 10) -> List[MemoryEntry]:
        """Return the *limit* most recently created entries."""
        by_time = sorted(self._entries, key=lambda e: e.created_at, reverse=True)
        return by_time[:limit]

    def all(self) -> List[MemoryEntry]:
        """Return all stored entries (read-only snapshot)."""
        return list(self._entries)

    def __len__(self) -> int:
        return len(self._entries)


# ────────────────────────────────────────────────────────────────────────────
# UniversalMemorySystem — container that manages all character banks
# ────────────────────────────────────────────────────────────────────────────

class UniversalMemorySystem:
    """Registry of per-character memory banks.

    Public attributes consumed by room_conductor:
        _banks    : Dict[str, CharacterMemoryBank]
        _profiles : Dict[str, CharacterProfile]
    """

    def __init__(self, max_entries_per_bank: int = 500) -> None:
        self._banks: Dict[str, CharacterMemoryBank] = {}
        self._profiles: Dict[str, CharacterProfile] = {}
        self._max_entries = max_entries_per_bank
        logger.info("UniversalMemorySystem initialised")

    # ── registration ───────────────────────────────────────────────────────

    def register(
        self,
        character_id: str,
        profile: Optional[CharacterProfile] = None,
    ) -> CharacterMemoryBank:
        """Register a character and return its bank (creates if needed)."""
        if character_id not in self._banks:
            self._banks[character_id] = CharacterMemoryBank(
                character_id, self._max_entries
            )
            logger.info("Registered memory bank for %s", character_id)
        if profile is not None:
            self._profiles[character_id] = profile
        return self._banks[character_id]

    def get_or_create_bank(self, character_id: str) -> CharacterMemoryBank:
        """Return existing bank or create a new one."""
        if character_id not in self._banks:
            return self.register(character_id)
        return self._banks[character_id]

    # ── queries ────────────────────────────────────────────────────────────

    def get_bank(self, character_id: str) -> Optional[CharacterMemoryBank]:
        """Return bank if it exists, else None."""
        return self._banks.get(character_id)

    def get_profile(self, character_id: str) -> Optional[CharacterProfile]:
        return self._profiles.get(character_id)

    def character_ids(self) -> List[str]:
        return list(self._banks.keys())

    # ── bulk ops ───────────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Diagnostic snapshot for the doctor/status endpoint."""
        return {
            "characters": len(self._banks),
            "banks": {
                cid: {
                    "entries": len(bank),
                    "profile_registered": cid in self._profiles,
                }
                for cid, bank in self._banks.items()
            },
        }

    def clear(self, character_id: Optional[str] = None) -> None:
        """Clear memories. If character_id given, only that bank; else all."""
        if character_id:
            if character_id in self._banks:
                self._banks[character_id] = CharacterMemoryBank(
                    character_id, self._max_entries
                )
                logger.info("Cleared memory bank for %s", character_id)
        else:
            for cid in list(self._banks):
                self._banks[cid] = CharacterMemoryBank(cid, self._max_entries)
            logger.info("Cleared all memory banks")
