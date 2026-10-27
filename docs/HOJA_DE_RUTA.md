# Hoja de ruta

Estado de las mejoras identificadas. Se actualiza en cada iteración.

Leyenda: **Hecho**, **Pendiente**, **Por analizar** (necesita definir el enfoque antes de programar).

## Hecho

| Mejora | Notas |
|---|---|
| Análisis de partidas con Stockfish en el navegador | Precisión, clasificación de jugadas, comentarios y momentos clave |
| Importación de Chess.com y Lichess | Usuario en la propia pantalla, errores con detalle técnico |
| Importación completa del historial de Chess.com (1.2) | Todos los meses la primera vez; después, solo lo nuevo. Con barra de progreso |
| Almacenamiento en IndexedDB (1.2) | Miles de partidas y análisis; migración automática desde versiones anteriores |
| Importación de archivo PGN | Admite el archivo con varias partidas que descarga Chess.com |
| Bots de tu nivel (1.1) | Nivel de 250 a 2000 de 50 en 50 puntos, con estilo equilibrado o atacante, en la pestaña *Jugar*. Récord por nivel y mejor victoria |
| Partidas contra bots separadas | En *Mis partidas*, apartados *Chess.com y Lichess*, *Contra bots* y *Otras*. Se analizan igual, pero no cuentan en las recomendaciones ni en el resumen de Inicio |
| Descartar una partida contra bot | Botón *Descartar*: sale sin guardar y sin sumar al récord |
| Explorar variantes (4.2) | En el análisis se mueve cualquier pieza; tarjeta de variante con las tres mejores líneas de Stockfish. Casilla *Líneas del motor* para cualquier posición |
| Escanear posición desde una captura (7.1) | Partidas, *Escanear captura*. Reconocimiento en el dispositivo, sin conexión ni IA; aprende de las correcciones. Fotos de libros con claude.ai |
| Panel de progreso de partidas (4.3) | Rating por ritmo, precisión por semana, temas más fallados y aperturas. Solo Chess.com y Lichess |
| Lecciones de finales elementales (4.4) | Aprender, *Lecciones prácticas*: seis lecciones contra Stockfish |
| Menú lateral en el móvil | La barra de pestañas pasa a un menú que se abre desde la izquierda, con el botón de abajo a la izquierda o deslizando desde el borde (el panel sigue al dedo). Sin pantalla gris al deslizar en el iPhone. En análisis gana unos 50 px de zona de jugadas. En PC y tablet, sin cambios |
| Revisión y optimización del código (27/10/2026) | 32 fallos corregidos (juego online, sincronización, motor, lecciones, duplicados de partidas, seguridad del entrenador); la app carga un 43 % menos al abrir |
| Jugar online en Lichess (1.5) | Jugar, *Online en Lichess*: buscar rival (rápidas y clásicas), Stockfish de Lichess por niveles y retos a amigos; análisis bloqueado durante la partida. Falta probarlo con tu cuenta |
| Tus aperturas (4.5, versión 1) | Aprender: las 5 más jugadas con cada color, línea habitual, revisión con Stockfish, lo que te juegan y práctica con repaso espaciado |
| Problemas sin conexión (1.6, parte sin conexión) | 5.493 problemas de Lichess de 400 a 1500, generados al publicar a partir de la base oficial (CC0) |
| Jugar desde cualquier posición (1.9) | Desde el escáner, el análisis, las lecciones y las aperturas; opción de máxima fuerza |
| Más lecciones (4.6) | Mate del pasillo, mate de la coz, oposición, Lucena y Philidor (once en total) |
| Sincronización automática (2.2) | Con Supabase gratuito; guía en `docs/SINCRONIZACION.md`. Falta que crees la cuenta |
| Volver atrás deslizando (5.10) | Gesto desde el borde izquierdo en la app del iPhone y botón atrás del sistema. No saca de una partida en marcha; en el análisis cierra antes la variante |
| Partida contra bot a medias | Se guarda sola; aviso en Inicio con *Continuar* y punto en la pestaña Jugar |
| Uso sin conexión completo | Corregida la caché para que la app abra sin red; el escáner y el motor también funcionan sin conexión |
| Valorar el bot al terminar (1.8) | Fácil, adecuado o difícil con nota; *Copiar para Claude* en Jugar |
| Evolución de los problemas (4.3, parte de problemas) | Problemas, *Tu evolución*: nivel por día, problemas hechos y acertados, dificultad media; periodos de 7, 30 y 90 días |
| Elegir pieza al coronar (5.4) | En las partidas contra bots; en los problemas se respeta la subpromoción |
| Análisis en segundo plano (1.3) | Analiza tus partidas pendientes mientras la app está abierta; se pausa al jugar o analizar a mano |
| Problemas con tus propios errores (1.4) | Origen *Mis errores* en Problemas, con repaso espaciado |
| Repetir la jugada correcta (4.1) | Botón *Inténtalo tú* en tus errores dentro del análisis |
| Copia de seguridad entre dispositivos (2.1) | Inicio, *Copia de seguridad*: guardar, compartir e importar fusionando |
| Enlaces a cursos y libros por tema (6.2, versión sencilla) | Entrenamiento de Lichess, vídeos y búsqueda de libros y cursos junto a cada tema recomendado |
| Entrenador con Claude | Solo con el plan: Claude Code en el PC o claude.ai (copiar y pegar). Sin claves de API ni servicios de pago. Plegado al final del análisis |
| Versión móvil instalable (PWA) en GitHub Pages | https://cullera33-puchi.github.io/Ajedrez-App/ |
| Ajustes de iPhone | Isla y zonas seguras, nada más ancho que la pantalla, sin zoom por doble toque |
| Análisis cómodo en el móvil | Tablero y jugada actual fijos; la lista sigue a la jugada actual; barras compactas |
| Colores tipo Chess.com con modo día y noche | Automático según el sistema o fijado a mano en Inicio, *Apariencia* |
| Modo tinta electrónica (1.7) | Apariencia *Tinta* para la BOOX: alto contraste, tablero blanco y gris, sin animaciones |
| Problemas recomendados según tus errores | Temas deducidos de tus errores y de los informes de Claude |
| Mantenimiento (5.5) | Acciones de GitHub actualizadas y avisos del código resueltos |

## Próximas mejoras propuestas (por orden)

| Orden | Mejora | Por qué | Esfuerzo | ¿Te necesito? |
|---|---|---|---|---|
| 1 | Probar con tus cuentas reales: juego online (2.4), sincronización (2.3), escáner con capturas de Chess.com (5.9) e importación de Lichess (5.1) | Es lo único que no se ha podido probar contra los servicios reales | Bajo | Sí |
| 2 | **Tu entrenamiento de hoy** (4.8): una sesión diaria de 10 a 15 minutos que junta tus errores pendientes, el repaso de aperturas que toque, 5 problemas del tema que más fallas y una lección; con racha de días | Para mejorar, la constancia pesa más que el volumen; hoy cada cosa está en una pantalla distinta | Medio | No |
| 3 | **Análisis rápido en el móvil** (5.3): usar la evaluación en la nube de Lichess (gratuita) cuando la posición ya está calculada allí, y Stockfish solo para el resto | El análisis de una partida en el iPhone pasaría de minutos a segundos | Medio | No |
| 4 | **Repaso guiado de tu última partida** (4.9): antes de ver el análisis, la app te para en tus 3 momentos clave y te pregunta qué jugarías | Aprender de tus propios errores es lo que más rinde a tu nivel | Medio | No |
| 5 | Ajuste de los bots con tus valoraciones (1.8) | Que cada nivel juegue como un jugador real de ese Elo | Bajo | Sí, con *Copiar para Claude* |
| 6 | Estudios de Lichess por temas (6.1) | Temario estructurado con práctica | Alto | Elegir estudios |
| 7 | Aperturas, versión 2 (4.5) y más lecciones (4.7) | Completar lo que ya funciona | Medio y alto | No |

## Pendiente

### 1. Jugar y entrenar

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 1.6 | Problemas de Lichess sincronizados con tu cuenta (el paquete sin conexión ya está hecho) | Medio | Baja |
| 1.8 | Calibrar la fuerza de los bots con tus valoraciones (*Copiar para Claude*), registradas en `docs/AJUSTE_BOTS.md` | Bajo | Continua |

### 2. Sincronización entre ordenador y móvil

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 2.3 | Probar la sincronización con tu cuenta real de Supabase | Bajo | Alta |
| 2.4 | Probar el juego online con tu cuenta real de Lichess | Bajo | Alta |

### 3. Entrenador con Claude

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 3.1 | Entrenador integrado en el móvil fuera de casa (acceso al PC con Tailscale; nunca API de pago) | Medio | Baja |
| 3.2 | Vigilar los cambios de Anthropic en el uso de `claude -p` con los planes | Bajo | Continua |

### 4. Aprendizaje y seguimiento

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 4.8 | Tu entrenamiento de hoy: sesión diaria guiada con racha | Medio | Alta |
| 4.9 | Repaso guiado de tu última partida en sus momentos clave | Medio | Media |
| 4.7 | Más lecciones: mate con alfil y caballo, finales de dama contra peón, triangulación | Medio | Baja |
| 4.5 | Aperturas, versión 2: repertorio propio editable y variantes del rival que aún no te han jugado | Alto | Baja |

### 5. Pendiente de verificar o pulir

| # | Tema | Situación |
|---|---|---|
| 5.1 | Importación de Lichess con datos reales | Programada según la documentación; sin probar con datos reales |
| 5.2 | Problemas online de Lichess con datos reales | Sin verificar |
| 5.3 | Análisis rápido en el móvil con la evaluación en la nube de Lichess; calibrar profundidad y umbrales | Pendiente, propuesto como siguiente paso |
| 5.6 | Borrar la rama temporal `diagnostico-chesscom` en GitHub | Hay que hacerlo desde la web de GitHub (*Branches*) |
| 5.7 | Importación completa de Chess.com con un historial grande | Probada con datos simulados; falta verificarla con tu historial real |
| 5.8 | Modo Tinta en la BOOX real | Revisado en simulación; falta probar el refresco de la pantalla real |
| 5.9 | Escáner con capturas reales de Chess.com | Probado con capturas simuladas y juegos de piezas no vistos (99,3 % de casillas); falta probarlo con tus capturas |

## Por analizar

| # | Idea | Primeras notas |
|---|---|---|
| 6.1 | **Estudios y cursos de Lichess para estudiar y practicar por temas** | Lichess permite exportar estudios en PGN (públicos y, con tu cuenta, los tuyos y los que te compartan) y listar los estudios de un usuario. Cada capítulo puede ser una lección o un ejercicio con jugadas que adivinar. Enfoque posible: importar un estudio por enlace, mostrar sus capítulos como temario y practicar cada capítulo en modo «adivina la jugada», guardando el progreso. Falta decidir qué estudios usar (propios, de la comunidad o una selección para principiantes) y cómo encaja con los problemas recomendados |
| 6.2 | **Recomendación de cursos y libros, versión completa** | La versión sencilla (enlaces de búsqueda) ya está hecha. Queda decidir si queremos una lista fija de recursos revisada por nosotros o que Claude proponga 2 o 3 recursos concretos en el informe de cada partida |
