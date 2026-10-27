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
  /** Clave del nivel (para el récord), por ejemplo «elo-550». */
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
  /** En un despiste, cuánto peor (en centipeones) puede ser como mucho la jugada elegida. */
  maxBlunderLoss: number
  /** Preferencia por jaques y capturas. */
  aggressive?: boolean
}

export type BotStyle = 'equilibrado' | 'atacante'

export const MIN_ELO = 250
export const MAX_ELO = 2000
export const ELO_STEP = 50
/** Niveles de acceso rápido. */
export const ELO_PRESETS = [400, 600, 800, 1000, 1200, 1500, 1800]

/** Personaje que da cara a cada franja de nivel. */
const PERSONAS: { from: number; name: string; avatar: string; description: string }[] = [
  { from: 250, name: 'Lucía', avatar: '🐣', description: 'Acaba de aprender a mover las piezas. Deja piezas sin defender a menudo.' },
  { from: 500, name: 'Bruno', avatar: '🙃', description: 'Juega deprisa y a veces no ve las amenazas.' },
  { from: 700, name: 'Marta', avatar: '🛡️', description: 'Defiende sus piezas, pero se le escapan las tácticas.' },
  { from: 900, name: 'Diego', avatar: '⚔️', description: 'Ve las tácticas sencillas; todavía falla en posiciones complicadas.' },
  { from: 1100, name: 'Elena', avatar: '🏰', description: 'Sólida: rara vez regala material. Hay que ganárselo.' },
  { from: 1400, name: 'El Profesor', avatar: '🎓', description: 'Castiga los errores. Un buen reto cuando ganes a los demás.' },
  { from: 1700, name: 'La Maestra', avatar: '👑', description: 'Juega con mucha precisión. Un reto serio.' },
]

export const clampElo = (elo: number) => Math.min(MAX_ELO, Math.max(MIN_ELO, Math.round(elo / ELO_STEP) * ELO_STEP))

/**
 * Crea el bot de un nivel. Los parámetros se interpolan de forma continua entre el nivel más bajo
 * (poca profundidad, mucha variedad y despistes frecuentes) y el más alto.
 */
export function makeBot(eloInput: number, style: BotStyle = 'equilibrado'): Bot {
  const elo = clampElo(eloInput)
  const t = (elo - MIN_ELO) / (MAX_ELO - MIN_ELO)
  const exp = (from: number, to: number) => from * (to / from) ** t
  const persona = [...PERSONAS].reverse().find((p) => elo >= p.from) ?? PERSONAS[0]
  return {
    id: `elo-${elo}`,
    name: persona.name,
    avatar: persona.avatar,
    description: persona.description,
    elo,
    depth: Math.round(3 + t * 11),
    multipv: Math.round(14 - t * 11),
    temperature: exp(320, 12),
    blunder: exp(0.28, 0.003),
    maxBlunderLoss: exp(900, 120),
    aggressive: style === 'atacante',
  }
}

/** Niveles antiguos (versión con seis bots fijos). */
const LEGACY_ELO: Record<string, number> = { lucia: 400, bruno: 600, marta: 800, diego: 1000, elena: 1200, profesor: 1500 }

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
  const best = Math.max(...lines.map(lineScore))
  // Despiste: una jugada peor, pero dentro de lo que fallaría un jugador de ese nivel.
  if (rand() < bot.blunder) {
    const pool = lines.filter((l) => lineScore(l) < best && best - lineScore(l) <= bot.maxBlunderLoss).map((l) => l.move)
    if (pool.length) return pool[Math.floor(rand() * pool.length)]
  }
  // En la apertura, más variedad para que las partidas no se repitan.
  const temperature = ply < 8 ? Math.max(bot.temperature, 60) : bot.temperature
  const scores = lines.map((l) => lineScore(l) + (bot.aggressive && isCaptureOrCheck(fen, l.move) ? 40 : 0))
  const top = Math.max(...scores)
  const weights = scores.map((s) => Math.exp((s - top) / temperature))
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
  elo: number
  style: BotStyle
  userColor: Color
  moves: string[]
  startedAt: number
  /** Si se ha deshecho alguna jugada. */
  undos: number
  /** Posición de salida si no es la inicial (desde el escáner, el análisis o una lección). */
  startFen?: string
}

export function loadBotGame(): BotGame | null {
  const g = load<(BotGame & { botId?: string }) | null>('botGame', null)
  if (g && g.elo === undefined) return { ...g, elo: LEGACY_ELO[g.botId ?? ''] ?? 400, style: 'equilibrado' }
  return g
}
export const saveBotGame = (g: BotGame | null) => save('botGame', g)

export type BotRecord = Record<string, { w: number; l: number; d: number }>

/** Récord por nivel. Los récords de la versión con seis bots se pasan a su nivel equivalente. */
export function loadBotRecord(): BotRecord {
  const rec = load<BotRecord>('botRecord', {})
  let changed = false
  for (const [k, v] of Object.entries(rec)) {
    if (LEGACY_ELO[k] !== undefined) {
      const key = `elo-${LEGACY_ELO[k]}`
      const cur = rec[key] ?? { w: 0, l: 0, d: 0 }
      rec[key] = { w: cur.w + v.w, l: cur.l + v.l, d: cur.d + v.d }
      delete rec[k]
      changed = true
    }
  }
  if (changed) save('botRecord', rec)
  return rec
}

export function addToRecord(botId: string, outcome: 'w' | 'l' | 'd'): BotRecord {
  const rec = loadBotRecord()
  const r = rec[botId] ?? { w: 0, l: 0, d: 0 }
  rec[botId] = { ...r, [outcome]: r[outcome] + 1 }
  save('botRecord', rec)
  return rec
}

/** Nivel más alto al que el usuario ha ganado. */
export function bestWin(rec: BotRecord): number | undefined {
  const wins = Object.entries(rec)
    .filter(([k, v]) => k.startsWith('elo-') && v.w > 0)
    .map(([k]) => Number(k.slice(4)))
  return wins.length ? Math.max(...wins) : undefined
}

/** Convierte una partida contra un bot en una partida de Mis partidas, lista para analizar. */
export function botGameToSummary(g: BotGame, result: Result, userName: string, endReason: string): GameSummary {
  const bot = makeBot(g.elo, g.style)
  const chess = new Chess(g.startFen)
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
  if (g.startFen) {
    chess.setHeader('SetUp', '1')
    chess.setHeader('FEN', g.startFen)
  }
  return {
    id: `bot-${g.startedAt}`,
    source: 'bot',
    white: { name: white, rating: g.userColor === 'black' ? bot.elo : undefined },
    black: { name: black, rating: g.userColor === 'white' ? bot.elo : undefined },
    result,
    userColor: g.userColor,
    timeClass: 'sin reloj',
    date: g.startedAt,
    ...(g.startFen ? { opening: 'Desde una posición' } : {}),
    pgn: chess.pgn(),
  }
}
