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
    if (pieceCount(chess, user) < startPieces[user]) return { state: 'lost', text: 'Te han capturado una pieza. Mantén tus piezas lejos del rey rival o protegidas por tu rey.' }
    if (chess.isDraw()) return { state: 'lost', text: 'La partida ha acabado en tablas.' }
    if (userMoves >= lesson.limit && chess.turn() === rival) return { state: 'lost', text: `Has llegado a ${lesson.limit} jugadas sin dar mate. Repasa la técnica y vuelve a probar.` }
  }

  if (lesson.goal === 'capture') {
    if (pieceCount(chess, rival) < startPieces[rival]) return { state: 'won', text: `¡Peón capturado en ${userMoves} jugadas! Tu rey estaba dentro del cuadrado.` }
    if (last?.promotion && last.color === rival) return { state: 'lost', text: 'El peón ha coronado. Ve en diagonal hacia la casilla de coronación.' }
  }

  if (lesson.goal === 'promote') {
    if (chess.isStalemate()) return { state: 'lost', text: 'Ahogado: es tablas. Al coronar, comprueba que el rey rival tenga alguna jugada.' }
    if (pieceCount(chess, user) < startPieces[user]) return { state: 'lost', text: 'Te han capturado el peón. El rey tiene que ir por delante para protegerlo.' }
    if (last?.promotion && last.color === user) {
      const attacked = chess.isAttacked(last.to, rival)
      const defended = chess.isAttacked(last.to, user)
      if (attacked && !defended) return { state: 'lost', text: 'Has coronado, pero el rey rival captura la pieza nueva. Corona con tu rey protegiendo la casilla.' }
      return { state: 'won', text: `¡Peón coronado en ${userMoves} jugadas!` }
    }
    if (userMoves >= lesson.limit && chess.turn() === rival) return { state: 'lost', text: `Has llegado a ${lesson.limit} jugadas sin coronar.` }
  }

  if (lesson.goal === 'draw') {
    if (last?.promotion && last.color === rival) return { state: 'lost', text: 'El peón ha coronado. Tu rey tenía que quedarse delante del peón.' }
    if (pieceCount(chess, rival) < startPieces[rival]) return { state: 'won', text: '¡Has capturado el peón! Tablas seguras.' }
    if (chess.isStalemate()) return { state: 'won', text: '¡Ahogado! Son tablas: has defendido bien.' }
    if (chess.isDraw()) return { state: 'won', text: '¡Tablas! Has defendido bien.' }
    if (userMoves >= lesson.limit) return { state: 'won', text: `Has aguantado ${lesson.limit} jugadas: estas posiciones son tablas si el rey se queda delante del peón.` }
  }

  return { state: 'playing' }
}
