# PubCast AI — governance_waiting_room.py
# Copyright © 2024–2026 Josie Curtsey Cobbley (Joshua Cobbley)
# Rear View Foresight LLC — All Rights Reserved
# Feic Mo Chroí — See My Heart
"""
governance_waiting_room.py — Waiting Room / Airlock System

The waiting room is a liminal space. It is NOT a room in the room graph.
Users land here automatically on session join (except the host).
They cannot navigate to it or from it.

Features
--------
  GAP 1 — Door state: opens for exactly one person, closes immediately.
           Concurrent approvals are serialized. No double-entry.

  GAP 2 — Boot from studio: security/host can redirect a user back here
           with a timeout. Re-entry locked until timeout expires.

  GAP 3 — Session join routing: WaitingRoomManager.should_intercept()
           lets the WebSocket join handler decide: waiting room or direct.

  GAP 4 — Protocol seed: seed_default_protocols() populates SystemMemory
           on first boot so Jeremy can answer rule questions immediately.

  GAP 5 — Chat isolation: waiting room has its own chat log, isolated from
           studio. Guests see only waiting room messages. Host/security see both.

Routes (prefix: /api/governance/waiting-room)
---------------------------------------------
  POST   /request                   — guest requests entry
  GET    /status/{entry_id}         — poll status
  POST   /{entry_id}/approve        — host approves (door opens for one)
  POST   /{entry_id}/deny           — host denies
  GET    /pending                   — host dashboard: who's waiting
  POST   /boot                      — security boots user back from studio
  GET    /booted                    — list currently booted users
  POST   /chat                      — post to waiting room chat
  GET    /chat                      — get waiting room chat feed
  GET    /chat/host                 — host view: waiting room + flagged studio msgs
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("pubcast.governance.waiting_room")


# ── Status enums ──────────────────────────────────────────────────────────────

class EntryStatus(str, Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    DENIED   = "denied"
    EXPIRED  = "expired"
    BOOTED   = "booted"   # returned from studio with timeout


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class WaitingRoomEntry:
    entry_id:     str
    user_id:      str
    display_name: str
    target_room:  str
    consents:     Dict[str, bool]
    status:       EntryStatus = EntryStatus.PENDING
    requested_at: float = field(default_factory=time.time)
    approved_at:  Optional[float] = None
    approved_by:  Optional[str]  = None
    deny_reason:  Optional[str]  = None
    # Boot fields
    booted_at:       Optional[float] = None
    boot_reason:     Optional[str]   = None
    boot_timeout_until: Optional[float] = None  # unix ts: when they can re-enter
    booted_by:       Optional[str]   = None


@dataclass
class WaitingRoomChatMessage:
    message_id:   str
    user_id:      str
    display_name: str
    text:         str
    created_at:   float = field(default_factory=time.time)
    scope:        str   = "waiting_room"   # "waiting_room" | "studio_flagged"
    read_only_for_guests: bool = True


# ── Pydantic request models ───────────────────────────────────────────────────

class EntryRequest(BaseModel):
    user_id:      str
    display_name: str
    target_room:  str
    consents:     Dict[str, bool]


class BootRequest(BaseModel):
    user_id:         str
    display_name:    str
    booted_by:       str = "security"
    reason:          str = ""
    timeout_seconds: int = 300   # 5 min default


class ChatPostRequest(BaseModel):
    user_id:      str
    display_name: str
    text:         str


# ── WaitingRoomManager ────────────────────────────────────────────────────────

class WaitingRoomManager:
    """
    Central state for the waiting room liminal space.

    Thread-safe via asyncio.Lock for the door (Gap 1).
    In-memory — resets on server restart by design (sessions are ephemeral).
    """

    def __init__(
        self,
        auto_approve: bool = False,
        auto_approve_delay: float = 2.0,
        host_user_ids: Optional[List[str]] = None,
    ) -> None:
        self._entries:  Dict[str, WaitingRoomEntry] = {}
        self._by_user:  Dict[str, str] = {}          # user_id → entry_id
        self._chat:     List[WaitingRoomChatMessage] = []
        self._auto_approve       = auto_approve
        self._auto_approve_delay = auto_approve_delay
        self._host_ids:  set = set(host_user_ids or [])
        # GAP 1: door lock — only one approval can proceed at a time
        self._door_lock = asyncio.Lock()
        logger.info("Waiting room initialized (auto_approve=%s)", auto_approve)

    # ── GAP 3: session join routing ───────────────────────────────────────────

    def should_intercept(self, user_id: str, role: str = "guest") -> bool:
        """
        Call from websocket_room join handler.
        Returns True if this user should be redirected to the waiting room.

        Rules:
          - Hosts are never intercepted.
          - Users with an active APPROVED entry pass through.
          - Everyone else is intercepted.
        """
        if role == "host" or user_id in self._host_ids:
            return False
        entry_id = self._by_user.get(user_id)
        if entry_id:
            entry = self._entries.get(entry_id)
            if entry and entry.status == EntryStatus.APPROVED:
                # Check boot timeout not active
                if entry.boot_timeout_until and entry.boot_timeout_until > time.time():
                    return True   # still in timeout
                return False      # approved and not in timeout — let through
        return True               # no entry or not approved — intercept

    def register_host(self, user_id: str) -> None:
        """Mark a user as host so they bypass the waiting room."""
        self._host_ids.add(user_id)

    # ── Entry request ─────────────────────────────────────────────────────────

    def request_entry(
        self,
        user_id: str,
        display_name: str,
        target_room: str,
        consents: Dict[str, bool],
    ) -> str:
        """Submit entry request. Returns entry_id for polling."""
        # Reuse existing entry if pending
        existing_id = self._by_user.get(user_id)
        if existing_id and existing_id in self._entries:
            existing = self._entries[existing_id]
            if existing.status == EntryStatus.PENDING:
                return existing_id

        entry_id = f"entry_{uuid.uuid4().hex[:12]}"
        entry = WaitingRoomEntry(
            entry_id=entry_id,
            user_id=user_id,
            display_name=display_name,
            target_room=target_room,
            consents=consents,
        )
        self._entries[entry_id] = entry
        self._by_user[user_id] = entry_id
        logger.info("Entry request: %s → %s [%s]", display_name, target_room, entry_id)

        if self._auto_approve:
            asyncio.create_task(self._auto_approve_entry(entry_id))

        return entry_id

    async def _auto_approve_entry(self, entry_id: str) -> None:
        await asyncio.sleep(self._auto_approve_delay)
        if entry_id in self._entries and self._entries[entry_id].status == EntryStatus.PENDING:
            await self.approve_entry(entry_id, "system_auto")
            logger.info("Auto-approved entry %s", entry_id)

    # ── GAP 1: door state — open for one, close immediately ──────────────────

    async def approve_entry(self, entry_id: str, approved_by: str = "host") -> None:
        """
        Approve an entry request.

        The door lock ensures only one person passes through at a time.
        The lock is held for the minimum possible time — just long enough
        to flip the state. The door effectively opens and closes atomically.
        """
        async with self._door_lock:
            if entry_id not in self._entries:
                raise ValueError(f"Entry {entry_id} not found")

            entry = self._entries[entry_id]
            if entry.status not in (EntryStatus.PENDING, EntryStatus.BOOTED):
                raise ValueError(f"Entry {entry_id} is already {entry.status.value}")

            # Check boot timeout
            if entry.boot_timeout_until and entry.boot_timeout_until > time.time():
                remaining = int(entry.boot_timeout_until - time.time())
                raise ValueError(f"User is in timeout for {remaining}s more")

            entry.status    = EntryStatus.APPROVED
            entry.approved_at = time.time()
            entry.approved_by = approved_by
            logger.info("Approved (door open→close): %s → %s", entry.display_name, entry.target_room)
        # Door closes here — lock released

    def deny_entry(self, entry_id: str, reason: str = "") -> None:
        """Deny an entry request."""
        if entry_id not in self._entries:
            raise ValueError(f"Entry {entry_id} not found")
        entry = self._entries[entry_id]
        if entry.status != EntryStatus.PENDING:
            raise ValueError(f"Entry {entry_id} is already {entry.status.value}")
        entry.status      = EntryStatus.DENIED
        entry.deny_reason = reason
        logger.info("Denied: %s — %s", entry.display_name, reason)

    # ── GAP 2: boot from studio ───────────────────────────────────────────────

    def boot_to_waiting_room(
        self,
        user_id: str,
        display_name: str,
        booted_by: str,
        reason: str = "",
        timeout_seconds: int = 300,
    ) -> str:
        """
        Security/host redirects a user back to the waiting room from the studio.

        Creates or updates their entry with BOOTED status and a timeout.
        During timeout: they can see waiting room chat (read-only) but cannot
        re-enter studio until timeout expires AND host re-approves.

        Returns entry_id.
        """
        existing_id = self._by_user.get(user_id)
        if existing_id and existing_id in self._entries:
            entry = self._entries[existing_id]
        else:
            entry_id = f"entry_{uuid.uuid4().hex[:12]}"
            entry = WaitingRoomEntry(
                entry_id=entry_id,
                user_id=user_id,
                display_name=display_name,
                target_room="lobby",
                consents={},
            )
            self._entries[entry_id] = entry
            self._by_user[user_id] = entry_id

        entry.status              = EntryStatus.BOOTED
        entry.booted_at           = time.time()
        entry.boot_reason         = reason
        entry.boot_timeout_until  = time.time() + timeout_seconds
        entry.booted_by           = booted_by
        # Reset approval so they need re-approval after timeout
        entry.approved_at  = None
        entry.approved_by  = None

        logger.info(
            "BOOT: %s → waiting room for %ds (reason: %s, by: %s)",
            display_name, timeout_seconds, reason, booted_by
        )
        return entry.entry_id

    def get_booted_users(self) -> List[WaitingRoomEntry]:
        """All currently booted users (timeout not yet expired)."""
        now = time.time()
        return [
            e for e in self._entries.values()
            if e.status == EntryStatus.BOOTED
            and e.boot_timeout_until
            and e.boot_timeout_until > now
        ]

    def check_timeout_expired(self, user_id: str) -> bool:
        """Returns True if a booted user's timeout has now passed."""
        entry_id = self._by_user.get(user_id)
        if not entry_id:
            return False
        entry = self._entries.get(entry_id)
        if not entry or entry.status != EntryStatus.BOOTED:
            return False
        if entry.boot_timeout_until and entry.boot_timeout_until <= time.time():
            # Timeout expired — reset to PENDING so they can be re-approved
            entry.status = EntryStatus.PENDING
            logger.info("Timeout expired for %s — reset to pending", entry.display_name)
            return True
        return False

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_entry(self, entry_id: str) -> Optional[WaitingRoomEntry]:
        return self._entries.get(entry_id)

    def get_entry_for_user(self, user_id: str) -> Optional[WaitingRoomEntry]:
        entry_id = self._by_user.get(user_id)
        return self._entries.get(entry_id) if entry_id else None

    def get_pending_entries(self) -> List[WaitingRoomEntry]:
        return [e for e in self._entries.values() if e.status == EntryStatus.PENDING]

    # ── GAP 5: chat isolation ─────────────────────────────────────────────────

    def post_chat(
        self,
        user_id: str,
        display_name: str,
        text: str,
        scope: str = "waiting_room",
    ) -> WaitingRoomChatMessage:
        """
        Post a message to the waiting room chat.

        scope:
          "waiting_room"   — visible to guests in waiting room + host/security
          "studio_flagged" — studio message flagged for host awareness (not shown to guests)

        Guests in the waiting room can ONLY see "waiting_room" messages.
        Host/security see both scopes.
        """
        msg = WaitingRoomChatMessage(
            message_id=f"msg_{uuid.uuid4().hex[:12]}",
            user_id=user_id,
            display_name=display_name,
            text=text,
            scope=scope,
        )
        self._chat.append(msg)
        # Keep last 200 messages
        if len(self._chat) > 200:
            self._chat = self._chat[-200:]
        return msg

    def get_chat(
        self,
        viewer_role: str = "guest",   # "guest" | "host" | "security"
        since: float = 0.0,
        limit: int = 50,
    ) -> List[WaitingRoomChatMessage]:
        """
        Get chat messages with role-based visibility.

        Guests: only "waiting_room" scoped messages.
        Host/security: all messages (waiting_room + studio_flagged).
        """
        msgs = [m for m in self._chat if m.created_at > since]
        if viewer_role == "guest":
            msgs = [m for m in msgs if m.scope == "waiting_room"]
        msgs.sort(key=lambda m: m.created_at)
        return msgs[-limit:]


# ── Global singleton ──────────────────────────────────────────────────────────

_waiting_room: Optional[WaitingRoomManager] = None


def init_waiting_room(
    auto_approve: bool = False,
    host_user_ids: Optional[List[str]] = None,
) -> WaitingRoomManager:
    global _waiting_room
    _waiting_room = WaitingRoomManager(
        auto_approve=auto_approve,
        host_user_ids=host_user_ids,
    )
    return _waiting_room


def get_waiting_room() -> WaitingRoomManager:
    if not _waiting_room:
        raise RuntimeError("Waiting room not initialized")
    return _waiting_room


# ── GAP 4: protocol seed ──────────────────────────────────────────────────────

async def seed_default_protocols(system_memory: Any) -> int:
    """
    Seed SystemMemory with default protocols on first boot.

    Jeremy reads these when a guest asks a rule question.
    Call from main.py startup after SystemMemory.init().

    Returns number of protocols seeded (0 if already seeded).
    """
    existing = await system_memory.get_protocols(max_results=1)
    if existing:
        logger.info("Protocols already seeded — skipping")
        return 0

    protocols = [
        {
            "topic": "entry",
            "content": (
                "All guests wait in the lounge until the host approves them individually. "
                "The door opens for one person at a time and closes immediately. "
                "The host is never sent to the waiting room."
            ),
            "importance": 9,
            "tags": ["entry", "waiting_room", "door", "host"],
        },
        {
            "topic": "timeout",
            "content": (
                "First offense: 5 minute cooldown in the waiting room lounge. "
                "You can see the waiting room chat but cannot participate in the studio. "
                "Repeated offenses require manual review by the host before re-entry."
            ),
            "importance": 9,
            "tags": ["timeout", "discipline", "cooldown", "boot"],
        },
        {
            "topic": "conduct",
            "content": (
                "Respect all participants — guests, characters, and AIs. "
                "Harassment, hate speech, and deliberate disruption are grounds for removal. "
                "Security and the host have final authority on conduct decisions."
            ),
            "importance": 8,
            "tags": ["conduct", "rules", "respect", "removal"],
        },
        {
            "topic": "proving_ground",
            "content": (
                "AIs entering for the first time must complete the proving ground course: "
                "walk a designated path, turn around, sit, jump, speak on cue, and repeat a phrase. "
                "The host or security watches and approves when the AI demonstrates body control. "
                "The course is isolated — nothing in the proving ground affects the studio."
            ),
            "importance": 9,
            "tags": ["proving_ground", "ai", "embodiment", "course", "body_control"],
        },
        {
            "topic": "consent",
            "content": (
                "Recording and AI disclosure consent is collected in the waiting room. "
                "Guests must consent to continue. Consent can be reviewed but not revoked "
                "mid-session — guests who withdraw consent should leave and rejoin."
            ),
            "importance": 8,
            "tags": ["consent", "recording", "ai_disclosure", "privacy"],
        },
        {
            "topic": "avatar",
            "content": (
                "Guests can customise their avatar in the waiting room lounge before entry. "
                "AIs should select their avatar before entering the proving ground. "
                "Avatar changes inside the studio are possible from the dressing room."
            ),
            "importance": 6,
            "tags": ["avatar", "customisation", "dressing_room", "waiting_room"],
        },
        {
            "topic": "chat",
            "content": (
                "Waiting room chat is separate from studio chat. "
                "Guests in the waiting room cannot see or participate in the studio chat. "
                "The host and security can see both. "
                "Waiting room chat is read-only for guests in timeout."
            ),
            "importance": 7,
            "tags": ["chat", "isolation", "waiting_room", "studio", "timeout"],
        },
        {
            "topic": "session_roles",
            "content": (
                "Roles in a session: Host (full control, bypasses waiting room), "
                "Security (can boot, approve, deny, view all chat), "
                "Guest (waits for approval, limited access until approved), "
                "AI (same as guest but must complete proving ground first)."
            ),
            "importance": 8,
            "tags": ["roles", "host", "security", "guest", "ai", "permissions"],
        },
    ]

    count = 0
    for p in protocols:
        await system_memory.store_protocol(
            topic=p["topic"],
            content=p["content"],
            importance=p["importance"],
            tags=p["tags"],
        )
        count += 1

    logger.info("Seeded %d default protocols into SystemMemory", count)
    return count


# ── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/governance/waiting-room", tags=["Waiting Room"])


@router.post("/request")
async def request_entry(req: EntryRequest):
    """Guest requests entry. Called automatically on session join for non-hosts."""
    wm = get_waiting_room()
    entry_id = wm.request_entry(
        user_id=req.user_id,
        display_name=req.display_name,
        target_room=req.target_room,
        consents=req.consents,
    )
    return {
        "entry_id": entry_id,
        "status": "pending",
        "message": "Waiting for host approval",
    }


@router.get("/status/{entry_id}")
async def check_entry_status(entry_id: str):
    """Poll entry status. Waiting room UI calls this every 2s."""
    wm = get_waiting_room()
    entry = wm.get_entry(entry_id)
    if not entry:
        raise HTTPException(404, f"Entry {entry_id} not found")

    # Auto-expire boot timeout if it's passed
    if entry.status == EntryStatus.BOOTED:
        wm.check_timeout_expired(entry.user_id)
        entry = wm.get_entry(entry_id)  # re-fetch after possible state change

    response: Dict = {
        "entry_id": entry_id,
        "status": entry.status.value,
        "target_room": entry.target_room,
    }

    if entry.status == EntryStatus.APPROVED:
        response["approved_at"] = entry.approved_at
        response["approved_by"] = entry.approved_by

    elif entry.status == EntryStatus.DENIED:
        response["deny_reason"] = entry.deny_reason

    elif entry.status == EntryStatus.BOOTED:
        remaining = max(0, int((entry.boot_timeout_until or 0) - time.time()))
        response["boot_reason"]      = entry.boot_reason
        response["booted_by"]        = entry.booted_by
        response["timeout_remaining"] = remaining
        response["message"] = (
            f"You're in a {remaining}s cooldown. "
            "You can read the waiting room chat. "
            "Your host will let you back in when it expires."
        )

    return response


@router.post("/{entry_id}/approve")
async def approve_entry(entry_id: str, approved_by: str = "host"):
    """
    Approve a guest. Door opens for this one person, closes immediately.
    If two approvals race, the second will fail cleanly.
    """
    wm = get_waiting_room()
    try:
        await wm.approve_entry(entry_id, approved_by)
        return {"entry_id": entry_id, "status": "approved"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{entry_id}/deny")
async def deny_entry(entry_id: str, reason: str = ""):
    """Deny a guest entry."""
    wm = get_waiting_room()
    try:
        wm.deny_entry(entry_id, reason)
        return {"entry_id": entry_id, "status": "denied", "reason": reason}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/pending")
async def get_pending():
    """Host dashboard: who is waiting for approval."""
    wm = get_waiting_room()
    entries = wm.get_pending_entries()
    return {
        "pending": [
            {
                "entry_id":    e.entry_id,
                "user_id":     e.user_id,
                "display_name": e.display_name,
                "target_room": e.target_room,
                "requested_at": e.requested_at,
                "consents":    e.consents,
                "wait_seconds": int(time.time() - e.requested_at),
            }
            for e in entries
        ],
        "count": len(entries),
    }


@router.post("/boot")
async def boot_user(req: BootRequest):
    """
    Security/host boots a user back to waiting room from the studio.
    Sets a timeout during which they cannot re-enter.
    """
    wm = get_waiting_room()
    entry_id = wm.boot_to_waiting_room(
        user_id=req.user_id,
        display_name=req.display_name,
        booted_by=req.booted_by,
        reason=req.reason,
        timeout_seconds=req.timeout_seconds,
    )
    return {
        "entry_id":        entry_id,
        "user_id":         req.user_id,
        "status":          "booted",
        "timeout_seconds": req.timeout_seconds,
        "reason":          req.reason,
        "message": (
            f"{req.display_name} has been sent to the waiting room "
            f"for {req.timeout_seconds}s."
        ),
    }


@router.get("/booted")
async def get_booted():
    """List all currently booted users (timeout not expired)."""
    wm = get_waiting_room()
    booted = wm.get_booted_users()
    now = time.time()
    return {
        "booted": [
            {
                "entry_id":          e.entry_id,
                "user_id":           e.user_id,
                "display_name":      e.display_name,
                "boot_reason":       e.boot_reason,
                "booted_by":         e.booted_by,
                "booted_at":         e.booted_at,
                "timeout_remaining": max(0, int((e.boot_timeout_until or 0) - now)),
            }
            for e in booted
        ],
        "count": len(booted),
    }


@router.post("/chat")
async def post_chat_message(req: ChatPostRequest):
    """Post a message to the waiting room chat."""
    wm = get_waiting_room()

    # Check if user is in timeout — read-only
    entry = wm.get_entry_for_user(req.user_id)
    if entry and entry.status == EntryStatus.BOOTED:
        remaining = max(0, int((entry.boot_timeout_until or 0) - time.time()))
        if remaining > 0:
            raise HTTPException(
                403,
                f"You are in a cooldown for {remaining}s more. Chat is read-only."
            )

    msg = wm.post_chat(
        user_id=req.user_id,
        display_name=req.display_name,
        text=req.text,
        scope="waiting_room",
    )
    return {
        "message_id": msg.message_id,
        "status":     "posted",
        "created_at": msg.created_at,
    }


@router.get("/chat")
async def get_chat_feed(
    viewer_role: str = Query("guest", description="guest | host | security"),
    since: float    = Query(0.0, description="Only return messages after this Unix timestamp"),
    limit: int      = Query(50, ge=1, le=200),
):
    """
    Get waiting room chat feed.

    Guests: only see waiting_room scoped messages.
    Host/security: see all messages including studio_flagged.
    """
    wm = get_waiting_room()
    messages = wm.get_chat(viewer_role=viewer_role, since=since, limit=limit)
    return {
        "messages": [
            {
                "message_id":   m.message_id,
                "user_id":      m.user_id,
                "display_name": m.display_name,
                "text":         m.text,
                "created_at":   m.created_at,
                "scope":        m.scope,
            }
            for m in messages
        ],
        "count": len(messages),
        "viewer_role": viewer_role,
    }


@router.get("/chat/host")
async def get_host_chat_view(
    since: float = Query(0.0),
    limit: int   = Query(100, ge=1, le=200),
):
    """
    Host/security view: waiting room chat + studio_flagged messages combined.
    Use for the host dashboard sidebar.
    """
    wm = get_waiting_room()
    messages = wm.get_chat(viewer_role="host", since=since, limit=limit)
    return {
        "messages": [
            {
                "message_id":   m.message_id,
                "user_id":      m.user_id,
                "display_name": m.display_name,
                "text":         m.text,
                "created_at":   m.created_at,
                "scope":        m.scope,
            }
            for m in messages
        ],
        "count": len(messages),
    }
