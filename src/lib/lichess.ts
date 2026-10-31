import { Chess } from 'chess.js'
import type { RatingInfo } from './chesscom'
import type { Puzzle } from './puzzles'
import { load, save } from './storage'
import type { GameSummary, Result } from './types'

// API de Lichess: https://lichess.org/api
const BASE = 'https://lichess.org'

async function request(url: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('No se ha podido conectar con Lichess. Revisa tu conexión.')
  }
  if (res.status === 404) throw new Error('Usuario no encontrado en Lichess.')
  if (res.status === 429) throw new Error('Lichess está limitando las peticiones. Espera un minuto y vuelve a intentarlo.')
  if (!res.ok) throw new Error(`Lichess ha respondido con un error (${res.status}).`)
  return res
}

interface LiPlayer {
  user?: { name: string }
  rating?: number
  aiLevel?: number
}

export interface LiGame {
  id: string
  variant: string
  speed?: string
  status: string
  createdAt: number
  winner?: 'white' | 'black'
  players: { white: LiPlayer; black: LiPlayer }
  opening?: { name: string }
  pgn?: string
}

const playerName = (p: LiPlayer) => p.user?.name ?? (p.aiLevel ? `Stockfish nivel ${p.aiLevel}` : 'Anónimo')

export function normalizeLichessGame(g: LiGame, username: string): GameSummary | null {
  if (g.variant !== 'standard' || !g.pgn || g.status === 'aborted' || g.status === 'noStart') return null
  let result: Result
  if (g.winner === 'white') result = '1-0'
  else if (g.winner === 'black') result = '0-1'
  else if (g.status === 'started' || g.status === 'created') result = '*'
  else result = '1/2-1/2'
  const u = username.toLowerCase()
  const w = g.players.white.user?.name.toLowerCase()
  const b = g.players.black.user?.name.toLowerCase()
  // Las partidas contra Stockfish de Lichess son partidas contra un bot: van con las de los bots.
  const vsAi = Boolean(g.players.white.aiLevel || g.players.black.aiLevel)
  return {
    id: 'li-' + g.id,
    source: vsAi ? 'bot' : 'lichess',
    url: `${BASE}/${g.id}`,
    white: { name: playerName(g.players.white), rating: g.players.white.rating },
    black: { name: playerName(g.players.black), rating: g.players.black.rating },
    result,
    userColor: w === u ? 'white' : b === u ? 'black' : undefined,
    timeClass: g.speed,
    date: g.createdAt,
    opening: g.opening?.name,
    pgn: g.pgn,
  }
}

/**
 * Partidas de Lichess. Con `since` (milisegundos) solo trae las posteriores a esa fecha, así las
 * importaciones siguientes descargan solo lo nuevo.
 */
export async function fetchLichessGames(username: string, max = 300, since?: number, until?: number): Promise<GameSummary[]> {
  const user = username.trim()
  // Con los relojes en el PGN se puede ver cuánto tiempo pensaste cada jugada (src/lib/clock.ts).
  const params = new URLSearchParams({ max: String(max), pgnInJson: 'true', opening: 'true', clocks: 'true', evals: 'false' })
  if (since) params.set('since', String(since + 1))
  if (until) params.set('until', String(until))
  const res = await request(`${BASE}/api/games/user/${encodeURIComponent(user)}?${params}`, {
    headers: { Accept: 'application/x-ndjson' },
  })
  const text = await res.text()
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => normalizeLichessGame(JSON.parse(l) as LiGame, user))
    .filter((g): g is GameSummary => g !== null)
}

/**
 * Importa solo lo nuevo de Lichess. Se guarda hasta dónde se importó (no la fecha de la última
 * partida guardada: las jugadas desde la app también son de Lichess y harían saltarse el historial).
 */
export async function importLichessNew(username: string, max = 300): Promise<GameSummary[]> {
  const user = username.trim().toLowerCase()
  const until = load<Record<string, number>>('lichessImportedUntil', {})
  const g = await fetchLichessGames(username, max, until[user])
  // Lichess devuelve primero las más recientes: si llega el máximo, puede haber más nuevas detrás.
  // Se piden hacia atrás (hasta 5 tandas) para no saltarse ninguna al mover la marca.
  for (let page = 0, last = g; until[user] && last.length >= max && page < 5; page++) {
    const oldest = Math.min(...last.map((x) => x.date))
    last = await fetchLichessGames(username, max, until[user], oldest - 1)
    g.push(...last)
  }
  const newest = Math.max(until[user] ?? 0, ...g.map((x) => x.date))
  if (newest) save('lichessImportedUntil', { ...load<Record<string, number>>('lichessImportedUntil', {}), [user]: newest })
  return g
}

/** ¿Se ha importado ya alguna vez de Lichess con este usuario? */
export const lichessImported = (username: string) => Boolean(load<Record<string, number>>('lichessImportedUntil', {})[username.trim().toLowerCase()])

export async function fetchLichessStats(username: string): Promise<RatingInfo[]> {
  const res = await request(`${BASE}/api/user/${encodeURIComponent(username.trim())}`)
  const data = (await res.json()) as { perfs?: Record<string, { rating: number; games: number; prov?: boolean }> }
  const modes: [string, string][] = [
    ['rapid', 'Rápidas'],
    ['blitz', 'Blitz'],
    ['bullet', 'Bala'],
    ['classical', 'Clásicas'],
    ['puzzle', 'Problemas'],
  ]
  // Solo los ritmos con partidas con puntuación: las amistosas no dan rating.
  return modes
    .filter(([k]) => data.perfs?.[k]?.games)
    .map(([k, label]) => ({ label, rating: data.perfs![k].rating, games: data.perfs![k].games, provisional: Boolean(data.perfs![k].prov) }))
}

export interface LiPuzzleResponse {
  game: { pgn: string }
  puzzle: { id: string; rating: number; solution: string[]; themes: string[]; initialPly: number }
}

/** Convierte un problema de Lichess (partida en SAN y solución en UCI) al formato interno. */
export function puzzleFromLichess(data: LiPuzzleResponse): Puzzle {
  const sans = data.game.pgn.trim().split(/\s+/)
  const chess = new Chess()
  const fens = [chess.fen()]
  let lastMove: [string, string] | undefined
  const lastMoves: ([string, string] | undefined)[] = [undefined]
  for (const san of sans) {
    const m = chess.move(san)
    lastMove = [m.from, m.to]
    fens.push(chess.fen())
    lastMoves.push(lastMove)
  }
  // La posición del problema es la del final del PGN. Por seguridad, se comprueba también initialPly + 1.
  const first = data.puzzle.solution[0]
  const candidates = [fens.length - 1, data.puzzle.initialPly + 1].filter((i) => i >= 0 && i < fens.length)
  const idx = candidates.find((i) => isLegalUci(fens[i], first)) ?? fens.length - 1
  return {
    id: 'li-' + data.puzzle.id,
    fen: fens[idx],
    moves: data.puzzle.solution,
    rating: data.puzzle.rating,
    themes: data.puzzle.themes,
    source: 'lichess',
    url: `${BASE}/training/${data.puzzle.id}`,
    lastMove: lastMoves[idx],
  }
}

function isLegalUci(fen: string, uci: string): boolean {
  try {
    new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return true
  } catch {
    return false
  }
}

export type Difficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest'

export async function fetchLichessPuzzle(theme: string, difficulty: Difficulty): Promise<Puzzle> {
  const params = new URLSearchParams({ difficulty })
  if (theme !== 'mix') params.set('angle', theme)
  const res = await request(`${BASE}/api/puzzle/next?${params}`)
  return puzzleFromLichess((await res.json()) as LiPuzzleResponse)
}

export interface ExplorerMove {
  uci: string
  san: string
  /** Partidas en la base del explorador con esa jugada. */
  games: number
  /** Puntuación del bando que mueve con esa jugada (0 a 100). */
  score: number
}

/**
 * Jugadas más populares en Lichess en una posición, entre jugadores de 1000 a 1400 en partidas
 * rápidas y blitz (explorador de aperturas de Lichess, gratuito). Necesita conexión.
 */
export async function fetchExplorer(fen: string): Promise<ExplorerMove[]> {
  const params = new URLSearchParams({ variant: 'standard', speeds: 'blitz,rapid', ratings: '1000,1200', fen, moves: '4' })
  const res = await request(`https://explorer.lichess.ovh/lichess?${params}`)
  const data = (await res.json()) as { moves?: { uci: string; san: string; white: number; draws: number; black: number }[] }
  const whiteToMove = fen.split(' ')[1] === 'w'
  return (data.moves ?? []).map((m) => {
    const games = m.white + m.draws + m.black
    const wins = whiteToMove ? m.white : m.black
    return { uci: m.uci, san: m.san, games, score: games ? Math.round(((wins + m.draws / 2) / games) * 100) : 0 }
  })
}
