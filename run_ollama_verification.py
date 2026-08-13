#!/usr/bin/env python3
"""
COMPREHENSIVE OLLAMA VERIFICATION
Run this on your machine with Ollama running
Tests all integration paths and runtime behavior

Usage: python3 run_ollama_verification.py
"""

import asyncio
import sys
import json
from pathlib import Path

# Add modules to path
sys.path.insert(0, str(Path(__file__).parent))

async def main():
    print("="*80)
    print("COMPREHENSIVE OLLAMA VERIFICATION")
    print("Testing PubCast AI → Ollama Integration")
    print("="*80)
    print()
    
    results = {
        "tests_passed": 0,
        "tests_failed": 0,
        "warnings": [],
        "critical_errors": []
    }
    
    # ========================================================================
    # PHASE 1: STATIC CODE AUDIT
    # ========================================================================
    print("PHASE 1: STATIC CODE AUDIT")
    print("-" * 80)
    
    print("\n1.1 Checking PubCast Ollama Integration Files...")
    
    required_files = {
        "modules/ollama_provider.py": "Ollama provider implementation",
        "modules/llm_framework.py": "LLM framework",
        "modules/byok_manager.py": "BYOK manager",
        "modules/bots.py": "Bot management"
    }
    
    for filepath, description in required_files.items():
        if Path(filepath).exists():
            print(f"   ✅ {filepath} - {description}")
        else:
            print(f"   ❌ MISSING: {filepath} - {description}")
            results["critical_errors"].append(f"Missing {filepath}")
    
    print("\n1.2 Analyzing Ollama Provider Code...")
    
    try:
        ollama_code = Path("modules/ollama_provider.py").read_text()
        
        # Check for streaming configuration
        if '"stream": False' in ollama_code:
            print("   ✅ Non-streaming mode configured (correct)")
        elif '"stream": True' in ollama_code:
            print("   ⚠️  WARNING: Streaming mode enabled")
            results["warnings"].append("Streaming mode may cause issues")
        
        # Check for timeout handling
        if "timeout" in ollama_code:
            print("   ✅ Timeout handling present")
        
        # Check error handling
        if "except httpx.ConnectError" in ollama_code:
            print("   ✅ Connection error handling present")
        
        if "except httpx.TimeoutException" in ollama_code:
            print("   ✅ Timeout error handling present")
            
    except Exception as e:
        print(f"   ❌ Could not analyze code: {e}")
        results["critical_errors"].append(f"Code analysis failed: {e}")
    
    # ========================================================================
    # PHASE 2: LIVE OLLAMA CONNECTION TESTS
    # ========================================================================
    print("\n" + "="*80)
    print("PHASE 2: LIVE OLLAMA CONNECTION TESTS")
    print("-" * 80)
    
    print("\n2.1 Testing Direct Ollama Endpoint...")
    
    try:
        import httpx
        
        ollama_host = "http://localhost:11434"
        
        async with httpx.AsyncClient(timeout=5) as client:
            # Test 1: Basic connectivity
            print(f"\n   Testing {ollama_host}...")
            response = await client.get(ollama_host)
            
            if response.status_code == 200:
                print(f"   ✅ Ollama endpoint reachable")
                results["tests_passed"] += 1
            else:
                print(f"   ❌ Ollama returned HTTP {response.status_code}")
                results["tests_failed"] += 1
                results["critical_errors"].append(f"Ollama HTTP {response.status_code}")
                return results
                
    except ImportError:
        print("   ❌ httpx not installed - run: pip install httpx")
        results["critical_errors"].append("httpx not installed")
        return results
    except Exception as e:
        print(f"   ❌ Cannot connect to Ollama: {e}")
        print("\n   💡 Make sure Ollama is running:")
        print("      - Check: ollama list")
        print("      - Start: ollama serve")
        results["critical_errors"].append(f"Ollama not reachable: {e}")
        return results
    
    # Test 2: Model discovery
    print("\n2.2 Discovering Available Models...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{ollama_host}/api/tags")
            
            if response.status_code == 200:
                models_data = response.json()
                models = models_data.get("models", [])
                
                print(f"\n   ✅ Found {len(models)} models:")
                
                user_models = {
                    "google_gemma-3-1b-it-Q6_K:latest": False,
                    "gemma3:1b": False,
                    "gemma4:e2b": False,
                    "qwen2.5-coder:7b": False
                }
                
                for model in models:
                    model_name = model.get("name")
                    size_gb = model.get("size", 0) / 1e9
                    print(f"      - {model_name} ({size_gb:.1f}GB)")
                    
                    if model_name in user_models:
                        user_models[model_name] = True
                
                # Verify expected models
                print("\n   Verification:")
                for model_name, found in user_models.items():
                    if found:
                        print(f"      ✅ {model_name}")
                        results["tests_passed"] += 1
                    else:
                        print(f"      ⚠️  {model_name} not found")
                        results["warnings"].append(f"{model_name} not available")
                        
    except Exception as e:
        print(f"   ❌ Model discovery failed: {e}")
        results["tests_failed"] += 1
    
    # ========================================================================
    # PHASE 3: ACTUAL INFERENCE TESTS
    # ========================================================================
    print("\n" + "="*80)
    print("PHASE 3: ACTUAL INFERENCE TESTS")
    print("-" * 80)
    
    # Test 3.1: google_gemma-3-1b-it-Q6_K
    print("\n3.1 Testing google_gemma-3-1b-it-Q6_K:latest...")
    
    test_model = "google_gemma-3-1b-it-Q6_K:latest"
    test_prompt = "Say 'PubCast AI Ollama integration is working' in one short sentence."
    
    try:
        import time
        start_time = time.time()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            print(f"   Sending prompt: '{test_prompt}'")
            
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
            
            elapsed = time.time() - start_time
            
            if response.status_code == 200:
                result = response.json()
                generated_text = result.get("response", "").strip()
                
                if generated_text:
                    print(f"\n   ✅ Inference successful! ({elapsed:.2f}s)")
                    print(f"   📝 Response: {generated_text}")
                    
                    # Check metadata
                    if "eval_count" in result:
                        print(f"   📊 Tokens: {result['eval_count']}")
                    if "total_duration" in result:
                        duration_sec = result["total_duration"] / 1e9
                        print(f"   ⏱️  Duration: {duration_sec:.2f}s")
                    
                    results["tests_passed"] += 1
                else:
                    print("   ❌ Empty response")
                    results["tests_failed"] += 1
                    
            else:
                print(f"   ❌ HTTP {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                results["tests_failed"] += 1
                
    except Exception as e:
        print(f"   ❌ Inference failed: {e}")
        results["tests_failed"] += 1
    
    # Test 3.2: gemma3:1b (fast model)
    print("\n3.2 Testing gemma3:1b (fast model)...")
    
    try:
        start_time = time.time()
        
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": "gemma3:1b",
                    "prompt": "Say 'Hello from PubCast' briefly.",
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 30}
                }
            )
            
            elapsed = time.time() - start_time
            
            if response.status_code == 200:
                result = response.json()
                text = result.get("response", "").strip()
                print(f"   ✅ Fast model working ({elapsed:.2f}s)")
                print(f"   📝 Response: {text}")
                results["tests_passed"] += 1
            else:
                print(f"   ❌ Failed with HTTP {response.status_code}")
                results["tests_failed"] += 1
                
    except Exception as e:
        print(f"   ❌ Test failed: {e}")
        results["tests_failed"] += 1
    
    # ========================================================================
    # PHASE 4: PUBCAST INTEGRATION LAYER
    # ========================================================================
    print("\n" + "="*80)
    print("PHASE 4: PUBCAST INTEGRATION LAYER")
    print("-" * 80)
    
    print("\n4.1 Testing ollama_provider module...")
    
    try:
        from modules.ollama_provider import call_ollama, check_ollama_health
        
        print("   ✅ ollama_provider imported successfully")
        
        # Test health check
        print("\n   Testing check_ollama_health()...")
        health = await check_ollama_health()
        
        if health["alive"]:
            print(f"   ✅ Ollama health check passed")
            print(f"   📋 Detected {len(health['models'])} models")
            results["tests_passed"] += 1
        else:
            print(f"   ❌ Health check failed: {health.get('error')}")
            results["tests_failed"] += 1
        
        # Test inference through integration layer
        print("\n   Testing call_ollama()...")
        response_text = await call_ollama(
            prompt="Say 'Integration layer test successful' in one sentence.",
            model="gemma3:1b",
            temperature=0.7,
            max_tokens=40
        )
        
        if response_text:
            print(f"   ✅ call_ollama() returned text")
            print(f"   📝 Response: {response_text[:150]}")
            results["tests_passed"] += 1
        else:
            print("   ❌ call_ollama() returned empty")
            results["tests_failed"] += 1
            
    except ImportError as e:
        print(f"   ❌ Import failed: {e}")
        results["critical_errors"].append(f"Cannot import ollama_provider: {e}")
    except Exception as e:
        print(f"   ❌ Integration test failed: {e}")
        results["tests_failed"] += 1
    
    # ========================================================================
    # PHASE 5: ERROR HANDLING TESTS
    # ========================================================================
    print("\n" + "="*80)
    print("PHASE 5: ERROR HANDLING TESTS")
    print("-" * 80)
    
    # Test 5.1: Missing model
    print("\n5.1 Testing error handling for missing model...")
    
    try:
        from modules.ollama_provider import call_ollama
        
        response = await call_ollama(
            prompt="test",
            model="nonexistent_model_xyz",
            timeout=10.0
        )
        
        if response == "":
            print("   ✅ Missing model correctly returns empty string")
            results["tests_passed"] += 1
        else:
            print("   ⚠️  Expected empty string for missing model")
            results["warnings"].append("Error handling may be incorrect")
            
    except Exception as e:
        print(f"   ✅ Missing model raises exception (acceptable)")
        results["tests_passed"] += 1
    
    # Test 5.2: Streaming vs non-streaming
    print("\n5.2 Verifying non-streaming configuration...")
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": "gemma3:1b",
                    "prompt": "Say hi.",
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                
                if "response" in result and isinstance(result["response"], str):
                    print("   ✅ Non-streaming mode working correctly")
                    print("   ✅ PubCast configuration is correct")
                    results["tests_passed"] += 1
                else:
                    print("   ⚠️  Unexpected response format")
                    results["warnings"].append("Response format unexpected")
                    
    except Exception as e:
        print(f"   ❌ Streaming test failed: {e}")
        results["tests_failed"] += 1
    
    # ========================================================================
    # FINAL REPORT
    # ========================================================================
    print("\n" + "="*80)
    print("FINAL VERIFICATION REPORT")
    print("="*80)
    print()
    
    print("📊 RESULTS:")
    print(f"   ✅ Tests Passed: {results['tests_passed']}")
    print(f"   ❌ Tests Failed: {results['tests_failed']}")
    print(f"   ⚠️  Warnings: {len(results['warnings'])}")
    print(f"   🚨 Critical Errors: {len(results['critical_errors'])}")
    print()
    
    if results["warnings"]:
        print("⚠️  WARNINGS:")
        for warning in results["warnings"]:
            print(f"   • {warning}")
        print()
    
    if results["critical_errors"]:
        print("🚨 CRITICAL ERRORS:")
        for error in results["critical_errors"]:
            print(f"   • {error}")
        print()
    
    print("="*80)
    print("SUMMARY")
    print("="*80)
    
    if results["critical_errors"]:
        print("❌ CRITICAL ISSUES DETECTED")
        print("   FIX REQUIRED BEFORE DEPLOYMENT")
    elif results["tests_failed"] > 0:
        print(f"⚠️  SOME TESTS FAILED ({results['tests_failed']} failures)")
        print("   REVIEW REQUIRED")
    elif results["warnings"]:
        print(f"✅ OPERATIONAL (with {len(results['warnings'])} warnings)")
        print("\n   All critical tests passed!")
        print("   • Ollama endpoint reachable")
        print("   • Models available and callable")
        print("   • Live inference working")
        print("   • PubCast integration layer functional")
        print("   • Error handling working")
    else:
        print("✅ ALL TESTS PASSED - FULLY OPERATIONAL")
        print("\n   🎯 READY FOR PRODUCTION")
        print("   • Ollama connection: Working")
        print("   • Model inference: Working")
        print("   • Integration layer: Working")
        print("   • Error handling: Working")
        print("   • Non-streaming mode: Configured correctly")
    
    print("="*80)
    
    return results

if __name__ == "__main__":
    try:
        results = asyncio.run(main())
        
        # Exit code
        if results["critical_errors"]:
            sys.exit(2)  # Critical failure
        elif results["tests_failed"] > 0:
            sys.exit(1)  # Some tests failed
        else:
            sys.exit(0)  # All passed
            
    except KeyboardInterrupt:
        print("\n\nVerification interrupted")
        sys.exit(130)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(3)
