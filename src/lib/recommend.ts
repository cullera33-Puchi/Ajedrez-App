import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import { type GameAnalysis, materialBalance, type ParsedGame, parsePgn, playLine } from './analysis'
import { loadReport } from './coach'
import { loadAnalysis } from './games'
import type { GameSummary } from './types'

/**
 * Deduce qué temas de problemas habrían evitado cada error del usuario, a partir de los datos
 * de Stockfish: mates vistos o permitidos, piezas que se pierden o se dejan de ganar y dobles ataques.
 */

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

export interface MistakeThemes {
  ply: number
  themes: string[]
}

export interface ThemeCount {
  theme: string
  count: number
}

function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
}

/** ¿La pieza de `sq` ataca a la vez dos objetivos valiosos (rey, piezas de más valor o sin defensa)? */
export function isFork(chess: Chess, sq: Square): boolean {
  const piece = chess.get(sq)
  if (!piece) return false
  const enemy = piece.color === 'w' ? 'b' : 'w'
  let targets = 0
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy) continue
      const v = VALUE[cell.type]
      if (cell.type !== 'k' && (v < 3 || (v <= VALUE[piece.type] && chess.attackers(cell.square, enemy).length > 0))) continue
      if (chess.attackers(cell.square, piece.color).includes(sq)) targets++
    }
  }
  return targets >= 2
}

/** Temas asociados a cada error y error grave del bando indicado (o de ambos si no se indica). */
export function mistakeThemes(parsed: ParsedGame, analysis: GameAnalysis, side?: 'w' | 'b'): MistakeThemes[] {
  const out: MistakeThemes[] = []
  for (const m of analysis.moves) {
    if (side && m.color !== side) continue
    const i = m.ply - 1
    const before = analysis.positions[i]
    const after = analysis.positions[i + 1]
    const fenBefore = parsed.fens[i]
    const fenAfter = parsed.fens[i + 1]
    if (!before || !after || !fenAfter) continue
    const sign = m.color === 'w' ? 1 : -1
    const themes = new Set<string>()

    const mateBefore = before.mate !== undefined ? before.mate * sign : undefined
    const mateAfter = after.mate !== undefined ? after.mate * sign : undefined
    const missedMate = mateBefore !== undefined && mateBefore > 0 && !(mateAfter !== undefined && mateAfter > 0)
    const allowedMate = mateAfter !== undefined && mateAfter < 0 && !(mateBefore !== undefined && mateBefore < 0)
    // Errores y errores graves; los mates no vistos o permitidos cuentan siempre, aunque la partida ya estuviera decidida.
    if (m.classification !== 'error' && m.classification !== 'grave' && !missedMate && !allowedMate) continue
    if (missedMate) themes.add(mateBefore <= 1 ? 'mateIn1' : 'mateIn2')
    if (allowedMate) {
      themes.add(Math.abs(mateAfter!) <= 1 ? 'mateIn1' : 'mateIn2')
      themes.add('defensiveMove')
    }

    const materialLoss = (materialBalance(playLine(fenBefore, before.pv, 5).fen) - materialBalance(playLine(fenAfter, after.pv, 4).fen)) * sign

    // Lo que el rival puede hacer tras el error
    if (after.best) {
      const chess = new Chess(fenAfter)
      const reply = playUci(chess, after.best)
      if (reply) {
        if (reply.captured && VALUE[reply.captured] >= 3 && materialLoss >= 2) themes.add('hangingPiece')
        if (isFork(chess, reply.to)) {
          themes.add('fork')
          themes.add('defensiveMove')
        }
      }
    }

    // Lo que el usuario dejó de jugar
    if (before.best && before.best !== m.uci) {
      const chess = new Chess(fenBefore)
      const best = playUci(chess, before.best)
      if (best) {
        const gain = (materialBalance(playLine(fenBefore, before.pv, 5).fen) - materialBalance(fenBefore)) * sign
        if (best.captured && VALUE[best.captured] >= 3 && gain >= 2) themes.add('hangingPiece')
        if (isFork(chess, best.to)) themes.add('fork')
      }
    }

    if (!themes.size && materialLoss >= 2) themes.add('hangingPiece')
    if (themes.size) out.push({ ply: m.ply, themes: [...themes] })
  }
  return out
}

function addCounts(counts: Map<string, number>, themes: string[]) {
  for (const t of themes) counts.set(t, (counts.get(t) ?? 0) + 1)
}

const sorted = (counts: Map<string, number>): ThemeCount[] =>
  [...counts.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count)

const sideOf = (g: GameSummary) => (g.userColor === 'white' ? 'w' : g.userColor === 'black' ? 'b' : undefined)

/** Temas a practicar según los errores de una partida. */
export function themesForGame(game: GameSummary, parsed: ParsedGame, analysis: GameAnalysis): ThemeCount[] {
  const counts = new Map<string, number>()
  for (const m of mistakeThemes(parsed, analysis, sideOf(game))) addCounts(counts, m.themes)
  addCounts(counts, loadReport(game.id)?.temas ?? [])
  return sorted(counts)
}

export interface Recommendation {
  themes: ThemeCount[]
  /** Partidas analizadas que se han tenido en cuenta. */
  games: number
}

/** Recomendación a partir de las últimas partidas del usuario que ya están analizadas. */
export function recommendThemes(games: GameSummary[], maxGames = 15): Recommendation {
  const counts = new Map<string, number>()
  let used = 0
  for (const g of [...games].sort((a, b) => b.date - a.date)) {
    if (used >= maxGames) break
    if (!g.userColor) continue
    const analysis = loadAnalysis(g.id)
    if (!analysis) continue
    let parsed: ParsedGame
    try {
      parsed = parsePgn(g.pgn)
    } catch {
      continue
    }
    for (const t of themesForGame(g, parsed, analysis)) counts.set(t.theme, (counts.get(t.theme) ?? 0) + t.count)
    used++
  }
  return { themes: sorted(counts), games: used }
}
