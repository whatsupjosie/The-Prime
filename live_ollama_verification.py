#!/usr/bin/env python3
"""
LIVE OLLAMA VERIFICATION
Tests actual runtime paths against running Ollama instance
"""

import asyncio
import sys
import httpx
import json
from pathlib import Path

# Test results storage
results = {
    "static_audit": [],
    "live_verification": [],
    "errors": [],
    "warnings": []
}

def log_static(message):
    results["static_audit"].append(message)
    print(f"[STATIC] {message}")

def log_live(message):
    results["live_verification"].append(message)
    print(f"[LIVE] {message}")

def log_error(message):
    results["errors"].append(message)
    print(f"[ERROR] {message}")

def log_warning(message):
    results["warnings"].append(message)
    print(f"[WARN] {message}")

async def verify_ollama_integration():
    print("="*80)
    print("LIVE OLLAMA VERIFICATION - PubCast AI")
    print("="*80)
    print()
    
    # ========================================================================
    # PHASE 1: STATIC AUDIT
    # ========================================================================
    print("PHASE 1: STATIC AUDIT")
    print("-" * 80)
    
    # Check if ollama_provider.py exists
    ollama_provider_path = Path("modules/ollama_provider.py")
    if ollama_provider_path.exists():
        log_static("✅ ollama_provider.py found")
        # Check for key functions
        content = ollama_provider_path.read_text()
        if "call_ollama" in content:
            log_static("✅ call_ollama() function present")
        if "check_ollama_health" in content:
            log_static("✅ check_ollama_health() function present")
        if 'stream": False' in content:
            log_static("✅ Non-streaming mode configured (correct)")
        elif 'stream": True' in content:
            log_warning("⚠️  Streaming mode enabled - may cause issues")
    else:
        log_error("❌ ollama_provider.py missing")
    
    # Check LLM framework
    llm_framework_path = Path("modules/llm_framework.py")
    if llm_framework_path.exists():
        log_static("✅ llm_framework.py found")
    
    # Check BYOK manager
    byok_path = Path("modules/byok_manager.py")
    if byok_path.exists():
        log_static("✅ byok_manager.py found")
    
    print()
    
    # ========================================================================
    # PHASE 2: LIVE RUNTIME VERIFICATION
    # ========================================================================
    print("PHASE 2: LIVE RUNTIME VERIFICATION")
    print("-" * 80)
    
    ollama_host = "http://localhost:11434"
    
    # TEST 1: Can we reach Ollama?
    print("\n🔌 TEST 1: Ollama Endpoint Reachability")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(ollama_host)
            if response.status_code == 200:
                log_live("✅ Ollama endpoint reachable at " + ollama_host)
            else:
                log_error(f"❌ Ollama returned HTTP {response.status_code}")
                return False
    except httpx.ConnectError:
        log_error("❌ Cannot connect to Ollama - is it running?")
        return False
    except Exception as e:
        log_error(f"❌ Connection error: {e}")
        return False
    
    # TEST 2: List available models
    print("\n📋 TEST 2: Model Discovery")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{ollama_host}/api/tags")
            if response.status_code == 200:
                models_data = response.json()
                models = models_data.get("models", [])
                log_live(f"✅ Found {len(models)} models")
                
                # Check for specific user models
                model_names = [m.get("name") for m in models]
                
                target_models = {
                    "google_gemma-3-1b-it-Q6_K:latest": False,
                    "gemma3:1b": False,
                    "gemma4:e2b": False,
                }
                
                for model_name in model_names:
                    print(f"   - {model_name}")
                    if model_name in target_models:
                        target_models[model_name] = True
                
                # Verify target models
                if target_models["google_gemma-3-1b-it-Q6_K:latest"]:
                    log_live("✅ google_gemma-3-1b-it-Q6_K:latest available")
                else:
                    log_warning("⚠️  google_gemma-3-1b-it-Q6_K:latest not found")
                
                if target_models["gemma3:1b"]:
                    log_live("✅ gemma3:1b available")
                
                if target_models["gemma4:e2b"]:
                    log_live("✅ gemma4:e2b available")
                    
    except Exception as e:
        log_error(f"❌ Model discovery failed: {e}")
        return False
    
    # TEST 3: Actual inference with google_gemma-3-1b-it-Q6_K
    print("\n🧠 TEST 3: Live Inference (google_gemma-3-1b-it-Q6_K)")
    test_model = "google_gemma-3-1b-it-Q6_K:latest"
    test_prompt = "Say 'PubCast AI is running with Ollama' in one sentence."
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            print(f"   Calling {test_model}...")
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": test_model,
                    "prompt": test_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 50
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                generated_text = result.get("response", "").strip()
                
                if generated_text:
                    log_live("✅ Inference successful!")
                    log_live(f"   Response: {generated_text}")
                    
                    # Check response metadata
                    if "eval_count" in result:
                        log_live(f"   Tokens generated: {result['eval_count']}")
                    if "total_duration" in result:
                        duration_sec = result["total_duration"] / 1e9
                        log_live(f"   Duration: {duration_sec:.2f}s")
                else:
                    log_error("❌ Empty response from model")
                    return False
            else:
                log_error(f"❌ Inference failed with HTTP {response.status_code}")
                log_error(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        log_error(f"❌ Inference request failed: {e}")
        return False
    
    # TEST 4: Test through PubCast's ollama_provider module
    print("\n🎭 TEST 4: PubCast Integration Layer")
    try:
        sys.path.insert(0, str(Path.cwd()))
        from modules.ollama_provider import call_ollama, check_ollama_health
        
        log_live("✅ ollama_provider module imported")
        
        # Test health check
        health = await check_ollama_health()
        if health["alive"]:
            log_live("✅ check_ollama_health() confirms Ollama alive")
            log_live(f"   Models detected: {len(health['models'])}")
        else:
            log_error(f"❌ Health check failed: {health.get('error')}")
        
        # Test inference through integration layer
        response_text = await call_ollama(
            prompt="Say 'Integration layer working' briefly.",
            model="gemma3:1b",
            temperature=0.7,
            max_tokens=30
        )
        
        if response_text:
            log_live("✅ call_ollama() returned text")
            log_live(f"   Response: {response_text[:100]}")
        else:
            log_error("❌ call_ollama() returned empty string")
            
    except ImportError as e:
        log_error(f"❌ Cannot import ollama_provider: {e}")
    except Exception as e:
        log_error(f"❌ Integration layer test failed: {e}")
    
    # TEST 5: Streaming vs Non-Streaming
    print("\n📡 TEST 5: Streaming Behavior Verification")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Test non-streaming (what PubCast uses)
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": "gemma3:1b",
                    "prompt": "Count to 3.",
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                if "response" in result and isinstance(result["response"], str):
                    log_live("✅ Non-streaming mode works (PubCast default)")
                else:
                    log_warning("⚠️  Unexpected non-streaming response format")
                    
    except Exception as e:
        log_error(f"❌ Streaming test failed: {e}")
    
    # TEST 6: Error handling - missing model
    print("\n🚫 TEST 6: Error Handling (Missing Model)")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": "nonexistent_model_12345",
                    "prompt": "test",
                    "stream": False
                }
            )
            
            if response.status_code != 200:
                log_live(f"✅ Ollama correctly returns error for missing model (HTTP {response.status_code})")
            else:
                log_warning("⚠️  Ollama did not reject missing model")
                
    except httpx.HTTPStatusError as e:
        log_live(f"✅ Missing model raises HTTPStatusError as expected")
    except Exception as e:
        log_warning(f"⚠️  Unexpected error type: {type(e).__name__}")
    
    print()
    return True

async def generate_report():
    """Generate final report"""
    print("="*80)
    print("FINAL VERIFICATION REPORT")
    print("="*80)
    print()
    
    print("📊 STATIC AUDIT FINDINGS:")
    print("-" * 80)
    for finding in results["static_audit"]:
        print(f"  {finding}")
    print()
    
    print("🔍 LIVE RUNTIME VERIFICATION FINDINGS:")
    print("-" * 80)
    for finding in results["live_verification"]:
        print(f"  {finding}")
    print()
    
    if results["warnings"]:
        print("⚠️  WARNINGS:")
        print("-" * 80)
        for warning in results["warnings"]:
            print(f"  {warning}")
        print()
    
    if results["errors"]:
        print("❌ ERRORS:")
        print("-" * 80)
        for error in results["errors"]:
            print(f"  {error}")
        print()
    else:
        print("✅ NO ERRORS DETECTED")
        print()
    
    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    
    error_count = len(results["errors"])
    warning_count = len(results["warnings"])
    
    if error_count == 0 and warning_count == 0:
        print("✅ OLLAMA INTEGRATION: FULLY OPERATIONAL")
        print()
        print("   • Endpoint reachable")
        print("   • Models available and callable")
        print("   • Live inference working")
        print("   • PubCast integration layer functional")
        print("   • Non-streaming mode configured correctly")
        print("   • Error handling working")
        print()
        print("🎯 READY FOR PRODUCTION USE")
    elif error_count == 0:
        print(f"✅ OLLAMA INTEGRATION: OPERATIONAL (with {warning_count} warnings)")
    else:
        print(f"❌ OLLAMA INTEGRATION: {error_count} errors, {warning_count} warnings")
        print("   FIX REQUIRED BEFORE DEPLOYMENT")
    
    print("="*80)

if __name__ == "__main__":
    try:
        success = asyncio.run(verify_ollama_integration())
        asyncio.run(generate_report())
        sys.exit(0 if success and not results["errors"] else 1)
    except KeyboardInterrupt:
        print("\n\nVerification interrupted")
        sys.exit(1)
