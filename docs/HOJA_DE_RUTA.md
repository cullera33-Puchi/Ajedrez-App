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

## Pendiente

### 1. Jugar y entrenar

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 1.5 | Jugar online en Lichess (rápidas y clásicas), retos a amigos y a los bots de Lichess, con análisis bloqueado durante la partida. Necesita tu cuenta de Lichess y probarlo contigo | Alto | Media |
| 1.6 | Problemas de Lichess sincronizados con tu cuenta y paquete de problemas de tu nivel para usar sin conexión | Medio | Media |
| 1.8 | Calibrar la fuerza de los bots con tus impresiones, registradas en `docs/AJUSTE_BOTS.md` | Bajo | Continua |

### 2. Sincronización entre ordenador y móvil

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 2.2 | Sincronización automática en la nube (Supabase, gratuito) con inicio de sesión por correo. Necesita que crees la cuenta | Medio | Media |

### 3. Entrenador con Claude

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 3.1 | Entrenador integrado en el móvil fuera de casa (acceso al PC con Tailscale; nunca API de pago) | Medio | Baja |
| 3.2 | Vigilar los cambios de Anthropic en el uso de `claude -p` con los planes | Bajo | Continua |

### 4. Aprendizaje y seguimiento

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 4.2 | Explorar variantes libremente en el tablero de análisis | Medio | Media |
| 4.3 | Panel de progreso de partidas: evolución del rating en Chess.com, temas más fallados y aperturas con peor resultado (la parte de problemas ya está hecha) | Medio | Media |
| 4.4 | Lecciones interactivas de mates básicos y finales elementales | Alto | Media |
| 4.5 | Repertorio de aperturas con repetición espaciada | Alto | Baja |

### 5. Pendiente de verificar o pulir

| # | Tema | Situación |
|---|---|---|
| 5.1 | Importación de Lichess con datos reales | Programada según la documentación; sin probar con datos reales |
| 5.2 | Problemas online de Lichess con datos reales | Sin verificar |
| 5.3 | Calibrar profundidad y umbrales del análisis; usar la evaluación en la nube de Lichess para acelerar en el móvil | Pendiente |
| 5.6 | Borrar la rama temporal `diagnostico-chesscom` en GitHub | Hay que hacerlo desde la web de GitHub (*Branches*) |
| 5.7 | Importación completa de Chess.com con un historial grande | Probada con datos simulados; falta verificarla con tu historial real |
| 5.8 | Modo Tinta en la BOOX real | Revisado en simulación; falta probar el refresco de la pantalla real |

## Por analizar

| # | Idea | Primeras notas |
|---|---|---|
| 6.1 | **Estudios y cursos de Lichess para estudiar y practicar por temas** | Lichess permite exportar estudios en PGN (públicos y, con tu cuenta, los tuyos y los que te compartan) y listar los estudios de un usuario. Cada capítulo puede ser una lección o un ejercicio con jugadas que adivinar. Enfoque posible: importar un estudio por enlace, mostrar sus capítulos como temario y practicar cada capítulo en modo «adivina la jugada», guardando el progreso. Falta decidir qué estudios usar (propios, de la comunidad o una selección para principiantes) y cómo encaja con los problemas recomendados |
| 6.2 | **Recomendación de cursos y libros, versión completa** | La versión sencilla (enlaces de búsqueda) ya está hecha. Queda decidir si queremos una lista fija de recursos revisada por nosotros o que Claude proponga 2 o 3 recursos concretos en el informe de cada partida |
