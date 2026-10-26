import type { AnalysisSummary } from './recommend'
import { outcomeFor, type GameSummary } from './types'

/**
 * Cálculos del panel de progreso. Solo cuentan las partidas reales del usuario (Chess.com y Lichess):
 * nunca las jugadas contra bots.
 */

export const isOnlineGame = (g: GameSummary) => Boolean(g.userColor) && (g.source === 'chesscom' || g.source === 'lichess')

export const userRating = (g: GameSummary) => (g.userColor === 'white' ? g.white.rating : g.black.rating)

/** Ritmos jugados, del más al menos frecuente. */
export function timeClasses(games: GameSummary[]): { tc: string; count: number }[] {
  const m = new Map<string, number>()
  for (const g of games) if (g.timeClass) m.set(g.timeClass, (m.get(g.timeClass) ?? 0) + 1)
  return [...m.entries()].map(([tc, count]) => ({ tc, count })).sort((a, b) => b.count - a.count)
}

export interface Results {
  n: number
  w: number
  d: number
  l: number
}

export function results(games: GameSummary[]): Results {
  const r = { n: 0, w: 0, d: 0, l: 0 }
  for (const g of games) {
    const o = outcomeFor(g)
    if (!o) continue
    r.n++
    if (o === 'victoria') r.w++
    else if (o === 'tablas') r.d++
    else r.l++
  }
  return r
}

/** Puntuación de 0 a 100: victoria 1, tablas 0,5. */
export const score = (r: Results) => (r.n ? Math.round(((r.w + r.d / 2) / r.n) * 100) : 0)

/** Rating del usuario partida a partida, de la más antigua a la más reciente. */
export function ratingSeries(games: GameSummary[]): { date: number; rating: number; game: GameSummary }[] {
  return games
    .filter((g) => userRating(g))
    .sort((a, b) => a.date - b.date)
    .map((g) => ({ date: g.date, rating: userRating(g)!, game: g }))
}

/** Lunes (a las 0:00) de la semana de una fecha. */
export function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** Precisión media y errores graves por partida, semana a semana, de las partidas analizadas. */
export function weeklyAccuracy(games: GameSummary[], summaries: Map<string, AnalysisSummary>) {
  const weeks = new Map<number, { sum: number; graves: number; n: number }>()
  for (const g of games) {
    const s = summaries.get(g.id)
    if (!s || !g.userColor) continue
    const w = weekStart(g.date)
    const cur = weeks.get(w) ?? { sum: 0, graves: 0, n: 0 }
    cur.sum += s.accuracy[g.userColor]
    cur.graves += s.counts[g.userColor].grave
    cur.n++
    weeks.set(w, cur)
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, v]) => ({ week, accuracy: v.sum / v.n, graves: v.graves / v.n, n: v.n }))
}

const FAMILY_END = /^(Game|Defense|Defence|Opening|Gambit|Attack|System)$/

/**
 * Familia de una apertura: «Italian Game: Two Knights Defense» (Lichess) o «Italian Game Two Knights
 * Defense» (Chess.com) se agrupan en «Italian Game».
 */
export function openingFamily(o: string): string {
  const words = o.split(/[:,]/)[0].trim().split(/\s+/)
  const end = words.findIndex((w) => FAMILY_END.test(w))
  return (end >= 0 ? words.slice(0, end + 1) : words).join(' ')
}

export interface OpeningStat extends Results {
  opening: string
  color: 'white' | 'black'
  score: number
}

/** Resultado por apertura y color, con un mínimo de partidas para que sea significativo. */
export function openingStats(games: GameSummary[], minGames = 3): OpeningStat[] {
  const groups = new Map<string, GameSummary[]>()
  for (const g of games) {
    if (!g.opening || !g.userColor) continue
    const key = `${g.userColor}|${openingFamily(g.opening)}`
    groups.set(key, [...(groups.get(key) ?? []), g])
  }
  const out: OpeningStat[] = []
  for (const [key, list] of groups) {
    const r = results(list)
    if (r.n < minGames) continue
    const [color, opening] = key.split('|') as ['white' | 'black', string]
    out.push({ opening, color, ...r, score: score(r) })
  }
  return out.sort((a, b) => a.score - b.score || b.n - a.n)
}

/** Temas de los errores sumados en las partidas analizadas. */
export function themeTotals(games: GameSummary[], summaries: Map<string, AnalysisSummary>): { theme: string; count: number }[] {
  const m = new Map<string, number>()
  for (const g of games) for (const t of summaries.get(g.id)?.themes ?? []) m.set(t.theme, (m.get(t.theme) ?? 0) + t.count)
  return [...m.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count)
}
