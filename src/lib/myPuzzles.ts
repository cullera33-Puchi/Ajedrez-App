import { Chess } from 'chess.js'
import { type GameAnalysis, type ParsedGame, toSpanishSan, uciToSan } from './analysis'
import { lineScore } from './bots'
import { db } from './db'
import { getEngine } from './engine'
import type { Puzzle } from './puzzles'
import { mistakeThemes } from './recommend'
import { type GameSummary, opponentOf } from './types'

/**
 * Problemas con las posiciones de los errores del propio usuario, con repaso espaciado:
 * si se acierta, vuelve al cabo de 1, 3, 8… días; si se falla, en unos minutos.
 */

export interface MyPuzzle {
  id: string
  gameId: string
  ply: number
  fen: string
  /** Solución: la jugada que había que encontrar (UCI). */
  moves: string[]
  /** Lo que se jugó en la partida (notación española). */
  playedSan: string
  bestSan: string
  opponent: string
  date: number
  themes: string[]
  srs: { due: number; interval: number; reps: number; lapses: number }
}

const DAY = 24 * 60 * 60 * 1000
const MAX_PER_GAME = 4
/** Ventaja mínima (centipeones) de la mejor jugada sobre la segunda para que el ejercicio tenga una solución clara. */
const MIN_GAP = 150

let cache = new Map<string, MyPuzzle>()

export async function initMyPuzzles(): Promise<void> {
  const all = await (await db()).getAll<MyPuzzle>('puzzles')
  cache = new Map(all.map((p) => [p.id, p]))
}

export const allMyPuzzles = () => [...cache.values()]

async function store(puzzles: MyPuzzle[]) {
  for (const p of puzzles) cache.set(p.id, p)
  await (await db()).putMany('puzzles', puzzles.map((p) => [p.id, p]))
}

export function duePuzzles(now = Date.now()): MyPuzzle[] {
  return allMyPuzzles()
    .filter((p) => p.srs.due <= now)
    .sort((a, b) => {
      // Primero los repasos atrasados, después los nuevos (de las partidas más recientes)
      const ar = a.srs.reps + a.srs.lapses > 0 ? 0 : 1
      const br = b.srs.reps + b.srs.lapses > 0 ? 0 : 1
      return ar - br || (ar === 0 ? a.srs.due - b.srs.due : b.date - a.date)
    })
}

export function nextReviewIn(now = Date.now()): number | undefined {
  const future = allMyPuzzles().map((p) => p.srs.due).filter((d) => d > now)
  return future.length ? Math.min(...future) - now : undefined
}

export function scheduleNext(p: MyPuzzle, solved: boolean, now = Date.now()): MyPuzzle {
  const s = p.srs
  if (solved) {
    const interval = s.interval ? Math.round(s.interval * 2.5) : 1
    return { ...p, srs: { ...s, reps: s.reps + 1, interval, due: now + interval * DAY } }
  }
  return { ...p, srs: { ...s, lapses: s.lapses + 1, interval: 0, due: now + 10 * 60 * 1000 } }
}

export async function recordResult(id: string, solved: boolean): Promise<void> {
  const p = cache.get(id)
  if (p) await store([scheduleNext(p, solved)])
}

export function toPuzzle(p: MyPuzzle): Puzzle {
  return { id: p.id, fen: p.fen, moves: p.moves, rating: 0, themes: p.themes, source: 'mine' }
}

/** Candidatos: errores y errores graves del usuario (y mates no vistos o permitidos). */
export function candidatePlies(game: GameSummary, parsed: ParsedGame, analysis: GameAnalysis): { ply: number; themes: string[] }[] {
  const side = game.userColor === 'white' ? 'w' : game.userColor === 'black' ? 'b' : undefined
  if (!side) return []
  const byPly = new Map(mistakeThemes(parsed, analysis, side).map((m) => [m.ply, m.themes]))
  const out: { ply: number; themes: string[] }[] = []
  for (const m of analysis.moves) {
    if (m.color !== side) continue
    if (m.classification === 'error' || m.classification === 'grave' || byPly.has(m.ply)) out.push({ ply: m.ply, themes: byPly.get(m.ply) ?? [] })
  }
  return out
}

/** Genera los problemas de una partida, verificando con el motor que la solución es clara. */
export async function generateForGame(game: GameSummary, parsed: ParsedGame, analysis: GameAnalysis): Promise<number> {
  const engine = getEngine('main')
  const made: MyPuzzle[] = []
  const opponent = opponentOf(game)
  if (game.source === 'demo') return 0
  for (const c of candidatePlies(game, parsed, analysis)) {
    if (made.length >= MAX_PER_GAME) break
    const id = `${game.id}:${c.ply}`
    if (cache.has(id)) continue
    const fen = parsed.fens[c.ply - 1]
    const played = parsed.moves[c.ply - 1]
    if (new Chess(fen).moves().length < 2) continue
    const res = await engine.evaluate(fen, 12, 2)
    const [l1, l2] = res.lines
    if (!l1 || l1.move === played.uci) continue
    const gap = l2 ? lineScore(l1) - lineScore(l2) : Infinity
    const clearMate = l1.mate !== undefined && l1.mate > 0 && !(l2?.mate !== undefined && l2.mate > 0)
    if (gap < MIN_GAP && !clearMate) continue
    made.push({
      id,
      gameId: game.id,
      ply: c.ply,
      fen,
      moves: [l1.move],
      playedSan: toSpanishSan(played.san),
      bestSan: toSpanishSan(uciToSan(fen, l1.move) ?? l1.move),
      opponent,
      date: game.date,
      themes: c.themes,
      srs: { due: Date.now(), interval: 0, reps: 0, lapses: 0 },
    })
  }
  if (made.length) await store(made)
  return made.length
}

/** Solo para pruebas. */
export function resetMyPuzzlesForTests() {
  cache = new Map()
}
