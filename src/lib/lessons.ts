import { Chess } from 'chess.js'
import { load, save } from './storage'
import type { Color } from './types'

/**
 * Lecciones prácticas de finales elementales. El alumno juega contra Stockfish, que defiende lo mejor
 * posible, hasta cumplir el objetivo o fallar.
 */

export type LessonGoal = 'mate' | 'promote' | 'draw' | 'capture'

export interface Lesson {
  id: string
  title: string
  summary: string
  /** Explicación de la técnica, paso a paso. */
  steps: string[]
  fen: string
  goal: LessonGoal
  /** Jugadas del alumno que se consideran una buena ejecución. */
  par: number
  /** Máximo de jugadas del alumno antes de dar la lección por fallada (en «tablas», las que hay que aguantar). */
  limit: number
  /** La solución incluye entregar material: perder una pieza no da la lección por fallada. */
  allowSacrifice?: boolean
}

export const LESSONS: Lesson[] = [
  {
    id: 'two-rooks',
    title: 'Mate con dos torres',
    summary: 'La escalera: el mate más sencillo y el primero que hay que dominar.',
    steps: [
      'Una torre corta el paso al rey rival en una fila (o columna) y la otra da jaque en la siguiente.',
      'Se van turnando: cada jaque empuja al rey una fila hacia el borde.',
      'Si el rey rival se acerca a una torre, llévala al otro extremo de la fila, lejos de él, sin perder la fila.',
      'Cuando el rey llegue al borde, el siguiente jaque en esa fila es mate. Tu rey no hace falta.',
    ],
    fen: '8/8/8/3k4/8/8/8/R3K2R w - - 0 1',
    goal: 'mate',
    par: 7,
    limit: 20,
  },
  {
    id: 'queen',
    title: 'Mate con dama y rey',
    summary: 'Encierra al rey con la dama y remata con la ayuda de tu rey.',
    steps: [
      'Coloca la dama a salto de caballo del rey rival: así le quitas muchas casillas sin darle jaque.',
      'Cada vez que el rey se mueva, sigue con la dama a salto de caballo. El espacio del rey se va reduciendo hasta el borde.',
      'Cuidado con el ahogado: si el rey rival no tiene casillas y no está en jaque, es tablas. Cuando le queden dos casillas, deja de apretar y acerca tu rey.',
      'Con tu rey cerca, da mate con la dama pegada al rey rival y protegida por tu rey, o en la fila del borde.',
    ],
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    goal: 'mate',
    par: 10,
    limit: 30,
  },
  {
    id: 'rook',
    title: 'Mate con torre y rey',
    summary: 'Más lento que con la dama: aquí el rey trabaja tanto como la torre.',
    steps: [
      'Usa la torre para cortar al rey rival en una parte del tablero.',
      'Acerca tu rey hasta ponerlo enfrente del rey rival, con una casilla entre ambos (oposición).',
      'En ese momento, jaque con la torre por el lado: el rey rival tiene que retroceder una fila.',
      'Si no hay oposición, haz una jugada de espera con la torre por su fila, lejos del rey rival.',
      'Repite hasta el borde. Con los reyes enfrentados y el rival en el borde, el jaque en la fila del borde es mate.',
    ],
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    goal: 'mate',
    par: 18,
    limit: 50,
  },
  {
    id: 'back-rank',
    title: 'Mate del pasillo',
    summary: 'El rey encerrado por sus propios peones en la última fila.',
    steps: [
      'Si el rey rival está en la última fila y sus peones le tapan la salida, un jaque de torre o dama en esa fila puede ser mate.',
      'Si una pieza rival defiende la fila, elimínala o desvíala: a veces conviene entregar la dama para que la torre entre después.',
      'Busca piezas alineadas en la misma columna (dama y torre): la de delante puede sacrificarse y la de detrás remata.',
      'Para evitarlo en tus partidas, abre una salida al rey (por ejemplo, h3 o g3) cuando tengas tiempo.',
    ],
    fen: '3r2k1/2q2ppp/8/8/8/3Q4/5PPP/3R2K1 w - - 0 1',
    goal: 'mate',
    par: 2,
    limit: 4,
    allowSacrifice: true,
  },
  {
    id: 'smothered',
    title: 'Mate de la coz',
    summary: 'El caballo da mate a un rey ahogado por sus propias piezas.',
    steps: [
      'Jaque de caballo para obligar al rey a moverse a la esquina o junto a ella.',
      'Jaque doble (caballo y dama a la vez): el rey solo puede volver a la esquina.',
      'Sacrifica la dama junto al rey para obligar a la torre a taparle la última casilla.',
      'El caballo da el jaque final: el rey no puede moverse porque está rodeado de sus propias piezas.',
    ],
    fen: 'r6k/6pp/8/6N1/2Q5/8/6PP/6K1 w - - 0 1',
    goal: 'mate',
    par: 4,
    limit: 6,
    allowSacrifice: true,
  },
  {
    id: 'square',
    title: 'La regla del cuadrado',
    summary: '¿Alcanza tu rey al peón? Se sabe sin calcular.',
    steps: [
      'Imagina un cuadrado cuyo lado va desde el peón hasta su casilla de coronación.',
      'Si tu rey está dentro del cuadrado (o puede entrar en su turno), alcanza al peón.',
      'Ve en diagonal: avanzas hacia la columna del peón y hacia su casilla de coronación a la vez.',
      'Objetivo: captura el peón negro antes de que corone.',
    ],
    fen: '7k/8/8/p7/4K3/8/8/8 w - - 0 1',
    goal: 'capture',
    par: 6,
    limit: 12,
  },
  {
    id: 'kp-win',
    title: 'Rey y peón: ganar',
    summary: 'Con el rey delante del peón, se corona.',
    steps: [
      'El rey va delante: primero avanza el rey, después el peón.',
      'Con tu rey dos casillas por delante del peón, ganas siempre (salvo con peones de torre).',
      'La oposición: si los reyes están enfrentados con una casilla en medio, el que no mueve tiene la ventaja. Búscala para que el rey rival se aparte.',
      'Objetivo: corona el peón sin que te capturen la dama nueva y sin ahogar al rival.',
    ],
    fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1',
    goal: 'promote',
    par: 10,
    limit: 25,
  },
  {
    id: 'opposition',
    title: 'La oposición',
    summary: 'Ganar con el rey y el peón aunque los reyes estén lejos.',
    steps: [
      'Hay oposición cuando los reyes están en la misma columna con un número impar de casillas entre ellos. El que no mueve la tiene.',
      'Lleva tu rey por delante del peón, hacia las casillas clave (dos filas por delante del peón).',
      'Si el rey rival te bloquea, usa una jugada de peón para cederle el turno y recuperar la oposición.',
      'Objetivo: corona el peón sin que te capturen la dama nueva y sin ahogar al rival.',
    ],
    fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1',
    goal: 'promote',
    par: 14,
    limit: 30,
  },
  {
    id: 'kp-draw',
    title: 'Rey y peón: defender las tablas',
    summary: 'Juegas con negras. Si tu rey se pone delante del peón, no pueden ganarte.',
    steps: [
      'Pon tu rey justo delante del peón y mantenlo ahí.',
      'Cuando tengas que retroceder, retrocede en línea recta, hacia la casilla de delante del peón, no hacia los lados.',
      'Cuando el rey blanco avance, ponte enfrente de él (oposición).',
      'Objetivo: aguanta sin que el peón corone. Si te quedas sin jugadas sin estar en jaque (ahogado), son tablas: también vale.',
    ],
    fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
    goal: 'draw',
    par: 25,
    limit: 25,
  },
  {
    id: 'lucena',
    title: 'Final de torres: Lucena',
    summary: 'Torre y peón contra torre: hacer el puente para coronar.',
    steps: [
      'Tu rey está delante del peón, pero las torres rivales dan jaques y le impiden salir.',
      'Primero, corta al rey rival con tu torre en la columna de al lado (jaque en esa columna).',
      'Después, sube la torre a la cuarta fila: será el «puente» que tapará los jaques.',
      'Saca el rey y, cuando lleguen los jaques, interpón la torre. El peón corona.',
    ],
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    goal: 'promote',
    par: 10,
    limit: 25,
  },
  {
    id: 'philidor',
    title: 'Final de torres: Philidor',
    summary: 'Juegas con negras. La defensa que convierte en tablas torre y peón contra torre.',
    steps: [
      'Tu rey está delante del peón. Mantén la torre en tu sexta fila (la tercera de las blancas) para que su rey no pueda avanzar.',
      'No muevas la torre de esa fila mientras el peón no avance.',
      'Cuando el peón llegue a tu sexta fila, el rey blanco ya no tiene dónde esconderse: baja la torre al fondo y da jaques desde atrás.',
      'Objetivo: aguanta sin perder la torre y sin que el peón corone.',
    ],
    fen: '4k3/7R/r7/3KP3/8/8/8/8 w - - 0 1',
    goal: 'draw',
    par: 25,
    limit: 25,
  },
]

/** Color con el que juega el alumno. En la lección de defensa, empieza el motor con blancas. */
export const lessonColor = (l: Lesson): Color => (l.goal === 'draw' ? 'black' : 'white')

export interface LessonProgress {
  done: boolean
  /** Menor número de jugadas con que se ha conseguido. */
  best?: number
}

const KEY = 'lessonProgress'

export const loadLessonProgress = (): Record<string, LessonProgress> => load(KEY, {})

export function recordLesson(id: string, moves: number) {
  const all = loadLessonProgress()
  const cur = all[id]
  all[id] = { done: true, best: cur?.best ? Math.min(cur.best, moves) : moves }
  save(KEY, all)
}

export type LessonStatus = { state: 'playing' } | { state: 'won'; text: string } | { state: 'lost'; text: string }

const pieceCount = (c: Chess, color: 'w' | 'b') =>
  c
    .board()
    .flat()
    .filter((p) => p && p.color === color && p.type !== 'k').length

/**
 * Comprueba la posición tras una jugada. `userMoves` son las jugadas del alumno hechas hasta ahora y
 * `startPieces` las piezas (sin el rey) con las que empezó cada bando.
 */
export function checkLesson(lesson: Lesson, chess: Chess, userMoves: number, startPieces: { w: number; b: number }): LessonStatus {
  const user = lessonColor(lesson) === 'white' ? 'w' : 'b'
  const rival = user === 'w' ? 'b' : 'w'
  const last = chess.history({ verbose: true }).pop()

  if (lesson.goal === 'mate') {
    if (chess.isCheckmate()) return { state: 'won', text: `¡Mate en ${userMoves} jugadas!` }
    if (chess.isStalemate()) return { state: 'lost', text: 'Ahogado: el rey rival no tiene jugadas y no está en jaque. Es tablas. Deja siempre una casilla libre hasta que puedas dar mate.' }
    if (!lesson.allowSacrifice && pieceCount(chess, user) < startPieces[user]) {
      return { state: 'lost', text: 'Te han capturado una pieza. Mantén tus piezas lejos del rey rival o protegidas por tu rey.' }
    }
    if (chess.isDraw()) return { state: 'lost', text: 'La partida ha acabado en tablas.' }
    if (userMoves >= lesson.limit && chess.turn() === rival) return { state: 'lost', text: `Has llegado a ${lesson.limit} jugadas sin dar mate. Repasa la técnica y vuelve a probar.` }
  }

  if (lesson.goal === 'capture') {
    if (pieceCount(chess, rival) < startPieces[rival]) return { state: 'won', text: `¡Peón capturado en ${userMoves} jugadas! Tu rey estaba dentro del cuadrado.` }
    if (last?.promotion && last.color === rival) return { state: 'lost', text: 'El peón ha coronado. Ve en diagonal hacia la casilla de coronación.' }
  }

  if (lesson.goal === 'promote') {
    if (chess.isStalemate()) return { state: 'lost', text: 'Ahogado: es tablas. Al coronar, comprueba que el rey rival tenga alguna jugada.' }
    if (pieceCount(chess, user) < startPieces[user]) return { state: 'lost', text: 'Te han capturado una pieza. Protégela con el rey (o con la torre) antes de avanzar.' }
    if (last?.promotion && last.color === user) {
      const attacked = chess.isAttacked(last.to, rival)
      const defended = chess.isAttacked(last.to, user)
      if (attacked && !defended) return { state: 'lost', text: 'Has coronado, pero el rey rival captura la pieza nueva. Corona con tu rey protegiendo la casilla.' }
      return { state: 'won', text: `¡Peón coronado en ${userMoves} jugadas!` }
    }
    if (userMoves >= lesson.limit && chess.turn() === rival) return { state: 'lost', text: `Has llegado a ${lesson.limit} jugadas sin coronar.` }
  }

  if (lesson.goal === 'draw') {
    if (chess.isCheckmate()) return { state: 'lost', text: 'Te han dado mate. Mantén el rey cerca de la casilla de coronación y la torre lejos.' }
    if (pieceCount(chess, user) < startPieces[user]) return { state: 'lost', text: 'Has perdido una pieza. Revisa qué casillas ataca el rival antes de mover.' }
    if (last?.promotion && last.color === rival) return { state: 'lost', text: 'El peón ha coronado. Tu rey tenía que quedarse delante del peón.' }
    if (pieceCount(chess, rival) < startPieces[rival]) return { state: 'won', text: '¡Has capturado el peón! Tablas seguras.' }
    if (chess.isStalemate()) return { state: 'won', text: '¡Ahogado! Son tablas: has defendido bien.' }
    if (chess.isDraw()) return { state: 'won', text: '¡Tablas! Has defendido bien.' }
    if (userMoves >= lesson.limit) return { state: 'won', text: `Has aguantado ${lesson.limit} jugadas: estas posiciones son tablas si el rey se queda delante del peón.` }
  }

  return { state: 'playing' }
}
