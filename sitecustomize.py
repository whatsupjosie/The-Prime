"""Bootstrap Pubcast so `modules.*` imports resolve without manual PYTHONPATH tweaks."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
_DATA_DIR = _ROOT / "data"

# Ensure the dynamically stored backend package (data/modules) is importable as `modules`.
if _DATA_DIR.exists():
    _path = str(_DATA_DIR)
    if _path not in sys.path:
        sys.path.insert(0, _path)
