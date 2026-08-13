from __future__ import annotations

import asyncio
from pathlib import Path
import socket
import pytest

from test_v55_integration import TestResults


@pytest.fixture
def results() -> TestResults:
    return TestResults()


def _ollama_available(host: str = '127.0.0.1', port: int = 11434, timeout: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def pytest_collection_modifyitems(config, items):
    ollama_up = _ollama_available()
    live_ollama_files = {
        'test_ai_characters.py',
        'test_ollama_live.py',
        'test_ollama_with_your_models.py',
    }
    skip_ollama = pytest.mark.skip(reason='Live Ollama service not available in test environment')
    for item in items:
        if item.fspath.basename in live_ollama_files and not ollama_up:
            item.add_marker(skip_ollama)


def pytest_pyfunc_call(pyfuncitem):
    testfunction = pyfuncitem.obj
    if not asyncio.iscoroutinefunction(testfunction):
        return None

    funcargs = {arg: pyfuncitem.funcargs[arg] for arg in pyfuncitem._fixtureinfo.argnames}
    asyncio.run(testfunction(**funcargs))
    return True


@pytest.fixture(scope='session', autouse=True)
def ensure_required_data_dirs():
    data_dir = Path(__file__).parent / 'data'
    for rel in ('credentials', 'emergency_saves', 'exports'):
        (data_dir / rel).mkdir(parents=True, exist_ok=True)
    yield
