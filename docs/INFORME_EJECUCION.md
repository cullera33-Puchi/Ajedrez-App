# Informe de la ejecución en segundo plano

Fecha: noche del 26 al 27 de octubre de 2026. Los seis cambios del paquete están terminados, probados y publicados en https://cullera33-puchi.github.io/Ajedrez-App/.

Para ver los cambios en el móvil, cierra la app del todo y vuelve a abrirla (si no cambia, una segunda vez).

El informe de la ejecución anterior (25 y 26 de octubre) queda en el historial de git.

## Resumen

| # | Cambio | Estado | Dónde verlo |
|---|---|---|---|
| 0 | La app solo usa Claude con tu plan | Hecho | **Inicio**, tarjeta *Entrenador IA* (en el PC) |
| 1 | Explorar variantes en el análisis | Hecho | **Análisis**: mueve cualquier pieza en el tablero |
| 2 | Escanear una posición desde una captura | Hecho | **Partidas**, botón *Escanear captura* |
| 3 | Panel de progreso de partidas | Hecho | **Inicio**, *Mira tu progreso*; **Partidas**, *Ver tu progreso* |
| 4 | Lecciones de finales elementales | Hecho | **Aprender**, *Lecciones prácticas* |
| 5 | Valorar el bot al terminar | Hecho | **Jugar**, al acabar cada partida |

## Qué hay de nuevo, en detalle

### 0. Sin ningún coste de IA

- Eliminado el modo de clave de API y la librería de Anthropic. La app ya no puede llamar a ningún servicio de pago.
- El entrenador funciona solo de dos formas: con Claude Code y tu plan (en el PC) o con el botón *Abrir en claude.ai*.
- Si Claude Code estuviera configurado para facturar por API, la app se niega a usarlo y explica cómo entrar con la cuenta del plan.

### 1. Explorar variantes

- En el análisis puedes mover cualquier pieza. Si la jugada coincide con la partida, avanzas en la partida; si no, se abre una variante.
- La tarjeta *Variante* muestra las jugadas, la evaluación y las tres mejores líneas de Stockfish. Al tocar una línea se juega su primera jugada.
- Los botones de la barra se mueven por la variante. *Volver a la partida* la cierra.
- Nueva casilla *Líneas del motor*: muestra las tres mejores jugadas en cualquier posición de la partida.

### 2. Escanear posición

- Eliges una captura de pantalla (en el iPhone, desde Fotos). En el PC también se puede pegar con Ctrl+V.
- La app localiza el tablero y reconoce las piezas en el propio dispositivo, sin conexión y sin IA.
- Para reconocer piezas de estilos distintos usa la forma de las piezas de 22 juegos libres de Lichess. Solo se guardan rasgos de forma, no las imágenes.
- Las casillas dudosas se marcan en naranja. Las corriges tocando la casilla con la pieza elegida en la paleta. Además, la app aprende de tus correcciones: con tus capturas de Chess.com acertará cada vez más.
- Si la última jugada está resaltada en la captura, deduce a quién le toca. Si no, lo indicas tú.
- Si el tablero no se detecta bien, *Ajustar recuadro* permite marcarlo con el dedo.
- *Analizar posición* la abre en el análisis, donde puedes explorar variantes. Queda guardada en *Mis partidas*, apartado *Otras*.
- Para fotos de libros o de un tablero real: *Abrir en claude.ai* copia la petición; pegas la petición, adjuntas la foto y copias la FEN que te devuelva Claude.

### 3. Tu progreso

- Solo con partidas de Chess.com y Lichess, nunca las de bots. Periodos de 3 meses, 12 meses o todo.
- Partidas, porcentaje de victorias y precisión media.
- Gráfico de tu rating por ritmo (rápidas, blitz…). Al tocar un punto ves la partida.
- Precisión y errores graves por semana.
- Lo que más fallas, con acceso directo a practicar cada tema.
- Aperturas con peor y mejor resultado, agrupadas por familia y color, y un botón para revisar tu última derrota con la peor.

### 4. Lecciones prácticas

Seis lecciones contra Stockfish, que defiende lo mejor posible:

| Lección | Objetivo |
|---|---|
| Mate con dos torres | La escalera |
| Mate con dama y rey | Encerrar sin ahogar y rematar con el rey |
| Mate con torre y rey | Oposición y jaque lateral |
| La regla del cuadrado | Alcanzar un peón con el rey |
| Rey y peón: ganar | Coronar con el rey por delante |
| Rey y peón: defender | Hacer tablas con negras |

Cada lección tiene la explicación paso a paso, pista, la distancia al mate que ve Stockfish y tu mejor marca. Si fallas (ahogado, pieza perdida, demasiadas jugadas), te explica por qué.

### 5. Valorar el bot

- Al terminar una partida contra un bot: *Fácil*, *Adecuado* o *Difícil*, con una nota opcional.
- En la pantalla de elegir rival, *Copiar para Claude* copia todas tus valoraciones como texto. Pégalo en la conversación conmigo y ajusto los bots (registro en `docs/AJUSTE_BOTS.md`).

## Cómo se ha probado

- **Pruebas automáticas**: 62, todas correctas. Nuevas: escáner (FEN, enroques, siluetas), progreso (resultados, aperturas, semanas), valoraciones y familias de aperturas.
- **Escáner**:
  - capturas simuladas de estilo Chess.com, Lichess y tablero azul, en móvil y en escritorio, con coordenadas y la última jugada resaltada;
  - con juegos de piezas que el escáner no conocía (como pasará con los de Chess.com), acierta el 99,3 % de las casillas y el tablero en el 100 % de los casos;
  - el turno se deduce bien en el 98 % de las capturas con la última jugada resaltada.
- **Lecciones**: las seis posiciones comprobadas con Stockfish a profundidad 22, que confirma que las ganadas son ganadas y la de defensa es tablas. La regla del cuadrado se ha jugado entera en el navegador.
- **Progreso**: importación simulada de 80 partidas de Chess.com en cuatro meses, con análisis automático.
- **Variantes**: jugada fuera de la partida, líneas del motor, navegación por la variante y vuelta a la partida.
- **Revisión final**: todas las pantallas en cinco formatos (móvil de noche, móvil de día, tablet, escritorio y tinta electrónica), sin errores ni elementos que se salgan de la pantalla.

## Lo que conviene que pruebes tú

1. **Escanear una captura real de Chess.com**: haz una captura de una partida en la app de Chess.com y escanéala. Si alguna pieza sale mal, corrígela y pulsa *Analizar*: así aprende tu estilo de piezas. Dime qué tal.
2. **Mover piezas en el análisis** de una de tus partidas para ver qué habría pasado con otra jugada.
3. **Tu progreso**, desde Inicio, con tu historial real.
4. **La lección de dos torres** y la de dama.
5. **Valorar un par de bots** y pasarme el texto con *Copiar para Claude*.

## Incidencias y notas

- No ha habido bloqueos del sistema de permisos.
- Desde aquí no hay acceso a chess.com, así que el escáner se ha probado con capturas simuladas, no con capturas reales de su app. Por eso el aprendizaje con tus correcciones es importante.
- La rama temporal `diagnostico-chesscom` sigue en GitHub; hay que borrarla desde la web (*Branches*).

## Siguientes pasos propuestos

Detalle en `docs/HOJA_DE_RUTA.md`. Lo más valioso que queda:

1. Ajustar los bots con tus valoraciones (1.8).
2. Jugar online en Lichess (1.5), mejor contigo porque necesita tu cuenta.
3. Jugar contra un bot desde una posición escaneada o desde una lección.
