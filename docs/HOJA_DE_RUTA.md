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
| Revisión global del código (27/10/2026, tarde) | 10 puntos corregidos: vuelta atrás sin bucle desde la lección o apertura abierta en Entrenar, racha que cuenta aunque no se vuelva a Entrenar, repaso que no queda bloqueado sin análisis, la sincronización ya no sobrescribe la nube ante un error y no sube nada si no hay cambios, motor sin bloqueo en *Inténtalo tú*, Problemas y Entrenar con la misma lógica, service worker que se renueva en cada publicación sin volver a descargar el motor |
| Tu entrenamiento de hoy (4.8) | Nueva pestaña *Entrenar* y tarjeta en Inicio: sesión diaria con el repaso de tu última partida, 3 errores pendientes, 5 problemas del tema que más fallas, una apertura y una lección. Racha de días seguidos, sincronizada entre dispositivos |
| Repaso guiado de tu última partida (4.9) | Antes de ver el análisis, la app te para en tus 3 errores más caros y te pregunta qué jugarías; Stockfish valora tu respuesta (la mejor, también buena, la de la partida o mala) y al final ves el resumen. También desde *Tus momentos clave* en el análisis |
| Código de acceso de 4 cifras | Se pide al abrir la app la primera vez en cada dispositivo. El código es un secreto de GitHub (`APP_PIN`) y en la app solo va su huella; 5 fallos bloquean 30 segundos. Barrera sencilla: para un cierre real, Cloudflare Access (ver *Por analizar*) |
| Búsqueda de rival en Lichess corregida | La conexión de la búsqueda queda abierta mientras se espera (antes Lichess la retiraba sin avisar); se relanza sola si se corta, recoge la partida aunque se pierda el aviso y muestra el tiempo de espera |
| Supabase con tu proyecto | Dirección y clave publishable ya puestas en la tarjeta de sincronización; guía actualizada al formato nuevo de clave y con el paso de cerrar el alta de usuarios |
| Tinta noche | Nuevo modo en Inicio, *Apariencia*: tinta con fondo negro y letras blancas, tablero en grises medios y flechas en blanco, para jugar de noche en la BOOX. Las casillas del navegador ya no salen en azul en tinta |
| Barra inferior pegada al borde | En el móvil, los botones de avanzar y retroceder del análisis y la barra de acciones de Jugar van fijos abajo del todo, sin hueco por debajo por el que se viera pasar el contenido. Los botones del motor (Mejor jugada, Líneas) ya no salen en azul en el iPhone |
| Tiempo de juego y meta diaria | Tarjeta en Inicio y en Progreso: minutos de hoy frente a la meta (10 a 60 minutos, a elegir), tiempo de la semana y del mes, días de la semana con la meta cumplida, racha actual y mejor racha. Cuenta el tiempo activo en Entrenar, Jugar, Problemas, Aprender y Análisis (con la pantalla a la vista y sin pasar 3 minutos sin tocarla) y la duración de las partidas de Chess.com y Lichess según su reloj. Cada dispositivo apunta su tiempo y la sincronización suma los de todos |
| Sin difuminado arriba en el iPhone | La barra de la hora deja de ser translúcida: la app empieza debajo y el iPhone ya no difumina la parte de arriba del tablero. La barra toma el color del tema elegido (también en tinta o con día fijo). Comprobado en tu iPhone tras reinstalar la app |
| Análisis en la tablet y flecha de la mejor jugada | Si tu jugada fue mejorable, la que había que hacer se marca con una flecha verde (negra en tinta). En la tablet en vertical, el tablero llega al 60 % del alto, la jugada actual se ve entera debajo y la lista queda para bajar con el dedo; *Inténtalo tú* y la ayuda del motor van en una sola fila. Falta ajustar el móvil |
| Mis partidas por origen | Cuatro apartados en fichas: Chess.com, Lichess, Contra bots y Otras, cada uno con su color y su número de partidas; al importar se abre el apartado correspondiente |
| Análisis más cómodo en el móvil | La página se desplaza entera con el dedo y el tablero queda fijo arriba (antes la zona de abajo se bloqueaba en el iPhone). La flecha de la mejor jugada y las 3 líneas del motor empiezan ocultas: *Ver la mejor jugada* y *Ver las 3 mejores líneas* en la tarjeta de la jugada |
| Rating de Lichess en Inicio | El usuario de Lichess se rellena solo con la cuenta conectada para jugar; el rating provisional se marca con «?» y, sin partidas con puntuación, se explica que las amistosas no dan rating |
| Registro de errores | Inicio, *Registro de errores*: la app apunta sola errores, avisos (sincronización, importaciones, Lichess, motor) y las pantallas visitadas; *Copiar para Claude* y *Compartir*. Sin claves ni correos y solo en el dispositivo. Si una pantalla falla al dibujarse, muestra un aviso en lugar de quedarse en blanco |
| Pantalla más aprovechada en tinta y móvil | Las 3 líneas del motor en una variante pasan a ser opcionales (*Ver las 3 mejores líneas*, en todos los dispositivos). En Problemas, Entrenar, Visión y aperturas el tablero no pasa de la mitad del alto y la tarjeta del problema va primero. Las letras del borde del tablero ya no se salen |
| Importación automática | Al abrir la app y al volver a ella tras media hora, trae tus partidas nuevas de Chess.com y Lichess sin pulsar nada y avisa de cuántas hay; el análisis en segundo plano se encarga de ellas. Solo si ya importaste alguna vez a mano |
| Avisos de pieza colgada contra los bots | Antes de jugar, si la jugada deja una pieza colgada (o se pierde material en el cambio) o permite mate en una, la app avisa y deja pensar otra o jugarla igualmente. Se puede quitar en Jugar |
| Gestión del tiempo | Con los relojes de las partidas de Chess.com y Lichess: tiempo pensado en cada jugada en el análisis (y aviso si un error fue con prisa) y tarjeta en Tu progreso con errores con prisa, tiempo medio y derrotas por tiempo, con un consejo |
| Resumen semanal | Tarjeta *Tu semana* en Inicio y Tu progreso: partidas, precisión, problemas, días entrenados, rating y tema más fallado, frente a la semana anterior |
| Visión del tablero | En Aprender (y como extra en Entrenar): coordenadas en 30 segundos y piezas colgadas en 5 posiciones, con mejores marcas sincronizadas |
| Iconos del menú | Juego de iconos propio de trazo fino en el color del texto (antes, mezcla de símbolos y emojis de colores). En tinta, nada a color: los avatares de los bots en gris |
| Iconos de navegación del análisis | Inicio, anterior, siguiente y final dibujados en SVG con el color del texto: en el iPhone ya no salen como emoji azules |
| Menú lateral en el móvil | La barra de pestañas pasa a un menú que se abre deslizando desde el borde izquierdo (el panel sigue al dedo); sin botón fijo, que era redundante. Sin pantalla gris al deslizar en el iPhone. En análisis gana unos 50 px de zona de jugadas. En PC y tablet, sin cambios |
| Revisión y optimización del código (27/10/2026) | 32 fallos corregidos (juego online, sincronización, motor, lecciones, duplicados de partidas, seguridad del entrenador); la app carga un 43 % menos al abrir |
| Jugar online en Lichess (1.5) | Jugar, *Online en Lichess*: buscar rival (rápidas y clásicas), Stockfish de Lichess por niveles y retos a amigos; análisis bloqueado durante la partida. Falta probarlo con tu cuenta |
| Tus aperturas (4.5, versión 1) | Aprender: las 5 más jugadas con cada color, línea habitual, revisión con Stockfish, lo que te juegan y práctica con repaso espaciado |
| Problemas sin conexión (1.6, parte sin conexión) | 5.493 problemas de Lichess de 400 a 1500, generados al publicar a partir de la base oficial (CC0) |
| Jugar desde cualquier posición (1.9) | Desde el escáner, el análisis, las lecciones y las aperturas; opción de máxima fuerza |
| Más lecciones (4.6) | Mate del pasillo, mate de la coz, oposición, Lucena y Philidor (once en total) |
| Sincronización automática (2.2 y 2.3) | Con Supabase gratuito; guía en `docs/SINCRONIZACION.md`. Probada el 27/10/2026 con móvil, tablet y PC; alta de usuarios nuevos cerrada |
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
| 1 | Terminar las pruebas reales: búsqueda de rival en Lichess tras la corrección (2.4), escáner con capturas de Chess.com (5.9), importación de Lichess (5.1) y comprobar que la app pide el código de acceso. Si algo falla, pegar el *Registro de errores* | Es lo único que no se puede probar desde aquí | Bajo | Sí |
| 2 | Usar unos días el entrenamiento diario, los avisos de pieza colgada y la visión del tablero, y contarme qué sobra o falta (duración, número de problemas, si avisa demasiado o poco) | Ajustarlo a cómo entrenas de verdad | Bajo | Sí |
| 3 | **Análisis rápido en el móvil** (5.3): usar la evaluación en la nube de Lichess (gratuita) cuando la posición ya está calculada allí, y Stockfish solo para el resto | El análisis de una partida en el iPhone pasaría de minutos a segundos | Medio | Probarlo tú |
| 4 | Ajuste de los bots con tus valoraciones (1.8) | Que cada nivel juegue como un jugador real de ese Elo | Bajo | Sí, con *Copiar para Claude* |
| 5 | Estudios de Lichess por temas (6.1) | Temario estructurado con práctica | Alto | Elegir estudios |
| 6 | Aperturas, versión 2 (4.5) y más lecciones (4.7) | Completar lo que ya funciona | Medio y alto | No |
| 7 | Acceso privado real con Cloudflare (6.3), si el código de 4 cifras se queda corto | Cierra la URL de verdad y permite el repositorio privado | Medio | Sí, crear la cuenta |

## Pendiente

### 1. Jugar y entrenar

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 1.6 | Problemas de Lichess sincronizados con tu cuenta (el paquete sin conexión ya está hecho) | Medio | Baja |
| 1.8 | Calibrar la fuerza de los bots con tus valoraciones (*Copiar para Claude*), registradas en `docs/AJUSTE_BOTS.md` | Bajo | Continua |

### 2. Sincronización entre ordenador y móvil

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 2.4 | Probar el juego online con tu cuenta real de Lichess (conexión hecha; volver a probar la búsqueda tras la corrección) | Bajo | Alta |

### 3. Entrenador con Claude

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 3.1 | Entrenador integrado en el móvil fuera de casa (acceso al PC con Tailscale; nunca API de pago) | Medio | Baja |
| 3.2 | Vigilar los cambios de Anthropic en el uso de `claude -p` con los planes | Bajo | Continua |

### 4. Aprendizaje y seguimiento

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 4.7 | Más lecciones: mate con alfil y caballo, finales de dama contra peón, triangulación | Medio | Baja |
| 4.5 | Aperturas, versión 2: repertorio propio editable y variantes del rival que aún no te han jugado | Alto | Baja |

### 5. Pendiente de verificar o pulir

| # | Tema | Situación |
|---|---|---|
| 5.1 | Importación de Lichess con datos reales | Programada según la documentación; sin probar con datos reales |
| 5.2 | Problemas online de Lichess con datos reales | Sin verificar |
| 5.3 | Análisis rápido en el móvil con la evaluación en la nube de Lichess; calibrar profundidad y umbrales | Pendiente, propuesto como siguiente paso |
| 5.7 | Importación completa de Chess.com con un historial grande | Probada con datos simulados; falta verificarla con tu historial real |
| 5.8 | Modo Tinta en la BOOX real | Probado por ti en la BOOX; ajustado el tamaño del tablero en Problemas y las líneas del motor. Falta confirmar que el análisis ya se ve bien |
| 5.9 | Escáner con capturas reales de Chess.com | Probado con capturas simuladas y juegos de piezas no vistos (99,3 % de casillas); falta probarlo con tus capturas |

## Por analizar

| # | Idea | Primeras notas |
|---|---|---|
| 6.1 | **Estudios y cursos de Lichess para estudiar y practicar por temas** | Lichess permite exportar estudios en PGN (públicos y, con tu cuenta, los tuyos y los que te compartan) y listar los estudios de un usuario. Cada capítulo puede ser una lección o un ejercicio con jugadas que adivinar. Enfoque posible: importar un estudio por enlace, mostrar sus capítulos como temario y practicar cada capítulo en modo «adivina la jugada», guardando el progreso. Falta decidir qué estudios usar (propios, de la comunidad o una selección para principiantes) y cómo encaja con los problemas recomendados |
| 6.3 | **Acceso privado real a la app** | Cloudflare Pages con Cloudflare Access (gratis): código por correo antes de cargar la app y repositorio privado. Cambia la dirección de la app; probar el inicio de sesión en la app instalada del iPhone |
| 6.2 | **Recomendación de cursos y libros, versión completa** | La versión sencilla (enlaces de búsqueda) ya está hecha. Queda decidir si queremos una lista fija de recursos revisada por nosotros o que Claude proponga 2 o 3 recursos concretos en el informe de cada partida |
