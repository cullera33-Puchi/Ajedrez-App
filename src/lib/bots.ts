import { Chess } from 'chess.js'
import type { Engine, EngineLine } from './engine'
import { load, save } from './storage'
import type { Color, GameSummary, Result } from './types'

/**
 * Bots de nivel principiante. Stockfish propone varias jugadas candidatas a poca profundidad y el bot
 * elige entre ellas con una probabilidad que depende de lo buena que sea cada una («temperatura»).
 * Además, de vez en cuando se despista y juega una jugada peor, como haría un jugador de ese nivel.
 */
export interface Bot {
  id: string
  name: string
  elo: number
  avatar: string
  description: string
  /** Profundidad de búsqueda. */
  depth: number
  /** Número de jugadas candidatas que se piden al motor. */
  multipv: number
  /** Cuanto más alta, más probable que elija jugadas peores (en centipeones). */
  temperature: number
  /** Probabilidad de despiste en cada jugada. */
  blunder: number
  /** Preferencia por jaques y capturas. */
  aggressive?: boolean
}

export const BOTS: Bot[] = [
  {
    id: 'lucia',
    name: 'Lucía',
    elo: 400,
    avatar: '🐣',
    description: 'Acaba de aprender a mover las piezas. Deja piezas sin defender a menudo.',
    depth: 4,
    multipv: 12,
    temperature: 260,
    blunder: 0.22,
  },
  {
    id: 'bruno',
    name: 'Bruno',
    elo: 600,
    avatar: '🙃',
    description: 'Juega deprisa y a veces no ve las amenazas.',
    depth: 5,
    multipv: 10,
    temperature: 170,
    blunder: 0.12,
  },
  {
    id: 'marta',
    name: 'Marta',
    elo: 800,
    avatar: '🛡️',
    description: 'Prudente: defiende sus piezas, pero se le escapan las tácticas.',
    depth: 6,
    multipv: 8,
    temperature: 110,
    blunder: 0.07,
  },
  {
    id: 'diego',
    name: 'Diego',
    elo: 1000,
    avatar: '⚔️',
    description: 'Atacante: le encantan los jaques y las capturas, aunque arriesga.',
    depth: 8,
    multipv: 8,
    temperature: 70,
    blunder: 0.045,
    aggressive: true,
  },
  {
    id: 'elena',
    name: 'Elena',
    elo: 1200,
    avatar: '🏰',
    description: 'Sólida: rara vez regala material. Hay que ganárselo.',
    depth: 10,
    multipv: 6,
    temperature: 45,
    blunder: 0.02,
  },
  {
    id: 'profesor',
    name: 'El Profesor',
    elo: 1500,
    avatar: '🎓',
    description: 'Castiga los errores. Un buen reto cuando ganes a los demás.',
    depth: 12,
    multipv: 4,
    temperature: 22,
    blunder: 0.008,
  },
]

export const botById = (id: string) => BOTS.find((b) => b.id === id) ?? BOTS[0]

/** Puntuación comparable de una línea: los mates valen mucho más que cualquier ventaja material. */
export function lineScore(l: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (l.mate !== undefined) return l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10
  return l.cp ?? 0
}

function isCaptureOrCheck(fen: string, uci: string): boolean {
  try {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return Boolean(m.captured) || m.san.includes('+')
  } catch {
    return false
  }
}

/** Elige la jugada del bot a partir de las líneas del motor. Separado del motor para poder probarlo. */
export function pickMove(fen: string, bot: Bot, lines: EngineLine[], legal: string[], ply: number, rand: () => number = Math.random): string {
  if (legal.length === 1 || !lines.length) return lines[0]?.move ?? legal[Math.floor(rand() * legal.length)]
  // Despiste: una jugada peor de la lista, o cualquiera si la lista es corta.
  if (rand() < bot.blunder) {
    const pool = lines.length > 2 ? lines.slice(1).map((l) => l.move) : legal
    return pool[Math.floor(rand() * pool.length)]
  }
  // En la apertura, más variedad para que las partidas no se repitan.
  const temperature = ply < 8 ? Math.max(bot.temperature, 60) : bot.temperature
  const scores = lines.map((l) => lineScore(l) + (bot.aggressive && isCaptureOrCheck(fen, l.move) ? 40 : 0))
  const best = Math.max(...scores)
  const weights = scores.map((s) => Math.exp((s - best) / temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < lines.length; i++) {
    r -= weights[i]
    if (r <= 0) return lines[i].move
  }
  return lines[0].move
}

export async function chooseBotMove(fen: string, bot: Bot, engine: Engine, ply: number): Promise<string> {
  const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan)
  if (legal.length === 1) return legal[0]
  const res = await engine.evaluate(fen, bot.depth, Math.min(bot.multipv, legal.length))
  const lines = res.lines.length ? res.lines : res.best ? [{ move: res.best, pv: [res.best], cp: 0 }] : []
  return pickMove(fen, bot, lines, legal, ply)
}

/** ¿Acepta el bot tablas? Solo si la posición está igualada o va perdiendo. */
export async function botAcceptsDraw(fen: string, bot: Bot, botColor: Color, engine: Engine): Promise<boolean> {
  const res = await engine.evaluate(fen, Math.min(bot.depth, 10))
  const toMove: Color = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const forBot = lineScore(res) * (toMove === botColor ? 1 : -1)
  return forBot <= 50
}

/** Partida en curso, guardada para continuarla al volver a abrir la app. */
export interface BotGame {
  botId: string
  userColor: Color
  moves: string[]
  startedAt: number
  /** Si se ha deshecho alguna jugada. */
  undos: number
}

export const loadBotGame = () => load<BotGame | null>('botGame', null)
export const saveBotGame = (g: BotGame | null) => save('botGame', g)

export type BotRecord = Record<string, { w: number; l: number; d: number }>
export const loadBotRecord = () => load<BotRecord>('botRecord', {})

export function addToRecord(botId: string, outcome: 'w' | 'l' | 'd'): BotRecord {
  const rec = loadBotRecord()
  const r = rec[botId] ?? { w: 0, l: 0, d: 0 }
  rec[botId] = { ...r, [outcome]: r[outcome] + 1 }
  save('botRecord', rec)
  return rec
}

/** Convierte una partida contra un bot en una partida de Mis partidas, lista para analizar. */
export function botGameToSummary(g: BotGame, result: Result, userName: string, endReason: string): GameSummary {
  const bot = botById(g.botId)
  const chess = new Chess()
  for (const uci of g.moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  const white = g.userColor === 'white' ? userName : `${bot.name} (bot)`
  const black = g.userColor === 'black' ? userName : `${bot.name} (bot)`
  const d = new Date(g.startedAt)
  chess.setHeader('Event', 'Partida contra bot')
  chess.setHeader('Site', 'Ajedrez App')
  chess.setHeader('Date', `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`)
  chess.setHeader('White', white)
  chess.setHeader('Black', black)
  chess.setHeader('Result', result)
  chess.setHeader('Termination', endReason)
  return {
    id: `bot-${g.startedAt}`,
    source: 'bot',
    white: { name: white, rating: g.userColor === 'black' ? bot.elo : undefined },
    black: { name: black, rating: g.userColor === 'white' ? bot.elo : undefined },
    result,
    userColor: g.userColor,
    timeClass: 'sin reloj',
    date: g.startedAt,
    pgn: chess.pgn(),
  }
}
