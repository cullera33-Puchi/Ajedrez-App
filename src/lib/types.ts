export type Color = 'white' | 'black'
export type Source = 'chesscom' | 'lichess' | 'pgn' | 'demo' | 'bot' | 'posicion'
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*'

export interface Player {
  name: string
  rating?: number
}

export interface GameSummary {
  id: string
  source: Source
  url?: string
  white: Player
  black: Player
  result: Result
  /** Color con el que jugó el usuario, si se ha podido identificar. */
  userColor?: Color
  timeClass?: string
  /** Fecha de la partida en milisegundos. */
  date: number
  opening?: string
  pgn: string
}

/** Nombre del rival del usuario en una partida. */
export const opponentOf = (g: GameSummary) => (g.userColor === 'white' ? g.black.name : g.white.name)

export type Outcome = 'victoria' | 'derrota' | 'tablas'

export function outcomeFor(game: GameSummary): Outcome | undefined {
  if (!game.userColor || game.result === '*') return undefined
  if (game.result === '1/2-1/2') return 'tablas'
  const whiteWon = game.result === '1-0'
  return whiteWon === (game.userColor === 'white') ? 'victoria' : 'derrota'
}
