# Ajedrez App

App web personal para aprender ajedrez: análisis de partidas importadas de Chess.com y Lichess, problemas, bots y entrenador con Claude. Uso personal del propietario (unos 500 de Elo en Chess.com, usuario `anriqui`).

Publicada en https://cullera33-puchi.github.io/Ajedrez-App/ (PWA para iPhone, también PC y tablet BOOX de tinta electrónica).

## Cómo trabajar con el propietario

- Responder siempre en español, con estilo directo y ejecutivo.
- Redacción: sin «·» como separador, sin guion largo como pausa, sin símbolos en la prosa (flechas, ≠), sin barras entre conceptos. Evitar anglicismos y giros de plantilla («robusto», «clave», «accionable»…).
- Todos los textos de la app en español de España.
- No generar PPT ni Excel salvo petición expresa.
- Trabaja casi siempre desde el móvil: después de publicar, recordarle que cierre y vuelva a abrir la app para ver los cambios.

## Documentación del proyecto

- `docs/HOJA_DE_RUTA.md`: mejoras hechas, pendientes y por analizar. Actualizar en cada iteración.
- `docs/AJUSTE_BOTS.md`: registro de sus impresiones sobre los bots y parámetros actuales. Cuando comente algo de un bot (fácil, difícil, error de bulto) o pegue el texto de *Copiar para Claude*, apuntarlo ahí y ajustar respetando el Elo.
- `docs/INFORME_EJECUCION.md`: informe de la última ejecución en segundo plano (noche del 26 al 27/10/2026).

## Tecnología

- Vite + React 19 + TypeScript. chess.js para reglas, chessground para el tablero, Stockfish 19 (WASM, `public/engine`, copiado por `scripts/copy-engine.mjs`) en un Web Worker.
- Datos en el navegador: IndexedDB (`src/lib/db.ts`: partidas, análisis, resúmenes, problemas propios) y localStorage con prefijo `ajedrez:` (`src/lib/storage.ts`). No hay servidor de datos; la copia de seguridad (`src/lib/backup.ts`) pasa los datos entre dispositivos.
- Entrenador: plugin de Vite (`server/coach.ts`) que usa `claude -p` con el plan del usuario (solo en el PC); en el móvil, botón para abrir claude.ai.
- **Regla del propietario: la app nunca llama a una IA que pueda costar dinero.** Nada de claves de API ni SDK de Anthropic u otros proveedores. Claude solo a través del plan (Claude Code o claude.ai).

Piezas principales:

| Zona | Archivos |
|---|---|
| Vistas | `src/views/` (Home, Play, Games, Analysis, Puzzles, Learn, Lessons, Scan, Progress) |
| Bots | `src/lib/bots.ts` (nivel de 250 a 2000 de 50 en 50, `makeBot`) |
| Análisis | `src/lib/analysis.ts`, `src/lib/engine.ts`, `src/lib/background.ts` |
| Problemas | `src/lib/puzzles.ts` (nivel tipo Elo), `src/lib/myPuzzles.ts` (tus errores con repaso espaciado), `src/lib/puzzleLog.ts` (histórico por día) |
| Recomendaciones | `src/lib/recommend.ts` (solo partidas de Chess.com y Lichess, nunca las de bots) |
| Importación | `src/lib/chesscom.ts`, `src/lib/lichess.ts`, `src/lib/pgnImport.ts` |
| Escáner | `src/lib/scan/` (detección del tablero, siluetas, plantillas en `templates.json`), `src/views/Scan.tsx`. Las plantillas se regeneran con `scripts/build-piece-templates.ts` a partir de los SVG de `lichess-org/lila/public/piece` |
| Variantes | `src/components/EngineLines.tsx` y la lógica de `variation` en `src/views/Analysis.tsx` |
| Progreso | `src/lib/progress.ts`, `src/views/Progress.tsx` |
| Lecciones | `src/lib/lessons.ts`, `src/views/Lessons.tsx` |
| Valoraciones de bots | `src/lib/botFeedback.ts` (texto para pegar a Claude) |

Reglas de negocio a respetar:

- Las partidas contra bots se guardan y analizan, pero van separadas (apartado *Contra bots* en Partidas) y no cuentan en recomendaciones ni en el resumen de Inicio.
- Los problemas de *Mis errores* no cambian el nivel de problemas.

## Comandos

```bash
npm install
npm run dev          # http://localhost:5173
npx tsc -b           # tipos
npx vitest run       # pruebas (src/lib/lib.test.ts)
npx oxlint src       # lint
BASE_PATH=/Ajedrez-App/ npx vite build   # build como en GitHub Pages
```

## Publicación

- Cada push a `main` publica en GitHub Pages (`.github/workflows/pages.yml`). `BASE_PATH` debe coincidir con el nombre del repositorio respetando mayúsculas (`/Ajedrez-App/`).
- Antes de publicar: tipos, pruebas, lint y una revisión en navegador con Playwright en viewport de iPhone 17 (402x874), modo día y noche, comprobando que nada se sale de la pantalla (`document.documentElement.scrollWidth` igual al ancho).
- En móvil, las pantallas de análisis y juego usan diseño fijo entre la zona segura superior y las barras inferiores (`--nav-h`, `--controls-h`, `--safe-*`).

## Avisos

- No usar `pkill -f` ni `pgrep -f` en este entorno: matan la propia terminal. Usar `ps aux | grep … | awk` y `kill`.
- En `useEffect`, nunca devolver un valor que no sea una función de limpieza.
- Desde el entorno en la nube no hay acceso a chess.com ni a lichess.org: probar la importación con datos simulados.
