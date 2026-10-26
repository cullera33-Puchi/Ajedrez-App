# Ajuste de los bots

Registro de tus impresiones sobre los bots para calibrar su fuerza. El objetivo es que cada nivel juegue como un jugador real de ese Elo (referencia: Chess.com, partidas rápidas).

Cómo usarlo: después de jugar, dile a Claude el nivel, el estilo y lo que has notado (demasiado fácil, demasiado difícil, un error de bulto concreto, aperturas raras…). Claude lo apunta aquí y, cuando haya varias observaciones coherentes, ajusta los parámetros.

## Parámetros actuales

Definidos en `src/lib/bots.ts` (`makeBot`). Se interpolan de forma continua entre 250 y 2000.

| Elo | Profundidad | Candidatas | Temperatura (cp) | Despistes por jugada | Pérdida máxima en un despiste (cp) |
|---|---|---|---|---|---|
| 250 | 3 | 14 | 320 | 28,0 % | 900 |
| 400 | 4 | 13 | 242 | 19,0 % | 757 |
| 500 | 5 | 12 | 200 | 14,6 % | 675 |
| 600 | 5 | 12 | 166 | 11,3 % | 601 |
| 800 | 6 | 11 | 114 | 6,7 % | 478 |
| 1000 | 8 | 9 | 78 | 4,0 % | 380 |
| 1200 | 9 | 8 | 54 | 2,4 % | 301 |
| 1500 | 11 | 6 | 31 | 1,1 % | 213 |
| 1800 | 13 | 4 | 17 | 0,5 % | 151 |
| 2000 | 14 | 3 | 12 | 0,3 % | 120 |

Qué mueve cada parámetro:

- **Profundidad**: lo lejos que calcula. Más profundidad, menos errores tácticos.
- **Candidatas y temperatura**: cuánto se aleja de la mejor jugada en una jugada normal. Más temperatura, juego más impreciso.
- **Despistes**: probabilidad de jugar una jugada claramente peor. Es lo que produce los errores de bulto.
- **Pérdida máxima**: cuánto puede costar un despiste (900 cp equivale a regalar la dama; 300 cp, una pieza).
- **Estilo atacante**: más probabilidad de capturas y jaques.

## Criterios de ajuste

- Mantener el orden: un nivel nunca puede jugar mejor que uno superior.
- Ajustar por tramos, no por una sola partida, salvo errores evidentes (por ejemplo, un 1500 que deja la dama en una).
- Anotar aquí cada cambio con fecha, motivo y valores anteriores.

## Observaciones

| Fecha | Nivel y estilo | Resultado | Observación | Acción |
|---|---|---|---|---|
| | | | | |

## Cambios realizados

| Fecha | Cambio | Motivo |
|---|---|---|
| 26/10/2026 | Nivel continuo de 250 a 2000 de 50 en 50; despistes limitados por nivel | Petición de más granularidad y fallos más realistas |
