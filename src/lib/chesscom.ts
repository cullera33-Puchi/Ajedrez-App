import type { GameSummary, Result } from './types'

// API pública de Chess.com (solo lectura): https://www.chess.com/news/view/published-data-api
const BASE = 'https://api.chess.com/pub'

const DRAW_CODES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

interface CcPlayer {
  username: string
  rating?: number
  result: string
}

export interface CcGame {
  url: string
  uuid?: string
  pgn?: string
  end_time: number
  time_class?: string
  rules?: string
  white: CcPlayer
  black: CcPlayer
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('No se ha podido conectar con Chess.com. Revisa tu conexión.')
  }
  if (res.status === 404) throw new Error('Usuario no encontrado en Chess.com.')
  if (res.status === 429) throw new Error('Chess.com está limitando las peticiones. Espera un minuto y vuelve a intentarlo.')
  if (!res.ok) throw new Error(`Chess.com ha respondido con un error (${res.status}).`)
  return res.json() as Promise<T>
}

/** Extrae un nombre de apertura legible de la cabecera ECOUrl del PGN. */
export function openingFromPgn(pgn: string): string | undefined {
  const m = pgn.match(/\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/)
  if (!m) return undefined
  const words: string[] = []
  for (const w of m[1].split('-')) {
    if (/^\d/.test(w)) break
    words.push(w)
  }
  return words.join(' ') || undefined
}

export function normalizeChesscomGame(g: CcGame, username: string): GameSummary | null {
  if ((g.rules && g.rules !== 'chess') || !g.pgn) return null
  let result: Result
  if (g.white.result === 'win') result = '1-0'
  else if (g.black.result === 'win') result = '0-1'
  else if (DRAW_CODES.has(g.white.result) || DRAW_CODES.has(g.black.result)) result = '1/2-1/2'
  else result = '*'
  const u = username.toLowerCase()
  const userColor =
    g.white.username.toLowerCase() === u ? 'white' : g.black.username.toLowerCase() === u ? 'black' : undefined
  return {
    id: 'cc-' + (g.uuid ?? g.url.split('/').pop()),
    source: 'chesscom',
    url: g.url,
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    result,
    userColor,
    timeClass: g.time_class,
    date: g.end_time * 1000,
    opening: openingFromPgn(g.pgn),
    pgn: g.pgn,
  }
}

/** Descarga las partidas de los últimos meses. Las peticiones van en serie, como pide Chess.com. */
export async function fetchChesscomGames(username: string, months = 2): Promise<GameSummary[]> {
  const user = username.trim().toLowerCase()
  const { archives } = await getJson<{ archives: string[] }>(`${BASE}/player/${encodeURIComponent(user)}/games/archives`)
  const games: GameSummary[] = []
  for (const url of archives.slice(-months).reverse()) {
    const data = await getJson<{ games: CcGame[] }>(url)
    for (const g of data.games) {
      const n = normalizeChesscomGame(g, user)
      if (n) games.push(n)
    }
  }
  return games.sort((a, b) => b.date - a.date)
}

export interface RatingInfo {
  label: string
  rating: number
  games?: number
}

interface CcStat {
  last?: { rating: number }
  record?: { win: number; loss: number; draw: number }
}

export async function fetchChesscomStats(username: string): Promise<RatingInfo[]> {
  const user = username.trim().toLowerCase()
  const s = await getJson<Record<string, unknown>>(`${BASE}/player/${encodeURIComponent(user)}/stats`)
  const out: RatingInfo[] = []
  const modes: [string, string][] = [
    ['chess_rapid', 'Rápidas'],
    ['chess_blitz', 'Blitz'],
    ['chess_bullet', 'Bala'],
    ['chess_daily', 'Diarias'],
  ]
  for (const [key, label] of modes) {
    const st = s[key] as CcStat | undefined
    if (st?.last) {
      const r = st.record
      out.push({ label, rating: st.last.rating, games: r ? r.win + r.loss + r.draw : undefined })
    }
  }
  const tactics = s.tactics as { highest?: { rating: number } } | undefined
  if (tactics?.highest) out.push({ label: 'Problemas (máx.)', rating: tactics.highest.rating })
  return out
}
