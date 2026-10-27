import { Chess } from 'chess.js'
import { parsePgn } from './analysis'
import { isOnlineGame, openingFamily, results, type Results } from './progress'
import { load, save } from './storage'
import type { Color, GameSummary } from './types'

/**
 * Tus aperturas: a partir de tus partidas de Chess.com y Lichess se construye, para cada apertura,
 * el árbol de lo que juegas tú y lo que te juegan los rivales en las primeras jugadas. Stockfish
 * revisa tus jugadas y, si alguna es claramente peor, el repertorio propone la buena.
 */

/** Primeras medias jugadas que se estudian. */
export const MAX_PLY = 14
/** Partidas mínimas en una posición para tenerla en cuenta. */
export const MIN_SUPPORT = 2

export interface MoveStat {
  san: string
  uci: string
  count: number
}

export interface OpeningNode {
  /** FEN sin contadores de jugadas: así se juntan las transposiciones. */
  key: string
  fen: string
  ply: number
  /** Partidas que pasaron por esta posición. */
  count: number
  /** Jugadas del bando que mueve, de la más a la menos frecuente. */
  moves: MoveStat[]
  userToMove: boolean
}

export interface OpeningGroup {
  id: string
  family: string
  color: Color
  games: GameSummary[]
  results: Results
}

export const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** Las aperturas más jugadas con cada color (solo partidas reales). */
export function topOpenings(all: GameSummary[], perColor = 5): { white: OpeningGroup[]; black: OpeningGroup[] } {
  const groups = new Map<string, OpeningGroup>()
  for (const g of all) {
    if (!isOnlineGame(g) || !g.opening) continue
    const family = openingFamily(g.opening)
    const id = `${g.userColor}|${family}`
    let grp = groups.get(id)
    if (!grp) groups.set(id, (grp = { id, family, color: g.userColor!, games: [], results: { n: 0, w: 0, d: 0, l: 0 } }))
    grp.games.push(g)
  }
  for (const grp of groups.values()) grp.results = results(grp.games)
  const pick = (c: Color) =>
    [...groups.values()]
      .filter((x) => x.color === c)
      .sort((a, b) => b.games.length - a.games.length)
      .slice(0, perColor)
  return { white: pick('white'), black: pick('black') }
}

/** Árbol de posiciones de un grupo de partidas, hasta MAX_PLY. */
export function buildTree(group: OpeningGroup): Map<string, OpeningNode> {
  const nodes = new Map<string, OpeningNode>()
  const userChar = group.color === 'white' ? 'w' : 'b'
  for (const g of group.games) {
    let parsed
    try {
      parsed = parsePgn(g.pgn)
    } catch {
      continue
    }
    const seen = new Set<string>()
    for (let i = 0; i < Math.min(MAX_PLY, parsed.moves.length); i++) {
      const fen = parsed.fens[i]
      const key = positionKey(fen)
      // Una partida que repite posición solo cuenta una vez.
      if (seen.has(key)) break
      seen.add(key)
      let node = nodes.get(key)
      if (!node) nodes.set(key, (node = { key, fen, ply: i, count: 0, moves: [], userToMove: fen.split(' ')[1] === userChar }))
      node.count++
      const m = parsed.moves[i]
      const stat = node.moves.find((x) => x.uci === m.uci)
      if (stat) stat.count++
      else node.moves.push({ san: m.san, uci: m.uci, count: 1 })
    }
  }
  for (const n of nodes.values()) n.moves.sort((a, b) => b.count - a.count)
  return nodes
}

export function childKey(fen: string, uci: string): { key: string; fen: string } | null {
  try {
    const c = new Chess(fen)
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return { key: positionKey(c.fen()), fen: c.fen() }
  } catch {
    return null
  }
}

export const START_KEY = positionKey(new Chess().fen())

// ---------------------------------------------------------------------------
// Revisión con Stockfish

export interface Review {
  /** Mejor jugada según Stockfish (UCI y SAN). */
  best: string
  bestSan: string
  /** Caída de probabilidad de ganar de tu jugada habitual respecto a la mejor (0 a 100). */
  drop: number
}

const REVIEW_KEY = 'openingReview'

/** Revisiones guardadas por posición y jugada («clave|uci»), para no repetir el cálculo. */
export const loadReviews = (): Record<string, Review> => load(REVIEW_KEY, {})
export function saveReview(key: string, uci: string, r: Review) {
  save(REVIEW_KEY, { ...loadReviews(), [`${key}|${uci}`]: r })
}
export const reviewFor = (reviews: Record<string, Review>, key: string, uci: string) => reviews[`${key}|${uci}`]

/** Probabilidad de ganar (0 a 100) del bando que mueve, a partir de su evaluación. */
export function moverWin(cp?: number, mate?: number): number {
  if (mate !== undefined) return mate > 0 ? 100 : 0
  const c = Math.max(-1000, Math.min(1000, cp ?? 0))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1)
}

/** Umbrales de la caída de probabilidad de ganar, como en el análisis de partidas. */
export const reviewLabel = (drop: number): 'buena' | 'imprecision' | 'error' => (drop >= 10 ? 'error' : drop >= 5 ? 'imprecision' : 'buena')

// ---------------------------------------------------------------------------
// Repertorio

export interface RepertoireMove {
  uci: string
  san: string
  /** Veces que la jugaste en esa posición y partidas que pasaron por ella. */
  played: number
  of: number
  /** Si se cambia tu jugada habitual por la de Stockfish. */
  corrected?: { yourSan: string; drop: number }
}

/** Tu jugada en una posición: la habitual o, si Stockfish la ve claramente peor, la mejor. */
export function repertoireMove(node: OpeningNode, reviews: Record<string, Review>): RepertoireMove | null {
  const top = node.moves[0]
  if (!top) return null
  const r = reviewFor(reviews, node.key, top.uci)
  if (r && r.drop >= 5 && r.best !== top.uci) {
    return { uci: r.best, san: r.bestSan, played: top.count, of: node.count, corrected: { yourSan: top.san, drop: r.drop } }
  }
  return { uci: top.uci, san: top.san, played: top.count, of: node.count }
}

export interface LineStep {
  key: string
  fen: string
  san: string
  uci: string
  user: boolean
  rep?: RepertoireMove
  /** En jugadas del rival: proporción con que te la juegan. */
  share?: number
}

/** Tu línea habitual: tu jugada de repertorio y la respuesta más frecuente del rival, mientras haya datos. */
export function mainLine(tree: Map<string, OpeningNode>, reviews: Record<string, Review>): LineStep[] {
  const steps: LineStep[] = []
  let fen = new Chess().fen()
  let key = START_KEY
  for (let i = 0; i < MAX_PLY; i++) {
    const node = tree.get(key)
    if (!node || node.count < MIN_SUPPORT) break
    let uci: string
    let san: string
    let rep: RepertoireMove | undefined
    let share: number | undefined
    if (node.userToMove) {
      rep = repertoireMove(node, reviews) ?? undefined
      if (!rep) break
      uci = rep.uci
      san = rep.san
    } else {
      const top = node.moves[0]
      uci = top.uci
      san = top.san
      share = top.count / node.count
    }
    steps.push({ key, fen, san, uci, user: node.userToMove, rep, share })
    const next = childKey(fen, uci)
    if (!next) break
    fen = next.fen
    key = next.key
  }
  return steps
}

/** Posiciones con tu turno que conviene revisar con Stockfish (con datos suficientes). */
export function nodesToReview(tree: Map<string, OpeningNode>): OpeningNode[] {
  return [...tree.values()].filter((n) => n.userToMove && n.count >= MIN_SUPPORT && n.moves.length).sort((a, b) => a.ply - b.ply)
}

/**
 * Respuesta del rival para practicar: al azar, según lo que te juegan de verdad (con al menos
 * MIN_SUPPORT partidas, o la más frecuente si ninguna llega).
 */
export function pickReply(node: OpeningNode, rnd = Math.random): MoveStat | null {
  const options = node.moves.filter((m) => m.count >= MIN_SUPPORT)
  const list = options.length ? options : node.moves.slice(0, 1)
  const total = list.reduce((s, m) => s + m.count, 0)
  let x = rnd() * total
  for (const m of list) {
    x -= m.count
    if (x < 0) return m
  }
  return list[0] ?? null
}

// ---------------------------------------------------------------------------
// Repaso espaciado por apertura

export interface OpeningSrs {
  due: number
  interval: number
  reps: number
  lapses: number
}

const SRS_KEY = 'openingSrs'
const DAY = 86_400_000

export const loadOpeningSrs = (): Record<string, OpeningSrs> => load(SRS_KEY, {})

export function recordPractice(id: string, clean: boolean, now = Date.now()) {
  const all = loadOpeningSrs()
  const s = all[id] ?? { due: now, interval: 0, reps: 0, lapses: 0 }
  if (clean) {
    const interval = s.interval ? Math.round(s.interval * 2.5) : 1
    all[id] = { ...s, reps: s.reps + 1, interval, due: now + interval * DAY }
  } else {
    all[id] = { ...s, lapses: s.lapses + 1, interval: 0, due: now + 10 * 60 * 1000 }
  }
  save(SRS_KEY, all)
}

/** ¿Toca repasar esta apertura? (nunca practicada o vencida). */
export const isDue = (srs: Record<string, OpeningSrs>, id: string, now = Date.now()) => !srs[id] || srs[id].due <= now
