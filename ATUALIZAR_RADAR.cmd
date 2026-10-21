@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 LTS antes de atualizar.
  pause
  exit /b 1
)
node atualizar-radar.cjs
pause
