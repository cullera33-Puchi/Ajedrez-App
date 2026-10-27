# Informe de la ejecución en segundo plano

Fecha: noche del 27 de octubre de 2026. Los cinco cambios del paquete están terminados, probados y publicados en https://cullera33-puchi.github.io/Ajedrez-App/. Todo es gratuito: ninguna parte usa una IA ni un servicio de pago.

Para ver los cambios en el móvil, cierra la app del todo y vuelve a abrirla (si no cambia, una segunda vez).

Los informes de ejecuciones anteriores quedan en el historial de git.

## Resumen

| # | Cambio | Estado | Dónde verlo |
|---|---|---|---|
| 1 | Tus aperturas: revisión y práctica | Hecho | **Aprender**, *Tus aperturas* |
| 2 | Problemas sin conexión de tu nivel | Hecho | **Problemas**, origen *Sin conexión* |
| 3 | Jugar desde cualquier posición | Hecho | Botón *Jugar desde aquí* en el escáner y el análisis; *Practicar contra un bot* en las lecciones |
| 4 | Cinco lecciones nuevas | Hecho | **Aprender**, *Lecciones prácticas* |
| 5 | Sincronización entre dispositivos | Hecho, falta que crees la cuenta | **Inicio**, *Sincronización* |

## Qué hay de nuevo, en detalle

### 1. Tus aperturas

- Las 5 aperturas que más juegas con blancas y las 5 con negras, solo con tus partidas de Chess.com y Lichess. De cada una: partidas, resultado y precisión media.
- **Tu línea habitual**: lo que juegas tú y lo que más te juegan, jugada a jugada, en las primeras siete jugadas. Tocando una jugada, el tablero muestra esa posición.
- **Revisión con Stockfish**: al abrir una apertura, Stockfish revisa tus jugadas habituales. Si una es claramente peor, la línea propone la buena (marcada en verde) y aparece en *Lo que puedes mejorar*, por ejemplo: «En la jugada 4 sueles jugar Cg5 (6 de 8 partidas). Mejor: d4.».
- **Lo que te juegan**: las respuestas más habituales de tus rivales.
- **Para seguir**: con conexión, lo más jugado en Lichess entre jugadores de 1000 a 1400 tras tu línea.
- **Practicar**: el rival te responde con lo que te juegan de verdad (cada vez puede salir una línea distinta) y tú tienes que jugar tu repertorio. Al segundo fallo te enseña la jugada. Repaso espaciado: si la línea sale sin fallos, vuelve en unos días; si no, pronto. *Toca repasar* indica las que tocan.
- Desde una apertura también puedes jugar contra un bot desde el final de tu línea.

### 2. Problemas sin conexión

- Desde aquí no hay acceso a Lichess, así que he hecho que GitHub, al publicar la app, descargue la base oficial de problemas de Lichess (6,1 millones, licencia libre CC0) y saque un paquete de tu nivel.
- El paquete tiene **5.493 problemas de 400 a 1500**, populares y fiables, repartidos por tramos de 100 puntos y por temas (mate en 1 y en 2, piezas colgadas, dobles ataques, clavadas, mate del pasillo, finales…).
- En Problemas, el origen *Sin conexión* usa el paquete: elige al azar entre los cercanos a tu nivel y evita los que ya has visto. Funciona sin red.
- Cada mes se actualiza con la base nueva.

### 3. Jugar desde cualquier posición

- *Jugar desde aquí* en el escáner y en el análisis (también dentro de una variante). En las lecciones terminadas, *Practicar contra un bot*.
- En Jugar aparece la posición con un tablero pequeño. Eliges color y nivel, o *Máxima fuerza* para jugar contra el bot más fuerte. Si le toca al bot, mueve él primero.
- Estas partidas se guardan en *Contra bots*, no cuentan en tu récord y la revancha repite la posición.

### 4. Lecciones nuevas

| Lección | Qué enseña |
|---|---|
| Mate del pasillo | Sacrificar la dama para que la torre dé mate en la última fila |
| Mate de la coz | La combinación clásica de caballo y dama, con sacrificio |
| La oposición | Ganar rey y peón aunque los reyes estén lejos |
| Final de torres: Lucena | Hacer el puente para coronar |
| Final de torres: Philidor | Defender las tablas con negras |

Ya son once lecciones. En las de sacrificio, entregar material no cuenta como fallo; en las de defensa, perder una pieza o recibir mate sí.

### 5. Sincronización

- Usa una cuenta gratuita de Supabase que tienes que crear tú, sin tarjeta. **Guía paso a paso en `docs/SINCRONIZACION.md`** (unos 5 minutos, mejor desde el PC).
- Después, en cada dispositivo: Inicio, *Sincronización*, pegar la dirección del proyecto y la clave pública, y crear la cuenta (en el primero) o entrar (en los demás).
- Se sincroniza sola al abrir la app y al volver a ella. Cada dispositivo descarga la copia de la nube, la fusiona sin borrar nada y sube el resultado.
- La copia es un archivo privado que solo puede leer tu usuario. La sesión de cada dispositivo nunca viaja en la copia.

## Otras mejoras y correcciones

- La lista de jugadas numera bien cuando la partida empieza con las negras.
- Un problema con datos defectuosos se salta en vez de dar error.
- Acciones de GitHub actualizadas a versiones con Node 24.

## Cómo se ha probado

- **Pruebas automáticas**: 69, todas correctas. Nuevas: aperturas (agrupación, árbol, línea, correcciones, respuestas del rival y repasos), paquete de problemas, lecciones, sincronización (la copia no lleva la sesión) y validaciones.
- **Lecciones**: las cinco posiciones nuevas, comprobadas con Stockfish a profundidad 24 (los mates son forzados, Lucena se gana y Philidor es tablas). El mate de la coz se ha jugado entero en el navegador.
- **Aperturas**: importación simulada de 80 partidas que siguen aperturas reales, revisión con Stockfish y una práctica completa en el navegador.
- **Problemas sin conexión**: el script de generación, con datos de prueba; el paquete real, generado en GitHub (5.493 problemas de 6.157.342 filas); en el navegador, el origen *Sin conexión* con red y sin ella.
- **Jugar desde una posición**: desde el escáner (el bot mueve primero si le toca), revancha y desde el análisis.
- **Sincronización**: dos «dispositivos» contra un servidor de Supabase simulado: crear cuenta y subir, entrar desde el otro con una contraseña errónea y luego la buena, recibir las 80 partidas, y un cambio hecho en el segundo que llega al primero.
- **Revisión final**: todas las pantallas en cinco formatos (móvil de noche, móvil de día, tablet, escritorio y tinta electrónica), sin errores ni elementos que se salgan de la pantalla.

## Lo que conviene que pruebes tú

1. **Tus aperturas** en Aprender, con tu historial real: revisa una y practícala.
2. **Problemas, origen Sin conexión**: comprueba que el nivel te encaja.
3. **Crear la cuenta de Supabase** siguiendo la guía y conectar el móvil y el PC. Es lo único que no he podido probar contra el servicio real.
4. **Las lecciones de torres** (Lucena y Philidor).
5. **Escanear una captura y pulsar Jugar desde aquí.**

## Incidencias y notas

- No ha habido bloqueos del sistema de permisos.
- Desde este entorno no hay acceso a Lichess, Chess.com, Supabase ni a la web publicada. Por eso:
  - el paquete de problemas se genera en GitHub al publicar;
  - la sincronización se ha probado con un servidor simulado que reproduce la API de Supabase.
- El explorador de Lichess (*Para seguir*) es un servicio gratuito; si en algún momento no responde, esa sección simplemente no aparece.
- Sigue pendiente borrar la rama temporal `diagnostico-chesscom` en GitHub (*Branches*).

## Siguientes pasos propuestos

Detalle en `docs/HOJA_DE_RUTA.md`. Lo más valioso que queda:

1. Ajustar los bots con tus valoraciones (*Copiar para Claude* en Jugar).
2. Jugar online en Lichess, mejor contigo porque necesita tu cuenta.
3. Estudios de Lichess por temas.
