import type { Puzzle } from './puzzles'
import { load, save } from './storage'

/**
 * Histórico de problemas resueltos, con fecha, para ver la evolución por día.
 * Los de «Mis errores» se registran pero no tienen dificultad ni cambian el nivel.
 */

export interface PuzzleAttempt {
  /** Momento del intento (ms). Sirve también de identificador al fusionar copias. */
  t: number
  win: boolean
  source: Puzzle['source']
  /** Dificultad del problema; null en los de tus errores. */
  difficulty: number | null
  /** Tu nivel antes y después del intento; null si no cambia. */
  prev: number | null
  rating: number | null
}

export interface DayStats {
  day: string
  total: number
  wins: number
  /** Dificultad media de los problemas con dificultad. */
  avgDifficulty: number | null
  /** Nivel al final del día (o el último conocido). */
  rating: number | null
}

const KEY = 'puzzleLog'
const MAX = 5000

export const loadLog = (): PuzzleAttempt[] => load<PuzzleAttempt[]>(KEY, [])

export function logAttempt(a: PuzzleAttempt) {
  save(KEY, [...loadLog(), a].slice(-MAX))
}

/** Une dos históricos sin duplicar intentos. */
export function mergeLogs(a: PuzzleAttempt[], b: PuzzleAttempt[]): PuzzleAttempt[] {
  const byT = new Map<number, PuzzleAttempt>()
  for (const x of [...a, ...b]) byT.set(x.t, x)
  return [...byT.values()].sort((x, y) => x.t - y.t).slice(-MAX)
}

export function dayKey(t: number | Date): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Estadísticas de los últimos `days` días, incluidos los días sin problemas (total 0). */
export function dailyStats(log: PuzzleAttempt[], days: number, now = Date.now()): DayStats[] {
  const sorted = [...log].sort((a, b) => a.t - b.t)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  let rating: number | null = null
  for (const a of sorted) if (a.t < start.getTime() && a.rating !== null) rating = a.rating

  const out: DayStats[] = []
  let i = sorted.findIndex((a) => a.t >= start.getTime())
  if (i < 0) i = sorted.length
  for (let d = 0; d < days; d++) {
    const day = new Date(start)
    day.setDate(start.getDate() + d)
    const key = dayKey(day)
    let total = 0
    let wins = 0
    let sum = 0
    let rated = 0
    while (i < sorted.length && dayKey(sorted[i].t) === key) {
      const a = sorted[i++]
      total++
      if (a.win) wins++
      if (a.difficulty !== null) {
        sum += a.difficulty
        rated++
      }
      if (a.rating !== null) rating = a.rating
    }
    out.push({ day: key, total, wins, avgDifficulty: rated ? Math.round(sum / rated) : null, rating })
  }
  return out
}

/** Cambio de nivel en el periodo: del nivel previo al primer día hasta el último registrado. */
export function ratingChange(log: PuzzleAttempt[], stats: DayStats[]): number | null {
  const end = stats[stats.length - 1]?.rating
  if (end === null || end === undefined) return null
  const start = new Date(`${stats[0].day}T00:00:00`).getTime()
  let before: number | null = null
  for (const a of log) if (a.t < start && a.rating !== null) before = a.rating
  if (before === null) before = log.find((a) => a.t >= start && a.prev !== null)?.prev ?? null
  return before === null ? null : end - before
}
