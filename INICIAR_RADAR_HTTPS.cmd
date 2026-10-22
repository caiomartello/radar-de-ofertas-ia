@echo off
setlocal
cd /d "%~dp0"
for %%F in (iniciar-radar-https.cjs callback-https.cjs iniciar-radar.cjs update-files.json) do (
  if not exist "%%F" (
    echo Instalacao HTTPS incompleta: falta o arquivo %%F nesta pasta.
    echo Nao copie apenas este arquivo .cmd para a versao antiga.
    echo Extraia TODO o ZIP da versao HTTPS em uma pasta nova.
    echo Na pasta NOVA, abra ATUALIZAR_RADAR.cmd e indique sua pasta ANTIGA.
    echo Preserve a pasta data e o arquivo .env.local da instalacao antiga.
    pause
    exit /b 1
  )
)
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 LTS antes de iniciar.
  pause
  exit /b 1
)
node iniciar-radar-https.cjs
pause
