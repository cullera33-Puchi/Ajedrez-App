#!/usr/bin/env sh
# Arranque en macOS o Linux: ./iniciar.sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "No se encuentra Node.js. Instálalo desde https://nodejs.org (versión LTS)."; exit 1; }
npm install --no-audit --no-fund || exit 1
npm run dev
