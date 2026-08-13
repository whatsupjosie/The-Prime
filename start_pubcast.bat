@echo off
setlocal
REM Auto-activate the virtualenv and start the app
set PROJECT_DIR=%~dp0

REM Prefer Python 3.11 venv if present; fall back to legacy .venv
if exist "%PROJECT_DIR%.venv311\Scripts\activate.bat" (
  call "%PROJECT_DIR%.venv311\Scripts\activate.bat"
) else if exist "%PROJECT_DIR%.venv\Scripts\activate.bat" (
  call "%PROJECT_DIR%.venv\Scripts\activate.bat"
) else (
  echo No virtualenv found. Create one with: py -3.11 -m venv .venv311
  pause
  exit /b 1
)

python -m pip install --upgrade pip >nul
REM Optional: ensure deps are present (comment out if you don't want setup warnings every run)
pip install -r "%PROJECT_DIR%requirements.txt" >nul
cd /d "%PROJECT_DIR%"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
