# Informe de la ejecución en segundo plano

Fecha: 26 de octubre de 2026, por la noche. Las ocho tareas del paquete están terminadas, probadas y publicadas en https://cullera33-puchi.github.io/Ajedrez-App/.

Para ver los cambios en el móvil, cierra la app del todo y vuelve a abrirla (si no cambia, una segunda vez).

## Resumen

| # | Tarea | Estado | Dónde verlo |
|---|---|---|---|
| 1 | Bots de tu nivel y elegir pieza al coronar | Hecho | Pestaña **Jugar** |
| 2 | Almacenamiento en IndexedDB e importación completa de Chess.com | Hecho | **Partidas**, *Importar de Chess.com* |
| 3 | Análisis en segundo plano | Hecho | **Partidas**, tarjeta *Análisis automático* |
| 4 | Problemas con tus propios errores y repaso espaciado | Hecho | **Problemas**, origen *Mis errores*; **Inicio**, *Repasa tus errores* |
| 5 | Repetir la jugada correcta | Hecho | **Análisis**, botón *Inténtalo tú* en tus errores |
| 6 | Copia de seguridad entre dispositivos | Hecho | **Inicio**, tarjeta *Copia de seguridad* |
| 7 | Enlaces a cursos y libros por tema | Hecho | **Análisis**, **Problemas** y **Aprender** |
| 8 | Retoques: modo tinta electrónica, tablero en tablets y mantenimiento | Hecho | **Inicio**, *Apariencia*, opción *Tinta* |

## Qué hay de nuevo, en detalle

### 1. Jugar contra bots

- Seis rivales: Lucía (400), Bruno (600), Marta (800), Diego (1000, atacante), Elena (1200, sólida) y El Profesor (1500).
- Cada bot pide a Stockfish varias jugadas candidatas y elige entre ellas con más o menos acierto según su nivel. De vez en cuando se despista y juega una peor, como un humano de ese nivel.
- Puedes elegir color (blancas, negras o al azar), deshacer jugadas, ofrecer tablas (el bot acepta si no va ganando) y rendirte.
- La partida en curso se guarda: si cierras la app, sigue donde la dejaste.
- Al terminar, la partida se guarda en *Mis partidas* con el origen *Bot*. Tiene el mismo análisis, recomendaciones y entrenador que las de Chess.com, y se suma a tu récord contra cada bot.
- Al coronar un peón aparece la elección de pieza.

### 2. Historial completo de Chess.com

- La primera importación descarga todos los meses de tu historial, con una barra de progreso. Las siguientes solo descargan los meses nuevos y los dos últimos.
- Los datos pasan a IndexedDB, que admite miles de partidas. Lo que ya tenías se migra solo, sin perder nada.
- La lista de partidas se muestra de 50 en 50, con un botón *Ver más*.

### 3. Análisis automático

- Con la app abierta, analiza tus partidas pendientes una a una, de la más reciente a la más antigua.
- Se pausa cuando juegas contra un bot, cuando analizas una partida a mano o cuando la app no está en pantalla. También puedes pausarlo desde *Mis partidas*.
- Con cada partida analizada se actualizan las recomendaciones y las estadísticas.

### 4. Problemas con tus errores

- De cada partida analizada se sacan hasta cuatro posiciones donde fallaste. Solo cuentan las que tienen una solución clara: Stockfish exige 1,5 peones de ventaja sobre la segunda mejor jugada, o un mate.
- Al resolverlas, la app te recuerda lo que jugaste en la partida y lo que era mejor.
- Repaso espaciado: si aciertas, la posición vuelve al cabo de 1, 3, 8… días; si fallas, en unos minutos. No afectan a tu nivel de problemas.

### 5. Inténtalo tú

- En tus imprecisiones y errores, el botón *Inténtalo tú* vuelve a la posición anterior para que busques la buena.
- Se acepta la mejor jugada, cualquier mate o cualquier jugada que Stockfish considere igual de buena. Si fallas, te dice cómo queda la evaluación. Hay pista y solución.

### 6. Copia de seguridad

- *Guardar copia* crea un archivo con partidas, análisis, problemas propios, nivel, récord contra bots, informes de Claude y ajustes. En el móvil, *Compartir* permite enviarlo por AirDrop o guardarlo en Archivos.
- *Importar copia* fusiona con lo que ya hay y no borra nada.
- Uso típico: guardar en el móvil, pasar el archivo al PC e importarlo allí, o al revés.

### 7. Aprender más por tema

- Junto a cada tema recomendado: *Entrenar en Lichess* (problemas de ese tema), *Vídeos* (YouTube) y *Libros y cursos* (búsqueda en Google). Las búsquedas van preparadas en español y para principiantes.

### 8. Retoques

- Apariencia *Tinta* para la BOOX: blanco y negro, alto contraste, tablero blanco y gris y sin animaciones.
- Corregido: en pantallas de entre 800 y 1000 píxeles de ancho (tablets o ventanas medianas), el tablero se salía por la derecha.
- Acciones de GitHub actualizadas y avisos del código resueltos.

## Cómo se ha probado

- **Pruebas automáticas**: 47, todas correctas. Cubren la elección de jugadas de los bots, el guardado de partidas, la importación incremental, la migración de datos, el repaso espaciado, la copia de seguridad y los enlaces.
- **Pruebas en navegador** (iPhone 17 simulado, tablet de 820 px y escritorio):
  - partida completa contra Lucía: jugar, deshacer, recargar y continuar, rendirse y analizar;
  - migración de datos de la versión anterior;
  - análisis automático de tres partidas;
  - generación y resolución de un problema propio;
  - *Inténtalo tú* con un fallo y un acierto;
  - copia guardada en un «dispositivo» e importada en otro;
  - modo Tinta.
- **Revisión final**: todas las pestañas en los cuatro formatos (móvil en día y en noche, tablet y escritorio), sin errores ni elementos que se salgan de la pantalla.

## Lo que conviene que pruebes tú

1. **Importar tu historial completo de Chess.com** con *anriqui*. Está probado con datos simulados, porque desde aquí no hay acceso a chess.com. Puede tardar un poco la primera vez.
2. **Jugar contra Lucía y Bruno** y decirme si su nivel te parece adecuado. Su fuerza es aproximada y se puede ajustar.
3. **Dejar la app abierta unos minutos** en *Mis partidas* para ver el análisis automático. Después, revisar *Mis errores* en Problemas.
4. **En la BOOX**, abrir la web y elegir *Tinta* en Inicio, *Apariencia*.
5. **Probar la copia de seguridad** del móvil al PC.

## Incidencias y notas

- No ha habido bloqueos del sistema de permisos en esta ejecución.
- Sigue en GitHub la rama temporal `diagnostico-chesscom`. Hay que borrarla desde la web de GitHub, en *Branches*.
- GitHub muestra dos avisos de versión de Node en piezas internas de sus propias acciones de publicación. No dependen de nosotros y la publicación funciona.
- Los problemas con tus errores se generan con la app abierta, a medida que se analizan las partidas. Con un historial grande, el análisis completo llevará varias sesiones.

## Siguientes pasos propuestos

Detalle en `docs/HOJA_DE_RUTA.md`. Lo más valioso que queda:

1. Jugar online en Lichess y sincronizar sus problemas (1.5 y 1.6). Mejor hacerlo contigo, porque necesita tu cuenta.
2. Panel de progreso (4.3).
3. Sincronización automática en la nube (2.2), si la copia manual se queda corta.
