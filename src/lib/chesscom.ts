import { load, save } from './storage'
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

/** Error de importación con un detalle técnico para diagnosticar desde el móvil. */
export class ImportError extends Error {
  detail: string
  constructor(message: string, detail: string) {
    super(message)
    this.detail = detail
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new ImportError(
      'El navegador no ha podido leer los datos de Chess.com. Puede ser la conexión o una restricción de seguridad del navegador. Mientras lo resolvemos, puedes importar un archivo PGN.',
      `fetch ${url}: ${(e as Error).name}: ${(e as Error).message}; online=${navigator.onLine}`,
    )
  }
  const detail = `GET ${url}: HTTP ${res.status} ${res.statusText}`
  if (res.status === 404) throw new ImportError('Ese usuario no existe en Chess.com. Revisa cómo está escrito.', detail)
  if (res.status === 429) throw new ImportError('Chess.com está limitando las peticiones. Espera un minuto y vuelve a intentarlo.', detail)
  if (!res.ok) throw new ImportError(`Chess.com ha respondido con un error (${res.status}).`, detail)
  try {
    return (await res.json()) as T
  } catch (e) {
    throw new ImportError('La respuesta de Chess.com no tiene el formato esperado.', `${detail}; ${(e as Error).message}`)
  }
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

export interface ImportProgress {
  done: number
  total: number
}

/** Meses ya descargados por usuario, para que las siguientes importaciones solo traigan lo nuevo. */
type SyncState = Record<string, string[]>

const syncKey = (user: string) => `chesscomSync:${user}`

/**
 * Importa el historial de Chess.com. La primera vez descarga todos los meses; después, solo los meses
 * nuevos y los dos más recientes (que pueden tener partidas nuevas). Las peticiones van en serie, como
 * pide Chess.com, y cada mes se entrega en cuanto llega para no perder lo descargado si algo falla.
 */
export async function importChesscomHistory(
  username: string,
  onMonth: (games: GameSummary[]) => void,
  onProgress?: (p: ImportProgress) => void,
): Promise<{ games: number; months: number }> {
  const user = username.trim().toLowerCase()
  const { archives } = await getJson<{ archives: string[] }>(`${BASE}/player/${encodeURIComponent(user)}/games/archives`)
  const synced = new Set(load<SyncState>('chesscomSync', {})[syncKey(user)] ?? [])
  const recent = new Set(archives.slice(-2))
  const pending = archives.filter((url) => !synced.has(url) || recent.has(url)).reverse()
  let total = 0
  for (const [i, url] of pending.entries()) {
    onProgress?.({ done: i, total: pending.length })
    let data: { games: CcGame[] }
    try {
      data = await getJson<{ games: CcGame[] }>(url)
    } catch (e) {
      // Si Chess.com pide calma, se espera y se reintenta una vez.
      if (e instanceof ImportError && e.detail.includes('HTTP 429')) {
        await new Promise((r) => setTimeout(r, 3000))
        data = await getJson<{ games: CcGame[] }>(url)
      } else throw e
    }
    const month = data.games.map((g) => normalizeChesscomGame(g, user)).filter((g): g is GameSummary => g !== null)
    onMonth(month)
    total += month.length
    synced.add(url)
    const state = load<SyncState>('chesscomSync', {})
    state[syncKey(user)] = [...synced]
    save('chesscomSync', state)
  }
  onProgress?.({ done: pending.length, total: pending.length })
  return { games: total, months: pending.length }
}

/** Descarga las partidas de los últimos meses (si no hay recientes, sigue hacia atrás hasta 6 meses). */
export async function fetchChesscomGames(username: string, months = 2): Promise<GameSummary[]> {
  const user = username.trim().toLowerCase()
  const { archives } = await getJson<{ archives: string[] }>(`${BASE}/player/${encodeURIComponent(user)}/games/archives`)
  const games: GameSummary[] = []
  const recent = archives.slice(-6).reverse()
  for (const [i, url] of recent.entries()) {
    if (i >= months && games.length) break
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
  /** Rating provisional (pocas partidas todavía): Lichess lo marca con «?». */
  provisional?: boolean
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
