@echo off
chcp 65001 >nul
title Ajedrez App (PC y móvil)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encuentra Node.js. Instálalo desde https://nodejs.org ^(versión LTS^) y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo Comprobando dependencias...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Ha fallado la instalación de dependencias.
  pause
  exit /b 1
)

echo.
echo Desde el móvil, conectado a la misma wifi, abre la dirección que aparece abajo como "Network".
echo Si Windows pregunta por el firewall, permite el acceso en redes privadas.
echo Para cerrar la app, cierra esta ventana.
echo.
call npm run dev -- --host
pause
