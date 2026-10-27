import type { GameAnalysis } from './analysis'
import { type GameSummary, outcomeFor } from './types'

/**
 * Gestión del tiempo: los PGN de Chess.com y Lichess traen el reloj de cada jugada ({[%clk 0:09:58]}).
 * Con eso se sabe cuánto pensaste cada jugada, si un error lo hiciste con prisa y si te quedaste sin
 * tiempo. Las partidas contra bots y los PGN sin reloj no tienen estos datos.
 */

export interface GameClock {
  /** Tiempo inicial e incremento, en segundos. */
  base: number
  inc: number
  /** Tiempo que quedaba tras cada jugada (por medio movimiento, desde el primero). */
  left: number[]
  /** Segundos que se pensó cada jugada. */
  spent: number[]
}

export function parseClocks(pgn: string): GameClock | null {
  // Partidas diarias («1/259200») o sin control de tiempo: no hay reloj útil.
  const tc = /\[TimeControl "(\d+)(?:\+(\d+))?"\]/.exec(pgn)
  if (!tc) return null
  const base = Number(tc[1])
  const inc = Number(tc[2] ?? 0)
  const moves = pgn.replace(/^\[.*\]\s*$/gm, '')
  const left = [...moves.matchAll(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)].map((m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
  if (!left.length || !base) return null
  const spent = left.map((l, i) => Math.max(0, Math.round(((i < 2 ? base : left[i - 2]) - l + inc) * 10) / 10))
  return { base, inc, left, spent }
}

/** Por debajo de esto, una jugada cuenta como hecha con prisa: 1 % del tiempo inicial, mínimo 2 segundos. */
export const quickLimit = (base: number) => Math.max(2, Math.round(base / 100))

/** Con menos del 10 % del tiempo inicial en el reloj se está en apuros. */
export const lowTime = (c: GameClock, left: number) => left < c.base * 0.1

export function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)} s`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return r ? `${m} min ${r} s` : `${m} min`
}

export const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export interface TimingSummary {
  /** Tus jugadas, las hechas con prisa y las hechas con poco tiempo en el reloj. */
  moves: number
  quick: number
  low: number
  /** Tus errores y errores graves, y cuántos de ellos con prisa o con poco tiempo. */
  errors: number
  quickErrors: number
  lowErrors: number
  /** Segundos pensados en total (para la media por jugada). */
  spent: number
  /** Perdiste la partida por tiempo. */
  lostOnTime: boolean
}

/** Resumen del uso del tiempo en una partida; null si no tiene reloj o no se sabe tu color. */
export function timingFor(game: GameSummary, analysis: GameAnalysis): TimingSummary | null {
  const c = parseClocks(game.pgn)
  if (!c || !game.userColor) return null
  const side = game.userColor === 'white' ? 'w' : 'b'
  const limit = quickLimit(c.base)
  const t: TimingSummary = { moves: 0, quick: 0, low: 0, errors: 0, quickErrors: 0, lowErrors: 0, spent: 0, lostOnTime: false }
  for (const m of analysis.moves) {
    const i = m.ply - 1
    if (m.color !== side || i >= c.left.length) continue
    const quick = c.spent[i] < limit
    const low = lowTime(c, c.left[i])
    const error = m.classification === 'error' || m.classification === 'grave'
    t.moves++
    t.spent += c.spent[i]
    if (quick) t.quick++
    if (low) t.low++
    if (error) {
      t.errors++
      if (quick) t.quickErrors++
      if (low) t.lowErrors++
    }
  }
  const termination = /\[Termination "([^"]*)"\]/.exec(game.pgn)?.[1] ?? ''
  t.lostOnTime = outcomeFor(game) === 'derrota' && /time|tiempo/i.test(termination)
  return t
}

/** Suma de varias partidas, para el panel de progreso. */
export function totalTiming(list: TimingSummary[]): TimingSummary & { games: number; lostOnTimeGames: number } {
  const z = { moves: 0, quick: 0, low: 0, errors: 0, quickErrors: 0, lowErrors: 0, spent: 0, lostOnTime: false, games: 0, lostOnTimeGames: 0 }
  for (const t of list) {
    z.moves += t.moves
    z.quick += t.quick
    z.low += t.low
    z.errors += t.errors
    z.quickErrors += t.quickErrors
    z.lowErrors += t.lowErrors
    z.spent += t.spent
    z.games++
    if (t.lostOnTime) z.lostOnTimeGames++
  }
  return z
}

/** Consejo según dónde se concentran tus errores. */
export function timingAdvice(t: TimingSummary): string | null {
  if (t.errors < 3) return null
  const quickShare = t.moves ? t.quick / t.moves : 0
  const quickErrShare = t.quickErrors / t.errors
  const lowErrShare = t.lowErrors / t.errors
  if (quickErrShare >= 0.4 && quickErrShare > quickShare * 1.3)
    return 'Muchos de tus errores llegan cuando juegas deprisa. Antes de mover, tómate unos segundos para mirar qué ataca el rival y qué piezas tuyas quedan sin defender.'
  if (lowErrShare >= 0.3) return 'Muchos errores llegan con poco tiempo en el reloj. Juega la apertura más rápido para llegar con tiempo al medio juego y al final.'
  return null
}
