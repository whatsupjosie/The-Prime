from __future__ import annotations

import json
import time
import uuid
import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from .persistence import read_json, write_json

logger = logging.getLogger("pubcast.session_runtime")


def _safe(value: str) -> str:
    cleaned = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in str(value or 'anon'))
    return cleaned[:120] or 'anon'


def _root(data_dir: Path) -> Path:
    root = Path(data_dir) / 'sessions'
    root.mkdir(parents=True, exist_ok=True)
    return root


def _path(data_dir: Path, session_id: str) -> Path:
    return _root(data_dir) / f'{_safe(session_id)}.json'


def _now() -> float:
    return time.time()


def _room_id(session_id: str, user_id: str) -> str:
    digest = hashlib.sha256(f'{session_id}:{user_id}'.encode('utf-8')).hexdigest()[:16]
    return f'dressing_{digest}'


def _call_handle(session_id: str, user_id: str) -> str:
    digest = hashlib.sha256(f'call:{session_id}:{user_id}'.encode('utf-8')).hexdigest()[:12]
    return f'{_safe(session_id)}:{digest}'


def load_session(data_dir: Path, session_id: str) -> Dict[str, Any]:
    path = _path(data_dir, session_id)
    if path.exists():
        try:
            payload = read_json(path)
            if isinstance(payload, dict):
                return payload
            logger.warning("Session payload for %s was not a dict; resetting", session_id)
        except Exception as exc:
            logger.warning("Corrupt session file for %s at %s: %s", session_id, path, exc)
    return {
        'session_id': session_id,
        'project_id': 'default',
        'created_at': _now(),
        'host_user_id': None,
        'participants': {},
        'session_credits': [],
        'role_events': [],
    }


def save_session(data_dir: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    payload['updated_at'] = _now()
    write_json(_path(data_dir, payload['session_id']), payload)
    return payload


def register_participant(
    data_dir: Path,
    *,
    session_id: str,
    user_id: str,
    display_name: str,
    project_id: str = 'default',
    project_role: Optional[List[str]] = None,
    session_role: Optional[List[str]] = None,
    license_role: str = 'personal',
    host_user_id: Optional[str] = None,
    credit_name: Optional[str] = None,
    presence_mode: str = 'avatar_static',
    availability: str = 'available',
    creditable: bool = True,
) -> Dict[str, Any]:
    state = load_session(data_dir, session_id)
    state['project_id'] = project_id or state.get('project_id') or 'default'
    if host_user_id:
        state['host_user_id'] = host_user_id
    participant = state['participants'].get(user_id, {})
    joined_at = participant.get('joined_at') or _now()
    participant.update({
        'user_id': user_id,
        'display_name': display_name or participant.get('display_name') or user_id,
        'credit_name': credit_name or participant.get('credit_name') or display_name or user_id,
        'project_role': list(project_role or participant.get('project_role') or []),
        'session_role': list(session_role or participant.get('session_role') or []),
        'license_role': license_role or participant.get('license_role') or 'personal',
        'presence_mode': presence_mode or participant.get('presence_mode') or 'avatar_static',
        'availability': availability or participant.get('availability') or 'available',
        'creditable': bool(creditable if creditable is not None else participant.get('creditable', True)),
        'joined_at': joined_at,
        'last_seen_at': _now(),
        'left_at': None,
        'dressing_room_id': participant.get('dressing_room_id') or _room_id(session_id, user_id),
        'call_handle': participant.get('call_handle') or _call_handle(session_id, user_id),
        'contributed_changes': bool(participant.get('contributed_changes', False)),
    })
    state['participants'][user_id] = participant
    _upsert_session_credit(state, participant)
    save_session(data_dir, state)
    return participant


def mark_left(data_dir: Path, session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    state = load_session(data_dir, session_id)
    participant = state['participants'].get(user_id)
    if not participant:
        return None
    participant['left_at'] = _now()
    participant['availability'] = 'offline'
    participant['last_seen_at'] = _now()
    _upsert_session_credit(state, participant)
    save_session(data_dir, state)
    return participant


def _upsert_session_credit(state: Dict[str, Any], participant: Dict[str, Any]) -> None:
    credits = state.setdefault('session_credits', [])
    found = False
    for item in credits:
        if item.get('user_id') == participant.get('user_id'):
            item.update({
                'display_name': participant.get('display_name'),
                'credit_name': participant.get('credit_name'),
                'project_role': list(participant.get('project_role') or []),
                'session_role': list(participant.get('session_role') or []),
                'license_role': participant.get('license_role'),
                'joined_at': participant.get('joined_at'),
                'left_at': participant.get('left_at'),
                'creditable': participant.get('creditable', True),
                'contributed_changes': participant.get('contributed_changes', False),
                'call_handle': participant.get('call_handle'),
                'dressing_room_id': participant.get('dressing_room_id'),
                'availability': participant.get('availability'),
            })
            found = True
            break
    if not found:
        credits.append({
            'user_id': participant.get('user_id'),
            'display_name': participant.get('display_name'),
            'credit_name': participant.get('credit_name'),
            'project_role': list(participant.get('project_role') or []),
            'session_role': list(participant.get('session_role') or []),
            'license_role': participant.get('license_role'),
            'joined_at': participant.get('joined_at'),
            'left_at': participant.get('left_at'),
            'creditable': participant.get('creditable', True),
            'contributed_changes': participant.get('contributed_changes', False),
            'call_handle': participant.get('call_handle'),
            'dressing_room_id': participant.get('dressing_room_id'),
            'availability': participant.get('availability'),
        })


def update_role(
    data_dir: Path,
    *,
    session_id: str,
    acting_user_id: str,
    target_user_id: str,
    session_role: Optional[List[str]] = None,
    project_role: Optional[List[str]] = None,
    creditable: Optional[bool] = None,
) -> Dict[str, Any]:
    state = load_session(data_dir, session_id)
    participant = state['participants'].get(target_user_id)
    if not participant:
        raise KeyError(f'Unknown participant: {target_user_id}')
    before = {
        'session_role': list(participant.get('session_role') or []),
        'project_role': list(participant.get('project_role') or []),
        'creditable': bool(participant.get('creditable', True)),
    }
    if session_role is not None:
        participant['session_role'] = list(session_role)
    if project_role is not None:
        participant['project_role'] = list(project_role)
    if creditable is not None:
        participant['creditable'] = bool(creditable)
    participant['last_seen_at'] = _now()
    participant['contributed_changes'] = True
    state.setdefault('role_events', []).append({
        'event_id': uuid.uuid4().hex[:12],
        'ts': _now(),
        'acting_user_id': acting_user_id,
        'target_user_id': target_user_id,
        'before': before,
        'after': {
            'session_role': list(participant.get('session_role') or []),
            'project_role': list(participant.get('project_role') or []),
            'creditable': bool(participant.get('creditable', True)),
        },
    })
    _upsert_session_credit(state, participant)
    save_session(data_dir, state)
    return participant


def record_contribution(
    data_dir: Path,
    *,
    session_id: str,
    user_id: str,
    summary: str,
    contribution_type: str = 'general',
) -> None:
    state = load_session(data_dir, session_id)
    participant = state['participants'].get(user_id)
    if not participant:
        return
    participant['contributed_changes'] = True
    participant['last_contribution_summary'] = summary
    state.setdefault('contribution_history', []).append({
        'event_id': uuid.uuid4().hex[:12],
        'ts': _now(),
        'user_id': user_id,
        'summary': summary,
        'type': contribution_type,
    })
    _upsert_session_credit(state, participant)
    save_session(data_dir, state)


def get_roster(data_dir: Path, session_id: str) -> List[Dict[str, Any]]:
    state = load_session(data_dir, session_id)
    return sorted(state.get('participants', {}).values(), key=lambda p: (p.get('session_role', ['zz'])[0] if p.get('session_role') else 'zz', p.get('display_name', '')))


def resolve_dressing_room(data_dir: Path, *, session_id: str, user_id: str, display_name: str = '', project_id: str = 'default') -> Dict[str, Any]:
    participant = register_participant(
        data_dir,
        session_id=session_id,
        user_id=user_id,
        display_name=display_name or user_id,
        project_id=project_id,
    )
    return {
        'session_id': session_id,
        'project_id': project_id,
        'user_id': user_id,
        'dressing_room_id': participant['dressing_room_id'],
        'call_handle': participant['call_handle'],
        'overlay_path': f"data/projects/{_safe(project_id)}/dressing_overlays/{_safe(user_id)}.json",
        'private_room': True,
    }


def call_menu(data_dir: Path, session_id: str) -> List[Dict[str, Any]]:
    roster = get_roster(data_dir, session_id)
    return [
        {
            'user_id': item.get('user_id'),
            'display_name': item.get('display_name'),
            'credit_name': item.get('credit_name'),
            'session_role': item.get('session_role', []),
            'project_role': item.get('project_role', []),
            'presence_mode': item.get('presence_mode', 'avatar_static'),
            'availability': item.get('availability', 'available'),
            'call_handle': item.get('call_handle'),
            'dressing_room_id': item.get('dressing_room_id'),
        }
        for item in roster
    ]


def session_credit_block(data_dir: Path, session_id: str) -> Dict[str, Any]:
    state = load_session(data_dir, session_id)
    return {
        'session_id': state.get('session_id'),
        'session_started_at': state.get('created_at'),
        'session_ended_at': state.get('ended_at'),
        'host_user_id': state.get('host_user_id'),
        'participants': list(state.get('session_credits', [])),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Bubble Stack state helpers (optional spatial-awareness integration)
# ──────────────────────────────────────────────────────────────────────────────

def set_room_bubble_state(
    data_dir: Path,
    *,
    session_id: str,
    room_id: str,
    state: str,
    summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Persist Bubble Stack state in the existing session JSON.

    This does not alter participant lifecycle. It only stores optional spatial
    awareness status so rooms can remain valid even when Bubble Stack is blind,
    sleeping, or unavailable.
    """
    payload = load_session(data_dir, session_id)
    bubble_rooms = payload.setdefault('bubble_stack', {})
    room_payload = bubble_rooms.setdefault(room_id, {})
    room_payload.update({
        'room_id': room_id,
        'state': state,
        'updated_at': _now(),
    })
    if summary is not None:
        room_payload['summary'] = summary
    save_session(data_dir, payload)
    return room_payload


def get_room_bubble_state(data_dir: Path, *, session_id: str, room_id: str) -> Dict[str, Any]:
    """Return Bubble Stack state for a room, defaulting to AI_BLIND."""
    payload = load_session(data_dir, session_id)
    room_payload = payload.get('bubble_stack', {}).get(room_id)
    if isinstance(room_payload, dict):
        return room_payload
    return {
        'room_id': room_id,
        'state': 'AI_BLIND',
        'updated_at': _now(),
        'summary': {'state': 'AI_BLIND', 'room_id': room_id},
    }


def mark_room_ai_blind(data_dir: Path, *, session_id: str, room_id: str) -> Dict[str, Any]:
    """Mark a room as AI_BLIND without affecting human participation."""
    return set_room_bubble_state(
        data_dir,
        session_id=session_id,
        room_id=room_id,
        state='AI_BLIND',
        summary={'state': 'AI_BLIND', 'room_id': room_id},
    )
