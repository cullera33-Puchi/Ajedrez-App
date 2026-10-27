import { dayKey, type PuzzleAttempt } from './puzzleLog'
import { isOnlineGame, userRating, weekStart } from './progress'
import type { AnalysisSummary } from './recommend'
import { outcomeFor, type GameSummary } from './types'

/**
 * Resumen de la semana (de lunes a hoy) frente a la semana anterior: partidas reales, precisión,
 * rating, problemas, días de entrenamiento y el tema que más se repite en tus errores.
 */

export interface WeekStats {
  games: number
  w: number
  d: number
  l: number
  /** Precisión media de las partidas analizadas; null si no hay. */
  accuracy: number | null
  /** Ritmo más jugado y cambio de rating en él durante la semana. */
  timeClass?: string
  rating?: number
  ratingDelta?: number
  puzzles: number
  puzzleWins: number
  /** Nivel de problemas al final de la semana y cambio durante ella. */
  puzzleRating?: number
  puzzleDelta?: number
  trainingDays: number
  topTheme?: string
}

const DAY = 86_400_000

export function weekStats(from: number, to: number, games: GameSummary[], summaries: Map<string, AnalysisSummary>, log: PuzzleAttempt[], trainingDays: string[]): WeekStats {
  const online = games.filter(isOnlineGame)
  const inWeek = online.filter((g) => g.date >= from && g.date < to)
  const s: WeekStats = { games: inWeek.length, w: 0, d: 0, l: 0, accuracy: null, puzzles: 0, puzzleWins: 0, trainingDays: 0 }
  for (const g of inWeek) {
    const o = outcomeFor(g)
    if (o === 'victoria') s.w++
    else if (o === 'tablas') s.d++
    else if (o === 'derrota') s.l++
  }
  const analyzed = inWeek.filter((g) => summaries.has(g.id))
  if (analyzed.length) s.accuracy = analyzed.reduce((a, g) => a + summaries.get(g.id)!.accuracy[g.userColor!], 0) / analyzed.length

  // Rating en el ritmo más jugado de la semana: el último de la semana frente al último anterior.
  const byTc = new Map<string, number>()
  for (const g of inWeek) if (g.timeClass) byTc.set(g.timeClass, (byTc.get(g.timeClass) ?? 0) + 1)
  const tc = [...byTc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (tc) {
    const series = online.filter((g) => g.timeClass === tc && userRating(g)).sort((a, b) => a.date - b.date)
    const lastIn = [...series].reverse().find((g) => g.date >= from && g.date < to)
    const before = [...series].reverse().find((g) => g.date < from) ?? series.find((g) => g.date >= from)
    if (lastIn) {
      s.timeClass = tc
      s.rating = userRating(lastIn)
      if (before && before !== lastIn) s.ratingDelta = s.rating! - userRating(before)!
    }
  }

  const tries = log.filter((a) => a.t >= from && a.t < to)
  s.puzzles = tries.length
  s.puzzleWins = tries.filter((a) => a.win).length
  const rated = tries.filter((a) => a.rating !== null)
  if (rated.length) {
    s.puzzleRating = rated[rated.length - 1].rating!
    const start = rated[0].prev
    if (start !== null) s.puzzleDelta = s.puzzleRating - start
  }

  // Día a día con el calendario (no sumando 24 horas, que falla en el cambio de hora).
  for (const d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) if (trainingDays.includes(dayKey(d))) s.trainingDays++

  const themes = new Map<string, number>()
  for (const g of analyzed) for (const th of summaries.get(g.id)!.themes) themes.set(th.theme, (themes.get(th.theme) ?? 0) + th.count)
  s.topTheme = [...themes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return s
}

/** Esta semana (de lunes a ahora) y la anterior completa. */
export function weeklySummary(now: number, games: GameSummary[], summaries: Map<string, AnalysisSummary>, log: PuzzleAttempt[], trainingDays: string[]) {
  const start = weekStart(now)
  const prevStart = weekStart(start - DAY)
  return {
    current: weekStats(start, now + 1, games, summaries, log, trainingDays),
    previous: weekStats(prevStart, start, games, summaries, log, trainingDays),
    /** Días de la semana actual que ya han pasado (incluido hoy). */
    days: Math.floor((now - start) / DAY) + 1,
  }
}
