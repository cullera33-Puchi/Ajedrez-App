import { Chess } from 'chess.js'
import type { RatingInfo } from './chesscom'
import type { Puzzle } from './puzzles'
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
  return {
    id: 'li-' + g.id,
    source: 'lichess',
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

export async function fetchLichessGames(username: string, max = 40): Promise<GameSummary[]> {
  const user = username.trim()
  const params = new URLSearchParams({ max: String(max), pgnInJson: 'true', opening: 'true', clocks: 'false', evals: 'false' })
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

export async function fetchLichessStats(username: string): Promise<RatingInfo[]> {
  const res = await request(`${BASE}/api/user/${encodeURIComponent(username.trim())}`)
  const data = (await res.json()) as { perfs?: Record<string, { rating: number; games: number }> }
  const modes: [string, string][] = [
    ['rapid', 'Rápidas'],
    ['blitz', 'Blitz'],
    ['bullet', 'Bala'],
    ['classical', 'Clásicas'],
    ['puzzle', 'Problemas'],
  ]
  return modes
    .filter(([k]) => data.perfs?.[k]?.games)
    .map(([k, label]) => ({ label, rating: data.perfs![k].rating, games: data.perfs![k].games }))
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
