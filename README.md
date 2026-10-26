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
2. **Mis partidas**: pulsa *Importar de Chess.com* y elige una partida.
3. **Análisis**: Stockfish analiza la partida en tu navegador. Cuando termine, pulsa *Analizar la partida con Claude* o *Abrir en claude.ai*.

## Entrenador IA (Claude)

Stockfish aporta las evaluaciones y las mejores jugadas, y Claude las convierte en explicaciones para tu nivel: resumen, momentos clave con lo que deberías haberte preguntado antes de mover, comentarios por jugada, lecciones y temas de problemas para practicar. También puedes preguntarle por cualquier posición del tablero.

Hay tres formas de conectar con Claude. Ninguna obliga a pagar aparte si tienes plan Pro o Max.

| Modo | Cómo funciona | Coste |
|---|---|---|
| **Con tu plan (recomendado)** | La app usa Claude Code instalado en tu PC, con la sesión de tu cuenta Pro o Max. El informe y las respuestas aparecen dentro de la app | Incluido en tu plan; cuenta dentro de sus límites de uso |
| **Abrir en claude.ai** | Copia la partida y el análisis al portapapeles y abre claude.ai en una pestaña. Pegas con Ctrl+V y sigues la conversación allí | Incluido en tu plan |
| Con clave de API | La app llama a la API de Anthropic con una clave de console.anthropic.com | Pago por uso, aparte del plan |

### Instalar Claude Code (una sola vez, para el modo plan)

1. Abre **PowerShell** y ejecuta:

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

2. Cierra y vuelve a abrir PowerShell. Ejecuta `claude`: se abre el navegador para iniciar sesión con tu cuenta de Claude. Cuando ponga *Login successful*, cierra esa terminal.
3. Vuelve a abrir la app con `iniciar.bat`. En **Inicio**, la tarjeta *Entrenador IA* debe mostrar *Listo*.

Instrucciones oficiales: https://code.claude.com/docs/en/setup

Detalles del modo plan:

- La app quita la variable `ANTHROPIC_API_KEY` al llamar a Claude Code, para que use siempre la sesión del plan y no facture por API.
- Usa el modelo Opus, sin herramientas, sin servidores MCP y sin tus ajustes personales de Claude Code. Las conversaciones se guardan en `%USERPROFILE%\.ajedrez-app\claude`.
- Un informe tarda alrededor de un minuto. Puedes ver tu consumo del plan con `/usage` dentro de Claude Code.

## En el móvil

Hay dos formas. Las dos funcionan en Android y en iPhone.

### 1. Versión web (en cualquier sitio)

Abre **https://cullera33-puchi.github.io/ajedrez-app/** en el navegador del móvil e instálala como app:

- **Android (Chrome)**: menú de los tres puntos y luego *Añadir a pantalla de inicio* o *Instalar aplicación*.
- **iPhone (Safari)**: botón *Compartir* y luego *Añadir a pantalla de inicio*.

Incluye partidas de Chess.com y Lichess, análisis con Stockfish en el propio móvil, problemas y la parte de Aprender. Abre también sin conexión (los problemas de iniciación y las partidas ya importadas). Para el entrenador, el botón **Abrir en claude.ai** copia la partida y el análisis y abre Claude (la app si la tienes instalada). Pegas el texto y la conversación sigue allí, dentro de tu plan.

Los datos se guardan en cada dispositivo: el móvil y el PC no comparten partidas ni nivel de problemas.

La web se actualiza sola en cada cambio que se sube a GitHub (`.github/workflows/pages.yml`).

### 2. Desde el PC, en casa (con el entrenador integrado)

1. En el PC, doble clic en **`iniciar-movil.bat`**. Si Windows pregunta por el firewall, permite el acceso en redes privadas.
2. En la ventana aparece una dirección *Network*, del tipo `http://192.168.1.20:5173`. Ábrela en el móvil, conectado a la misma wifi.

Así el móvil usa el entrenador integrado con tu plan, a través de Claude Code en el PC. El modo del entrenador y la clave solo se pueden cambiar desde el propio PC.

## Qué incluye

| Pantalla | Funcionalidad |
|---|---|
| Inicio | Usuarios de Chess.com y Lichess, ratings actuales, conexión del entrenador IA, próximos pasos y resumen de resultados |
| Mis partidas | Importación de Chess.com (últimos 2 meses) y Lichess (últimas 40), pegar PGN y dos partidas de ejemplo |
| Análisis | Stockfish 19 en el navegador, barra y gráfico de evaluación, precisión, clasificación de cada jugada, comentarios automáticos, informe y preguntas al entrenador IA, botón para abrir en claude.ai |
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
server/         API local del entrenador (plugin de Vite): Claude Code con el plan o API de Anthropic
shared/         instrucciones del entrenador, comunes al servidor y al navegador
scripts/        copia del motor a public/engine
docs/capturas/  capturas de pantalla
```

### Criterios de análisis

- Probabilidad de ganar y precisión con las fórmulas públicas de Lichess.
- Clasificación por caída de probabilidad de ganar del jugador que mueve: 5 puntos o más es imprecisión, 10 es error y 15 es error grave.
- Profundidad configurable: rápido (10), normal (12) y profundo (16).
- Notación española en pantalla (C, A, T, D, R).

### Llamadas a Claude

- Modo plan: `claude -p` con `--output-format json`, `--model opus`, `--json-schema` para el informe y `--resume` para continuar las preguntas (ver `server/claudeCode.ts`).
- Modo API: SDK de Anthropic con salida estructurada, razonamiento adaptativo, caché del contexto y reintento en otro modelo si Claude declina (`fallbacks: "default"`).
- El modo se guarda en `.env.local` (`COACH_PROVIDER=plan` o `api`).

## APIs externas

- **Chess.com**: API pública de solo lectura. No hay login; basta el nombre de usuario.
- **Lichess**: API abierta para partidas, perfil y problemas.
- **Claude**: a través de Claude Code (tu plan), de claude.ai o de la API de Anthropic.

## Licencias

Stockfish y chessground son GPL-3.0. Para uso personal no hay restricción.
