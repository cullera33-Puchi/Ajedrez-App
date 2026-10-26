# Ajedrez App

Aplicación web para aprender ajedrez: análisis de partidas con Stockfish, problemas tácticos y conexión con Chess.com y Lichess. Uso personal, pensada para un jugador principiante (500 en Chess.com) y en español.

## Arranque

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias
npm run build      # versión de producción en dist/
```

`npm run dev` y `npm run build` copian antes el motor Stockfish (WebAssembly) a `public/engine`.

## Qué incluye esta primera versión

| Pantalla | Funcionalidad |
|---|---|
| Inicio | Usuarios de Chess.com y Lichess, ratings actuales, próximos pasos y resumen de resultados |
| Mis partidas | Importación de Chess.com (últimos 2 meses) y Lichess (últimas 40), pegar PGN y dos partidas de ejemplo |
| Análisis | Stockfish 19 en el navegador, barra y gráfico de evaluación, precisión por jugador, clasificación de cada jugada, comentario en español con la mejor alternativa y momentos clave |
| Problemas | Set de iniciación de 18 problemas verificados con Stockfish (sin conexión) o problemas de Lichess por tema y dificultad, con nivel propio tipo Elo |
| Aprender | Valor de las piezas, principios de apertura y acceso a práctica por temas |

Los datos (partidas, análisis y nivel en problemas) se guardan en el `localStorage` del navegador.

## Estructura

```
src/
  lib/          lógica sin interfaz: APIs, motor, análisis, problemas y almacenamiento
  components/   tablero (chessground), barra y gráfico de evaluación, lista de jugadas
  views/        una vista por pantalla
scripts/        copia del motor a public/engine
docs/capturas/  capturas de pantalla de la versión actual
```

## Criterios de análisis

- Probabilidad de ganar y precisión con las fórmulas públicas de Lichess.
- Clasificación por caída de probabilidad de ganar del jugador que mueve: 5 puntos o más es imprecisión, 10 es error y 15 es error grave.
- Profundidad configurable: rápido (10), normal (12) y profundo (16).
- Notación española en pantalla (C, A, T, D, R).

## APIs externas

- **Chess.com**: API pública de solo lectura. No hay login; basta el nombre de usuario. Las peticiones van en serie para evitar bloqueos.
- **Lichess**: API abierta para partidas, perfil y problemas (`/api/puzzle/next`). Sin login en esta versión.

## Licencias

Stockfish y chessground son GPL-3.0. Para uso personal no hay restricción. Si algún día se distribuye como producto cerrado, habría que revisarlo.

## Próximos pasos propuestos

1. Problemas generados a partir de tus propios errores graves.
2. Explorar variantes en el tablero de análisis y repetir la jugada correcta.
3. Login con Lichess (OAuth) para sincronizar el historial de problemas.
4. Lecciones interactivas de mates básicos y finales elementales.
