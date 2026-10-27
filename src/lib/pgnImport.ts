import { Chess } from 'chess.js'
import type { GameSummary, Result } from './types'

const header = (pgn: string, name: string) => pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`))?.[1]

/** Crea una partida a partir de un PGN pegado por el usuario. Lanza un error si el PGN no es válido. */
export function gameFromPgn(pgn: string, username?: string): GameSummary {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn.trim())
  } catch {
    throw new Error('El PGN no es válido. Revisa que esté completo.')
  }
  if (!chess.history().length) throw new Error('El PGN no contiene jugadas.')
  const white = header(pgn, 'White') ?? 'Blancas'
  const black = header(pgn, 'Black') ?? 'Negras'
  const r = header(pgn, 'Result')
  const result: Result = r === '1-0' || r === '0-1' || r === '1/2-1/2' ? r : '*'
  const u = username?.toLowerCase()
  const dateStr = header(pgn, 'Date')?.replace(/\./g, '-')
  const parsedDate = dateStr ? Date.parse(dateStr) : NaN
  return {
    id: 'pgn-' + hash(pgn),
    source: 'pgn',
    white: { name: white, rating: Number(header(pgn, 'WhiteElo')) || undefined },
    black: { name: black, rating: Number(header(pgn, 'BlackElo')) || undefined },
    result,
    userColor: u && white.toLowerCase() === u ? 'white' : u && black.toLowerCase() === u ? 'black' : undefined,
    date: Number.isNaN(parsedDate) ? Date.now() : parsedDate,
    opening: header(pgn, 'Opening'),
    pgn: pgn.trim(),
  }
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Separa un archivo con varias partidas PGN (por ejemplo, el que descarga Chess.com) en partidas sueltas. */
export function splitPgnFile(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n(?=\[Event )/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function gamesFromPgnFile(text: string, username?: string): { games: GameSummary[]; failed: number } {
  const games: GameSummary[] = []
  let failed = 0
  for (const pgn of splitPgnFile(text)) {
    try {
      const g = gameFromPgn(pgn, username)
      const site = header(pgn, 'Link') ?? header(pgn, 'Site')
      if (site?.startsWith('http')) g.url = site
      if (/lichess AI level/i.test(`${g.white.name} ${g.black.name}`)) g.source = 'bot'
      else if (/chess\.com/i.test(pgn)) g.source = 'chesscom'
      else if (/lichess\.org/i.test(pgn)) {
        g.source = 'lichess'
        // Mismo id que en la importación por la API, para no duplicarla.
        const liId = site?.match(/lichess\.org\/(\w{8})/)?.[1]
        if (liId) g.id = `li-${liId}`
      }
      games.push(g)
    } catch {
      failed++
    }
  }
  return { games, failed }
}
