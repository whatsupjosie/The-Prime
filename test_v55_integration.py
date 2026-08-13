#!/usr/bin/env python3
"""
PubCast AI v5.5 Integration Test Suite
Tests all newly integrated systems: timeline, structured logging, recording pipeline,
waiting room, and hotspot system.

Usage:
    python test_v55_integration.py              # Run all tests
    python test_v55_integration.py --timeline   # Test timeline only
    python test_v55_integration.py --logs       # Test logging only
    python test_v55_integration.py --hotspots   # Test hotspots only
    python test_v55_integration.py --waitroom   # Test waiting room only
    python test_v55_integration.py --pipeline   # Test recording pipeline only
"""

import asyncio
import sys
import json
from pathlib import Path
from typing import List, Dict, Any

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_test(name: str):
    print(f"\n{Colors.BLUE}{Colors.BOLD}▶ {name}{Colors.RESET}")

def print_pass(msg: str):
    print(f"{Colors.GREEN}  ✓ {msg}{Colors.RESET}")

def print_fail(msg: str):
    print(f"{Colors.RED}  ✗ {msg}{Colors.RESET}")

def print_info(msg: str):
    print(f"{Colors.YELLOW}  ℹ {msg}{Colors.RESET}")

class TestResults:
    __test__ = False
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests: List[str] = []
    
    def record(self, test_name: str, passed: bool, message: str = ""):
        self.tests.append(test_name)
        if passed:
            self.passed += 1
            print_pass(f"{test_name}: {message}" if message else test_name)
        else:
            self.failed += 1
            print_fail(f"{test_name}: {message}" if message else test_name)
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}TEST SUMMARY{Colors.RESET}")
        print(f"{'='*60}")
        print(f"Total tests: {total}")
        print(f"{Colors.GREEN}Passed: {self.passed}{Colors.RESET}")
        print(f"{Colors.RED}Failed: {self.failed}{Colors.RESET}")
        if self.failed == 0:
            print(f"\n{Colors.GREEN}{Colors.BOLD}ALL TESTS PASSED ✓{Colors.RESET}\n")
        else:
            print(f"\n{Colors.RED}{Colors.BOLD}SOME TESTS FAILED ✗{Colors.RESET}\n")
        return self.failed == 0


async def test_imports(results: TestResults):
    """Test that all new modules can be imported."""
    print_test("Testing Module Imports")
    
    modules = [
        "modules.timeline",
        "modules.timeline_routes",
        "modules.structured_log",
        "modules.structured_log_routes",
        "modules.recording_pipeline",
        "modules.recording_pipeline_routes",
        "modules.governance_waiting_room",
        "modules.hotspot_system",
    ]
    
    for module_name in modules:
        try:
            __import__(module_name)
            results.record(f"Import {module_name}", True)
        except Exception as e:
            results.record(f"Import {module_name}", False, str(e))


async def test_timeline_system(results: TestResults):
    """Test timeline system functionality."""
    print_test("Testing Timeline System")
    
    try:
        from modules.timeline import TimelinePlayer, EventType
        from modules.timeline_routes import init_timeline_system
        
        # Test timeline player creation
        data_dir = Path("data")
        init_timeline_system(data_dir)
        results.record("Timeline system initialization", True)
        
        # Test timeline file loading
        timeline_files = list((data_dir / "timelines").glob("*.json"))
        results.record(f"Timeline files found", len(timeline_files) > 0, 
                      f"{len(timeline_files)} files")
        
        # Test timeline JSON validity
        for timeline_file in timeline_files:
            try:
                with open(timeline_file) as f:
                    data = json.load(f)
                required_keys = ["name", "events"]
                has_keys = all(k in data for k in required_keys)
                results.record(f"Timeline {timeline_file.name} valid", has_keys)
            except Exception as e:
                results.record(f"Timeline {timeline_file.name} valid", False, str(e))
        
    except Exception as e:
        results.record("Timeline system", False, str(e))


async def test_structured_logging(results: TestResults):
    """Test structured logging system."""
    print_test("Testing Structured Logging")
    
    try:
        from modules.structured_log import init_production_log, emit, get_production_log
        
        # Test log initialization
        log_dir = Path("data/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        
        prod_log = init_production_log(log_dir)
        results.record("Production log initialization", prod_log is not None)
        
        # Test event emission
        emit("test", "test_event", {"foo": "bar"})
        results.record("Event emission", True)
        
        # Test event querying
        prod_log = get_production_log()
        recent = prod_log.recent(limit=10) if prod_log else []
        results.record("Query recent events", isinstance(recent, list))
        
        # Test JSONL file exists
        jsonl_file = log_dir / "production.jsonl"
        results.record("JSONL log file created", jsonl_file.exists())
        
    except Exception as e:
        results.record("Structured logging", False, str(e))


async def test_waiting_room(results: TestResults):
    """Test waiting room / airlock system."""
    print_test("Testing Waiting Room System")
    
    try:
        from modules.governance_waiting_room import init_waiting_room, EntryRequest
        
        # Test waiting room initialization
        wm = init_waiting_room(auto_approve=True)
        results.record("Waiting room initialization", wm is not None)
        
        # Test entry request via manager directly
        entry_id = wm.request_entry(
            user_id="test_user",
            display_name="Test User",
            target_room="studio",
            consents={"tos": True, "ai_disclosure": True}
        )
        results.record("Entry request creation", entry_id is not None)
        results.record("Entry has ID", isinstance(entry_id, str))
        
        # Test HTML file exists
        html_file = Path("static/waiting_room.html")
        results.record("Waiting room HTML exists", html_file.exists())
        
    except Exception as e:
        results.record("Waiting room system", False, str(e))


async def test_hotspot_system(results: TestResults):
    """Test hotspot system functionality."""
    print_test("Testing Hotspot System")
    
    try:
        from modules.hotspot_system import init_hotspot_system
        
        # Test hotspot system initialization
        data_dir = Path("data")
        hm = init_hotspot_system(data_dir)
        results.record("Hotspot system initialization", hm is not None)
        
        # Test hotspot file loading
        hotspot_dir = data_dir / "hotspots"
        hotspot_files = list(hotspot_dir.glob("*.json"))
        results.record(f"Hotspot files found", len(hotspot_files) > 0,
                      f"{len(hotspot_files)} files")
        
        # Test hotspot JSON validity
        for hotspot_file in hotspot_files:
            try:
                with open(hotspot_file) as f:
                    data = json.load(f)
                # The files have "meta" and "hotspots" keys
                has_keys = "hotspots" in data
                results.record(f"Hotspot {hotspot_file.name} valid", has_keys)
            except Exception as e:
                results.record(f"Hotspot {hotspot_file.name} valid", False, str(e))
        
    except Exception as e:
        results.record("Hotspot system", False, str(e))


async def test_recording_pipeline(results: TestResults):
    """Test recording pipeline functionality."""
    print_test("Testing Recording Pipeline")
    
    try:
        from modules.recording_pipeline import ServerRecordingSession
        
        # Test pipeline session creation
        recordings_dir = Path("data/recordings")
        recordings_dir.mkdir(parents=True, exist_ok=True)
        
        session = ServerRecordingSession("test_session", recordings_dir)
        results.record("Pipeline session creation", session is not None)
        
        # Test event recording
        session.record_camera_switch("cam_1", "cam_2", "cut")
        results.record("Camera switch recording", True)
        
        session.record_chat("test_user", "Hello world", "user_123")
        results.record("Chat message recording", True)
        
        session.record_marker("Test marker", "operator")
        results.record("Marker recording", True)
        
        # Test session stop
        summary = session.stop()
        results.record("Session stop", isinstance(summary, dict))
        results.record("Summary contains events", "events" in summary)
        
    except Exception as e:
        results.record("Recording pipeline", False, str(e))


async def test_data_files(results: TestResults):
    """Test that all required data files exist."""
    print_test("Testing Data Files")
    
    data_dir = Path("data")
    
    # Test directories
    required_dirs = [
        data_dir / "timelines",
        data_dir / "hotspots",
        data_dir / "environments",
        data_dir / "logs",
    ]
    
    for directory in required_dirs:
        results.record(f"Directory {directory.name} exists", directory.exists())
    
    # Test timeline files
    timeline_files = ["demo.json", "intro.json"]
    for filename in timeline_files:
        filepath = data_dir / "timelines" / filename
        results.record(f"Timeline {filename} exists", filepath.exists())
    
    # Test hotspot files
    hotspot_files = ["green_room.json", "dressing_room.json"]
    for filename in hotspot_files:
        filepath = data_dir / "hotspots" / filename
        results.record(f"Hotspot {filename} exists", filepath.exists())
    
    # Test static files
    static_file = Path("static/waiting_room.html")
    results.record("Waiting room HTML exists", static_file.exists())


async def test_main_py_integration(results: TestResults):
    """Test that main.py has all the integrations."""
    print_test("Testing main.py Integration")
    
    main_py = Path("main.py")
    if not main_py.exists():
        results.record("main.py exists", False)
        return
    
    content = main_py.read_text()
    
    # Check for imports
    required_imports = [
        "from modules import timeline_routes",
        "from modules import structured_log_routes",
        "from modules import recording_pipeline_routes",
        "from modules import governance_waiting_room",
        "from modules import hotspot_system",
    ]
    
    for import_line in required_imports:
        results.record(f"Import: {import_line.split()[-1]}", 
                      import_line in content)
    
    # Check for global declarations
    required_globals = [
        "production_log",
        "timeline_player",
        "waiting_room_manager",
        "hotspot_manager",
    ]
    
    for global_name in required_globals:
        results.record(f"Global: {global_name}", 
                      f"{global_name}:" in content or f"{global_name} =" in content)
    
    # Check for initialization steps
    init_checks = [
        "init_production_log",
        "init_timeline_system",
        "init_waiting_room",
        "init_hotspot_system",
    ]
    
    for init_func in init_checks:
        results.record(f"Init call: {init_func}", init_func in content)


async def run_all_tests():
    """Run complete test suite."""
    print(f"\n{Colors.BOLD}{'='*60}")
    print("PubCast AI v5.5 Integration Test Suite")
    print(f"{'='*60}{Colors.RESET}\n")
    
    results = TestResults()
    
    # Run all test suites
    await test_imports(results)
    await test_main_py_integration(results)
    await test_data_files(results)
    await test_timeline_system(results)
    await test_structured_logging(results)
    await test_waiting_room(results)
    await test_hotspot_system(results)
    await test_recording_pipeline(results)
    
    # Print summary
    success = results.summary()
    return 0 if success else 1


async def run_specific_test(test_name: str):
    """Run a specific test suite."""
    results = TestResults()
    
    test_map = {
        "imports": test_imports,
        "main": test_main_py_integration,
        "data": test_data_files,
        "timeline": test_timeline_system,
        "logs": test_structured_logging,
        "waitroom": test_waiting_room,
        "hotspots": test_hotspot_system,
        "pipeline": test_recording_pipeline,
    }
    
    if test_name in test_map:
        await test_map[test_name](results)
        return 0 if results.summary() else 1
    else:
        print_fail(f"Unknown test: {test_name}")
        print_info(f"Available tests: {', '.join(test_map.keys())}")
        return 1


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        test_name = sys.argv[1].lstrip('-')
        exit_code = asyncio.run(run_specific_test(test_name))
    else:
        exit_code = asyncio.run(run_all_tests())
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
