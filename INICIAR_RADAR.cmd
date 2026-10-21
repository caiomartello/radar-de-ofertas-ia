@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 LTS pelo site oficial https://nodejs.org/
  echo Depois abra este arquivo novamente.
  pause
  exit /b 1
)
node iniciar-radar.cjs
if errorlevel 1 (
  echo.
  echo O Radar nao conseguiu iniciar. Copie a mensagem de erro, sem senhas.
  pause
)
