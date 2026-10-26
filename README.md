# Ajedrez App

Aplicación web para aprender ajedrez: análisis de partidas con Stockfish, comentarios de un entrenador con IA (Claude), problemas tácticos y conexión con Chess.com y Lichess. Uso personal, pensada para un jugador principiante (500 en Chess.com) y en español.

## Instalación en Windows (primera vez)

1. Instala **Node.js** (versión LTS) desde https://nodejs.org. Acepta las opciones por defecto.
2. Instala **Git** desde https://git-scm.com/download/win, o descarga el proyecto como ZIP desde GitHub (botón *Code*, opción *Download ZIP*) y descomprímelo.
3. Si usas Git, abre una terminal (PowerShell) y ejecuta:

   ```powershell
   git clone https://github.com/cullera33-Puchi/ajedrez-app.git
   ```

4. Entra en la carpeta `ajedrez-app` y haz doble clic en **`iniciar.bat`**. La primera vez instala las dependencias (un par de minutos). Después se abre el navegador en `http://localhost:5173`.

Para cerrar la app, cierra la ventana negra de la terminal. Para volver a abrirla, doble clic otra vez en `iniciar.bat`.

En macOS o Linux: `./iniciar.sh`.

## Primeros pasos dentro de la app

1. **Inicio**: escribe tu usuario de Chess.com y pulsa *Guardar y actualizar*.
2. **Inicio, Entrenador IA**: pega tu clave de la API de Anthropic (ver más abajo).
3. **Mis partidas**: pulsa *Importar de Chess.com* y elige una partida.
4. **Análisis**: Stockfish analiza la partida en tu navegador. Cuando termine, pulsa *Analizar la partida con Claude* y hazle preguntas sobre cualquier posición.

## Entrenador IA (Claude)

El entrenador usa Claude (modelo `claude-opus-5-5`) a partir de los datos de Stockfish: el motor aporta las evaluaciones y las mejores jugadas, y Claude las convierte en explicaciones para tu nivel.

- **Informe de la partida**: resumen, momentos clave con lo que deberías haberte preguntado antes de mover, comentarios en las jugadas importantes, lecciones y temas de problemas para practicar (con acceso directo al entrenador de problemas).
- **Preguntas**: sobre la posición que estés mirando en el tablero. La conversación se guarda por partida.

**Clave de la API.** Necesitas una cuenta en https://console.anthropic.com con saldo, y crear una clave en *Settings, API Keys*. Es un servicio de pago por uso, independiente de la suscripción a Claude.ai. La clave se guarda en el archivo `.env.local` de la carpeta del proyecto, que no se sube a GitHub, y nunca llega al navegador: la app la usa desde un pequeño servidor local que arranca con `iniciar.bat`.

**Coste orientativo**: unos 0,10 a 0,30 USD por informe de partida y unos céntimos por pregunta. Depende de la longitud de la partida y de cuánto razone el modelo.

## Qué incluye

| Pantalla | Funcionalidad |
|---|---|
| Inicio | Usuarios de Chess.com y Lichess, ratings actuales, clave del entrenador IA, próximos pasos y resumen de resultados |
| Mis partidas | Importación de Chess.com (últimos 2 meses) y Lichess (últimas 40), pegar PGN y dos partidas de ejemplo |
| Análisis | Stockfish 19 en el navegador, barra y gráfico de evaluación, precisión, clasificación de cada jugada, comentarios automáticos, informe y preguntas al entrenador IA |
| Problemas | Set de iniciación de 18 problemas verificados con Stockfish (sin conexión) o problemas de Lichess por tema y dificultad, con nivel propio tipo Elo |
| Aprender | Valor de las piezas, principios de apertura y práctica por temas |

Los datos (partidas, análisis, informes y nivel en problemas) se guardan en el navegador.

## Para desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 (incluye la API local del entrenador)
npm test           # pruebas unitarias
npm run build      # versión de producción en dist/
npm run preview    # sirve dist/ con la API local del entrenador
```

`npm run dev` y `npm run build` copian antes el motor Stockfish (WebAssembly) a `public/engine`.

### Estructura

```
src/
  lib/          lógica sin interfaz: APIs, motor, análisis, problemas, contexto para Claude
  components/   tablero, barra y gráfico de evaluación, lista de jugadas, panel del entrenador
  views/        una vista por pantalla
server/         API local del entrenador (plugin de Vite que llama a Claude)
scripts/        copia del motor a public/engine
docs/capturas/  capturas de pantalla
```

### Criterios de análisis

- Probabilidad de ganar y precisión con las fórmulas públicas de Lichess.
- Clasificación por caída de probabilidad de ganar del jugador que mueve: 5 puntos o más es imprecisión, 10 es error y 15 es error grave.
- Profundidad configurable: rápido (10), normal (12) y profundo (16).
- Notación española en pantalla (C, A, T, D, R).

### Llamadas a Claude

- `POST /api/coach/report`: informe con salida estructurada (JSON Schema), razonamiento adaptativo y esfuerzo `high`.
- `POST /api/coach/ask`: preguntas con esfuerzo `medium`. El contexto de la partida va en caché y el historial se reenvía sin modificar.
- Ambas activan el reintento automático en otro modelo si Claude declina la petición (`fallbacks: "default"`).

## APIs externas

- **Chess.com**: API pública de solo lectura. No hay login; basta el nombre de usuario.
- **Lichess**: API abierta para partidas, perfil y problemas.
- **Anthropic**: API de Claude, con tu clave.

## Licencias

Stockfish y chessground son GPL-3.0. Para uso personal no hay restricción.
