import { Chess } from 'chess.js'
import { getEngine } from './engine'

export type Classification = 'mejor' | 'buena' | 'imprecision' | 'error' | 'grave'

export const CLASS_LABEL: Record<Classification, string> = {
  mejor: 'Mejor jugada',
  buena: 'Buena',
  imprecision: 'Imprecisión',
  error: 'Error',
  grave: 'Error grave',
}

export const CLASS_SYMBOL: Record<Classification, string> = {
  mejor: '★',
  buena: '',
  imprecision: '?!',
  error: '?',
  grave: '??',
}

/** Evaluación de una posición desde el punto de vista de las blancas. */
export interface PositionEval {
  cp?: number
  mate?: number
  best?: string
  pv: string[]
}

export interface MoveAnalysis {
  ply: number
  san: string
  uci: string
  color: 'w' | 'b'
  winBefore: number
  winAfter: number
  drop: number
  accuracy: number
  classification: Classification
  bestSan?: string
  replySan?: string
  comment: string
}

export interface GameAnalysis {
  depth: number
  positions: PositionEval[]
  moves: MoveAnalysis[]
  accuracy: { white: number; black: number }
  counts: { white: Record<Classification, number>; black: Record<Classification, number> }
}

export interface ParsedGame {
  fens: string[]
  moves: { san: string; uci: string; from: string; to: string; color: 'w' | 'b' }[]
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess()
  chess.loadPgn(pgn)
  const history = chess.history({ verbose: true })
  const fens = history.length ? [history[0].before, ...history.map((m) => m.after)] : [chess.fen()]
  return {
    fens,
    moves: history.map((m) => ({ san: m.san, uci: m.lan, from: m.from, to: m.to, color: m.color })),
  }
}

/** Probabilidad de ganar (0 a 100) de las blancas, con la fórmula que usa Lichess. */
export function winPercent(e: PositionEval): number {
  if (e.mate !== undefined) return e.mate > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, e.cp ?? 0))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Precisión de una jugada a partir de la caída en probabilidad de ganar (fórmula de Lichess). */
export function moveAccuracy(drop: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669
  return Math.max(0, Math.min(100, a))
}

export function classify(drop: number, isBest: boolean): Classification {
  if (isBest) return 'mejor'
  if (drop >= 15) return 'grave'
  if (drop >= 10) return 'error'
  if (drop >= 5) return 'imprecision'
  return 'buena'
}

export function formatEval(e: PositionEval | undefined): string {
  if (!e) return ''
  if (e.mate !== undefined) return e.mate > 0 ? `#${e.mate}` : `#-${Math.abs(e.mate)}`
  if (Math.abs(e.cp ?? 0) >= 10000) return 'Mate'
  const v = (e.cp ?? 0) / 100
  return (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',')
}

const SPANISH_PIECES: Record<string, string> = { N: 'C', B: 'A', R: 'T', Q: 'D', K: 'R' }

/** Pasa una jugada SAN a notación española (C, A, T, D, R). */
export function toSpanishSan(san: string): string {
  return san.replace(/[NBRQK]/g, (c) => SPANISH_PIECES[c])
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Material de las blancas menos el de las negras. */
export function materialBalance(fen: string): number {
  let total = 0
  for (const ch of fen.split(' ')[0]) {
    const v = VALUES[ch.toLowerCase()]
    if (v !== undefined) total += ch === ch.toUpperCase() ? v : -v
  }
  return total
}

/** Juega una línea UCI desde una posición y devuelve las FEN y SAN resultantes. */
function playLine(fen: string, line: string[], plies: number): { fen: string; sans: string[] } {
  const chess = new Chess(fen)
  const sans: string[] = []
  for (const uci of line.slice(0, plies)) {
    try {
      sans.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return { fen: chess.fen(), sans }
}

/** Línea del motor en notación española, a partir de una posición. */
export function lineToSpanish(fen: string, line: string[], plies: number): string {
  return playLine(fen, line, plies).sans.map(toSpanishSan).join(' ')
}

export function uciToSan(fen: string, uci: string | undefined): string | undefined {
  if (!uci) return undefined
  return playLine(fen, [uci], 1).sans[0]
}

function buildComment(
  cls: Classification,
  san: string,
  bestSan: string | undefined,
  before: PositionEval,
  after: PositionEval,
  sign: number,
  materialLoss: number,
  replySan: string | undefined,
): string {
  const parts: string[] = []
  san = toSpanishSan(san)
  bestSan = bestSan && toSpanishSan(bestSan)
  replySan = replySan && toSpanishSan(replySan)
  const mateBefore = before.mate !== undefined ? before.mate * sign : undefined
  const mateAfter = after.mate !== undefined ? after.mate * sign : undefined

  if (cls === 'mejor') parts.push(`${san} es la mejor jugada.`)
  else if (cls === 'buena') parts.push(`${san} es una buena jugada.`)
  else if (mateBefore !== undefined && mateBefore > 0 && !(mateAfter !== undefined && mateAfter > 0))
    parts.push(`Tenías mate en ${mateBefore} con ${bestSan}.`)
  else parts.push(`${CLASS_LABEL[cls]}. Era mejor ${bestSan}.`)

  if (cls === 'imprecision' || cls === 'error' || cls === 'grave') {
    if (mateAfter !== undefined && mateAfter < 0) parts.push(`Permite mate en ${Math.abs(mateAfter)}.`)
    else if (materialLoss >= 2) parts.push(`Con esta jugada pierdes material (unos ${materialLoss} puntos).`)
    if (replySan) parts.push(`La respuesta más fuerte del rival es ${replySan}.`)
  }
  return parts.join(' ')
}

const emptyCounts = (): Record<Classification, number> => ({ mejor: 0, buena: 0, imprecision: 0, error: 0, grave: 0 })

/** Calcula clasificación, precisión y comentarios a partir de las evaluaciones de cada posición. */
export function buildAnalysis(parsed: ParsedGame, positions: PositionEval[], depth: number): GameAnalysis {
  const moves: MoveAnalysis[] = []
  const counts = { white: emptyCounts(), black: emptyCounts() }
  const acc = { white: [] as number[], black: [] as number[] }

  parsed.moves.forEach((m, i) => {
    const before = positions[i]
    const after = positions[i + 1]
    const sign = m.color === 'w' ? 1 : -1
    const toMover = (w: number) => (m.color === 'w' ? w : 100 - w)
    const winBefore = toMover(winPercent(before))
    const winAfter = toMover(winPercent(after))
    const drop = Math.max(0, winBefore - winAfter)
    const isBest = before.best === m.uci
    const cls = classify(drop, isBest)
    const fenBefore = parsed.fens[i]
    const fenAfter = parsed.fens[i + 1]

    // Material que se pierde con la jugada frente a la mejor línea, mirando unas jugadas por delante.
    const bestLine = playLine(fenBefore, before.pv, 5).fen
    const playedLine = playLine(fenAfter, after.pv, 4).fen
    const materialLoss = Math.round((materialBalance(bestLine) - materialBalance(playedLine)) * sign)

    const bestSan = uciToSan(fenBefore, before.best)
    const replySan = uciToSan(fenAfter, after.best)
    const side = m.color === 'w' ? 'white' : 'black'
    counts[side][cls]++
    const accuracy = moveAccuracy(drop)
    acc[side].push(accuracy)

    moves.push({
      ply: i + 1,
      san: m.san,
      uci: m.uci,
      color: m.color,
      winBefore,
      winAfter,
      drop,
      accuracy,
      classification: cls,
      bestSan,
      replySan,
      comment: buildComment(cls, m.san, bestSan, before, after, sign, materialLoss, replySan),
    })
  })

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 100)
  return { depth, positions, moves, accuracy: { white: mean(acc.white), black: mean(acc.black) }, counts }
}

/** Evaluación de posiciones terminales, sin motor. */
function terminalEval(fen: string): PositionEval | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return { cp: chess.turn() === 'w' ? -10000 : 10000, pv: [] }
  if (chess.isDraw() || chess.isStalemate()) return { cp: 0, pv: [] }
  return null
}

export async function analyzeGame(
  parsed: ParsedGame,
  depth: number,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<GameAnalysis> {
  const engine = getEngine()
  const positions: PositionEval[] = []
  for (let i = 0; i < parsed.fens.length; i++) {
    if (signal?.aborted) throw new DOMException('Análisis cancelado', 'AbortError')
    const fen = parsed.fens[i]
    const terminal = terminalEval(fen)
    if (terminal) {
      positions.push(terminal)
    } else {
      const r = await engine.evaluate(fen, depth)
      const sign = fen.split(' ')[1] === 'w' ? 1 : -1
      positions.push({
        cp: r.cp !== undefined ? r.cp * sign : undefined,
        mate: r.mate !== undefined ? r.mate * sign : undefined,
        best: r.best,
        pv: r.pv,
      })
    }
    onProgress(i + 1, parsed.fens.length)
  }
  return buildAnalysis(parsed, positions, depth)
}
