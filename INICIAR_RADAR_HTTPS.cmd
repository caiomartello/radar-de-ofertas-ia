@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 LTS antes de iniciar.
  pause
  exit /b 1
)
node iniciar-radar-https.cjs
pause
