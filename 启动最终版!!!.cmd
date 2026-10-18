@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" start_sonify.py
) else (
  py -3.12 start_sonify.py
)
pause
