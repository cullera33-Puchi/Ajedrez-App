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
| Vistas | `src/views/` (Home, Training, Play, Games, Analysis, Puzzles, Learn, Lessons, Openings, Scan, Progress) |
| Bots | `src/lib/bots.ts` (nivel de 250 a 2000 de 50 en 50, `makeBot`) |
| Análisis | `src/lib/analysis.ts`, `src/lib/engine.ts`, `src/lib/background.ts` |
| Problemas | `src/components/PuzzleSolver.tsx` y `src/lib/usePuzzlePlay.ts` (resolver un problema: lo comparten Problemas y Entrenar), `src/lib/puzzles.ts` (nivel tipo Elo), `src/lib/myPuzzles.ts` (tus errores con repaso espaciado), `src/lib/puzzleLog.ts` (histórico por día) |
| Recomendaciones | `src/lib/recommend.ts` (solo partidas de Chess.com y Lichess, nunca las de bots) |
| Importación | `src/lib/chesscom.ts`, `src/lib/lichess.ts`, `src/lib/pgnImport.ts` |
| Escáner | `src/lib/scan/` (detección del tablero, siluetas, plantillas en `templates.json`), `src/views/Scan.tsx`. Las plantillas se regeneran con `scripts/build-piece-templates.ts` a partir de los SVG de `lichess-org/lila/public/piece` |
| Variantes | `src/components/EngineLines.tsx` y la lógica de `variation` en `src/views/Analysis.tsx` |
| Progreso | `src/lib/progress.ts`, `src/views/Progress.tsx` |
| Lecciones | `src/lib/lessons.ts`, `src/views/Lessons.tsx` |
| Valoraciones de bots | `src/lib/botFeedback.ts` (texto para pegar a Claude) |
| Aperturas | `src/lib/openings.ts` (árbol, revisión, repertorio, repasos), `src/views/Openings.tsx` |
| Problemas sin conexión | `scripts/build-puzzle-pack.mjs` (se ejecuta en el workflow de Pages con la base de Lichess), `src/lib/puzzlePack.ts`. `public/puzzles/` no se versiona |
| Material y repaso en partida | `src/lib/playView.ts` (`materialInfo`: capturas y ventaja; `positionAt`; `useMoveBrowser`: repaso que vuelve a la posición actual con cada jugada nueva), `src/components/PlayExtras.tsx` (`Captured` con las figuras de chessground, `PlayNav`). Lo usan Play y PlayOnline. Opciones `confirmMove` y `premove` (Lichess) y `autoQueen` (bots y Lichess); `Board` acepta `premove` y avisa con `onMove(from, to, premove)`. `src/lib/wakeLock.ts` mantiene la pantalla encendida durante la partida. Iconos de acciones en `src/components/GameIcons.tsx` |
| Juego online | `src/lib/lichessAuth.ts` (OAuth PKCE y token personal), `src/lib/lichessPlay.ts` (Board API, flujos NDJSON con reconexión), `src/views/PlayOnline.tsx`, `src/components/LiveLock.tsx` (bloqueo del análisis durante la partida) |
| Entrenamiento de hoy | `src/lib/training.ts` (plan del día, racha, momentos del repaso guiado), `src/views/Training.tsx` (sesión y repaso guiado), `PuzzleSolver`. Desde el análisis, *Repaso guiado* abre `entreno` con `review` en el estado de navegación; la apertura y la lección se abren en Aprender con `learnTarget` y vuelven al entrenamiento |
| Importación automática | `src/lib/autoImport.ts` (al abrir y al volver tras 30 minutos; solo si ya se importó a mano; `autoImportLast` en `DEVICE_ONLY`), `importLichessNew` en `src/lib/lichess.ts` |
| Piezas colgadas | `src/lib/hanging.ts` (capturas que ganan material y mate en una): avisos en las partidas contra bots (`hangingHelp`) y ejercicio de visión |
| Tiempo | `src/lib/clock.ts` (relojes `%clk` del PGN; Lichess se importa con `clocks=true`), `timing` en `AnalysisSummary` (los antiguos se completan con `backfillTiming`) |
| Resumen semanal | `src/lib/weekly.ts`, `src/components/WeeklyCard.tsx` |
| Tiempo de juego | `src/lib/playTime.ts` (contador del tiempo activo en las pantallas de `PLAY_VIEWS` de `App.tsx`, salvo partida online; duración de las partidas online por su reloj; meta `dailyGoal` y racha de días con la meta cumplida), `src/components/PlayTimeCard.tsx` en Inicio y Progreso. `activityTime` guarda segundos por dispositivo (`deviceId`, en `DEVICE_ONLY`) y día, y se fusiona con el mayor en `MERGERS`. No confundir con `src/lib/activity.ts` (motor ocupado) |
| Visión del tablero | `src/lib/vision.ts` (mejores marcas `visionBest`, con regla en `MERGERS`), `src/views/Vision.tsx` (dentro de Aprender, como Lessons y Openings). `Board` acepta `onSelect` y `coordinates` |
| Registro de errores | `src/lib/log.ts` (`log`, `logError`, `logWarn`, `redact`; `appLog` en `DEVICE_ONLY`; versión con `__APP_VERSION__`), `src/components/LogCard.tsx` en Inicio, `src/components/ErrorBoundary.tsx` alrededor de cada pantalla en `App.tsx`. Los fallos nuevos que ya se muestran al usuario conviene apuntarlos también con `logWarn` o `logError` |
| Sincronización | `src/lib/sync.ts` (Supabase con fetch: auth y storage; con la huella `syncHash` no fusiona ni sube si nada ha cambiado, y solo un «no encontrado» cuenta como nube vacía), `src/components/SyncCard.tsx`, guía en `docs/SINCRONIZACION.md` |

Reglas de negocio a respetar:

- Las partidas contra bots se guardan y analizan, pero van separadas (apartado *Contra bots* en Partidas) y no cuentan en recomendaciones ni en el resumen de Inicio.
- Los problemas de *Mis errores* no cambian el nivel de problemas.
- Entrenamiento de hoy: el plan (`trainingPlan`) es propio de cada dispositivo (`DEVICE_ONLY`); la racha (`trainingDays`) y las partidas repasadas (`reviewedGames`) se fusionan por unión en `MERGERS`. Los problemas del tema cambian el nivel como en Problemas; los de tus errores, no.
- Volver atrás (`src/lib/nav.ts`): `useBackGuard` en partidas en marcha (bot, lección empezada) para que el gesto no saque de ellas; `useBackHandler` para cerrar algo abierto (variante, lección, apertura) antes de cambiar de pantalla.
- Gesto del borde izquierdo en el móvil (`src/components/MobileMenu.tsx`): abre el menú siguiendo el dedo; si hay un `useBackHandler` activo, en su lugar va atrás. En la app instalada en iOS no se toca el historial (el sistema mostraría una página gris al deslizar); el botón atrás del sistema en Android, Safari y PC usa una entrada de historial de reserva.
- Iconos: SVG con `currentColor` (`src/components/NavIcons.tsx` para la navegación del análisis, `src/components/MenuIcons.tsx` para el menú, de trazo fino), no caracteres ni emojis, que iOS pinta a color. Tinta noche (`eink-dark`) pone `data-theme="eink"` y además `data-ink="dark"`: hereda todas las reglas de tinta y solo cambia los colores; cualquier regla nueva de tinta con colores fijos necesita su pareja en `[data-ink='dark']`. En tinta no puede haber nada a color: los emojis que queden (avatares de los bots) llevan la clase `emoji` o `bot-avatar` y se ven en gris.
- El service worker (`public/sw.js`) usa `ignoreVary` al buscar en caché: sin eso la app no abre sin conexión. Precarga todas las partes recorriendo los JS de forma recursiva; si se añade una pantalla con `lazy`, no hace falta tocarlo. Su versión (`__BUILD__`) la pone el plugin `swVersion` de `vite.config.ts` en cada compilación: cada publicación instala uno nuevo y borra la caché anterior. El motor y el paquete de problemas van en una caché aparte (`ajedrez-static-v1`) para no descargarlos en cada publicación.
- Las pantallas se cargan con `lazy` desde `src/App.tsx` (objeto `VIEWS`) y se precargan en segundo plano. Una pantalla no debe importar otra (rompe la división); lo compartido va a `src/lib/`.
- Motor: `evaluate(fen, depth, multipv, tag)`. Con `tag`, una búsqueda nueva sustituye a la anterior de la misma etiqueta (se usa en las líneas del motor). Tras un `await` al motor, comprobar que la pantalla sigue en el mismo estado antes de aplicar el resultado.
- Partidas: `mergeGames` evita duplicados por enlace (la API gana al PGN). Las partidas contra Stockfish de Lichess llevan `source: 'bot'`. Para «solo partidas reales» usar `isOnlineGame` (`src/lib/progress.ts`).
- Fusión de copias (`mergeLocal` en `src/lib/backup.ts`): todo dato de progreso nuevo en localStorage necesita su regla en `MERGERS`; si no, solo se copia cuando el otro dispositivo no lo tiene.
- Entrenador local: solo acepta peticiones JSON del mismo origen (`checkSameOrigin` en `server/coach.ts`).

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
- En móvil (hasta 800 px) no hay barra de pestañas: el menú es un panel lateral que se abre deslizando desde el borde izquierdo (`src/components/MobileMenu.tsx`), sin botón fijo. `--nav-h` vale 0 y las barras inferiores (análisis y partidas) ocupan todo el ancho. El análisis se desplaza con la página entera y el tablero queda fijo arriba con `position: sticky` (un desplazamiento interior se bloqueaba en el iPhone); por eso `html` y `body` usan `overflow-x: clip` y no `hidden`, que anula el sticky. La pantalla de juego usa diseño fijo entre la zona segura superior y la barra de controles (`--controls-h`, `--safe-*`). En el análisis, la flecha de la mejor jugada y las 3 líneas del motor empiezan ocultas y se despliegan con los botones de la tarjeta de la jugada. En PC y tablet se mantiene la barra lateral.

## Avisos

- No usar `pkill -f` ni `pgrep -f` en este entorno: matan la propia terminal. Usar `ps aux | grep … | awk` y `kill`.
- En `useEffect`, nunca devolver un valor que no sea una función de limpieza.
- Desde el entorno en la nube no hay acceso a chess.com, lichess.org, supabase.co ni a github.io: probar con datos y servidores simulados (rutas de Playwright). El resultado del paquete de problemas se lee en las anotaciones del workflow (`gh api repos/cullera33-Puchi/Ajedrez-App/check-runs/<job>/annotations`).
- Las copias de seguridad nunca incluyen datos propios del dispositivo: sesión de sincronización, token de Lichess, partida online en curso ni partida a medias contra bot (`DEVICE_ONLY` en `src/lib/backup.ts`).
- Código de acceso (`src/components/PinGate.tsx`, `src/lib/pin.ts`): 4 cifras guardadas como secreto `APP_PIN` en GitHub (desde aquí no se pueden leer ni cambiar los secretos). `vite.config.ts` incluye solo su huella PBKDF2; sin `APP_PIN` no se pide código. El dispositivo lo recuerda en `pinOk`, que está en `DEVICE_ONLY`. Es una barrera sencilla, no una protección fuerte.
- Barra de estado del iPhone: `apple-mobile-web-app-status-bar-style` es `default` (con `black-translucent`, iOS 26 difumina lo que queda bajo la hora). Su color sale de `theme-color`, que `applyTheme` (`src/lib/theme.ts`) iguala al fondo del tema elegido.
- Flujos de Lichess (`keepStreaming`): cada conexión tiene su cancelador; se reabre si pasan 20 s sin datos o al volver a la app.
- Juego limpio: mientras haya una partida online sin terminar (`isLiveActive`), el análisis y el escáner se bloquean.
