@echo off
chcp 65001 >nul
title Ajedrez App
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instálalo desde https://nodejs.org ^(versión LTS^) y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo Comprobando dependencias. La primera vez tarda un par de minutos...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Ha fallado la instalación de dependencias.
  pause
  exit /b 1
)

echo Arrancando Ajedrez App. Se abrirá el navegador en http://localhost:5173
echo Para cerrar la app, cierra esta ventana.
call npm run dev
pause
