# Hoja de ruta

Estado de las mejoras identificadas. Se actualiza en cada iteración.

Leyenda: **Hecho**, **En curso**, **Pendiente**, **Por analizar** (necesita definir el enfoque antes de programar).

## Hecho

| Mejora | Notas |
|---|---|
| Análisis de partidas con Stockfish en el navegador | Precisión, clasificación de jugadas, comentarios y momentos clave |
| Importación de Chess.com y Lichess | Usuario en la propia pantalla, errores con detalle técnico, hasta 6 meses atrás si no hay partidas recientes |
| Importación de archivo PGN | Admite el archivo con varias partidas que descarga Chess.com |
| Entrenador con Claude | Con el plan (Claude Code en el PC), con claude.ai (copiar y pegar) o con clave de API |
| Versión móvil instalable (PWA) en GitHub Pages | https://cullera33-puchi.github.io/Ajedrez-App/ |
| Ajustes de iPhone | Isla y zonas seguras, nada más ancho que la pantalla, sin zoom por doble toque |
| Análisis cómodo en el móvil | Tablero fijo arriba; debajo, una zona propia que se desplaza con la jugada, la lista y el resumen; barra fija de botones grandes; la página nunca se mueve |
| Entrenador con Claude plegado al final | Fila pequeña con *Entrenador IA* y *Abrir en claude.ai*; se despliega al pulsar |
| Problemas recomendados según tus errores | Temas deducidos de tus errores (mates, piezas colgadas, dobles ataques, defensa) y de los informes de Claude. Botón *Practica lo que has fallado* en el análisis y recomendaciones en Problemas e Inicio |

## Pendiente

### 1. Jugar y entrenar

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 1.1 | Bots de tu nivel (400 a 1500) que cometen errores humanos | Medio | Alta |
| 1.2 | Importación completa del historial de Chess.com, con almacenamiento en IndexedDB y descarga solo de lo nuevo | Medio | Alta |
| 1.3 | Análisis en segundo plano de las partidas importadas | Medio | Alta |
| 1.4 | Problemas con las posiciones de tus propios errores, con repaso de los fallados (repetición espaciada) | Medio | Alta |
| 1.5 | Jugar online en Lichess (rápidas y clásicas), retos a amigos y a los bots de Lichess, con análisis bloqueado durante la partida | Alto | Media |
| 1.6 | Problemas de Lichess sincronizados con tu cuenta y paquete de problemas de tu nivel para usar sin conexión | Medio | Media |

### 2. Sincronización entre ordenador y móvil

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 2.1 | Copia de seguridad manual: exportar en un dispositivo e importar en el otro | Bajo | Alta |
| 2.2 | Sincronización automática en la nube (Supabase, gratuito) con inicio de sesión por correo | Medio | Media |

### 3. Entrenador con Claude

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 3.1 | Entrenador integrado en el móvil fuera de casa (acceso al PC con Tailscale o API de pago) | Medio | Baja |
| 3.2 | Vigilar los cambios de Anthropic en el uso de `claude -p` con los planes | Bajo | Continua |

### 4. Aprendizaje y seguimiento

| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| 4.1 | Repetir la jugada correcta en tus errores antes de ver la solución | Bajo | Alta |
| 4.2 | Explorar variantes libremente en el tablero de análisis | Medio | Media |
| 4.3 | Panel de progreso: evolución del rating, temas más fallados y aperturas con peor resultado | Medio | Media |
| 4.4 | Lecciones interactivas de mates básicos y finales elementales | Alto | Media |
| 4.5 | Repertorio de aperturas con repetición espaciada | Alto | Baja |

### 5. Pendiente de verificar o pulir

| # | Tema | Situación |
|---|---|---|
| 5.1 | Importación de Lichess con datos reales | Programada según la documentación; la de Chess.com ya está verificada en el móvil |
| 5.2 | Problemas online de Lichess con datos reales | Sin verificar |
| 5.3 | Calibrar profundidad y umbrales del análisis; usar la evaluación en la nube de Lichess para acelerar en el móvil | Pendiente |
| 5.4 | Elegir pieza al coronar (ahora siempre dama) | Pendiente |
| 5.5 | Actualizar las acciones de GitHub (aviso de versión obsoleta de Node) y limpiar avisos menores del código | Pendiente |
| 5.6 | Borrar la rama temporal `diagnostico-chesscom` en GitHub | Hay que hacerlo desde la web de GitHub (*Branches*) |

## Por analizar

| # | Idea | Primeras notas |
|---|---|---|
| 6.1 | **Estudios y cursos de Lichess para estudiar y practicar por temas** | Lichess permite exportar estudios en PGN (públicos y, con tu cuenta, los tuyos y los que te compartan) y listar los estudios de un usuario. Cada capítulo puede ser una lección o un ejercicio con jugadas que adivinar. Enfoque posible: importar un estudio por enlace, mostrar sus capítulos como temario y practicar cada capítulo en modo «adivina la jugada», guardando el progreso. Falta decidir qué estudios usar (propios, de la comunidad o una selección para principiantes) y cómo encaja con los problemas recomendados |
| 6.2 | **Recomendación de cursos y libros según tus errores** | Para cada tema que más fallas, sugerir recursos: prácticas temáticas de Lichess (lichess.org/practice), estudios de la comunidad y libros o cursos para principiantes. Opción sencilla: un enlace de búsqueda en Google por tema y nivel (por ejemplo, «libro ajedrez clavadas principiantes»), que se puede hacer ya sin coste. Opción más completa: que Claude proponga 2 o 3 recursos concretos en el informe de la partida. Falta decidir si queremos una lista fija revisada por nosotros o recomendaciones dinámicas |
