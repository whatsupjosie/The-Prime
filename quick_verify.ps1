# Quick verification commands - run these manually in PowerShell

# 1. First, verify we're in the correct repo directory
Write-Host "Current directory:" (Get-Location)
Write-Host ""

# 2. Delete the corrupted venv and recreate it
Write-Host "Removing corrupted venv..." -ForegroundColor Yellow
Remove-Item -Recurse -Force .\.venv311 -ErrorAction SilentlyContinue
Write-Host "Creating fresh venv..." -ForegroundColor Yellow
python -m venv .venv311
Write-Host "✓ venv created" -ForegroundColor Green
Write-Host ""

# 3. Activate it
Write-Host "Activating venv..." -ForegroundColor Yellow
& ".\.venv311\Scripts\Activate.ps1"
Write-Host "✓ venv activated" -ForegroundColor Green
Write-Host ""

# 4. Install requirements
Write-Host "Installing requirements..." -ForegroundColor Yellow
python -m pip install --upgrade pip setuptools wheel
python -m pip install -q -r requirements.txt
Write-Host "✓ requirements installed" -ForegroundColor Green
Write-Host ""

# 5. Test imports
Write-Host "Testing adapter imports..." -ForegroundColor Yellow
python -c "from modules.agents import OllamaAdapter, QwenAdapter, LMcoderAdapter; print('✓ All adapters imported OK')"
Write-Host ""

# 6. Run tests
Write-Host "Running pytest..." -ForegroundColor Yellow
python -m pytest tests/test_adapters.py -v --tb=short

# 7. Check main.py
Write-Host "Checking main.py import..." -ForegroundColor Yellow
python -c "import main; print('✓ main.py imports OK')"
