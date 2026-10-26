import { CLASS_LABEL, formatEval, type GameAnalysis, lineToSpanish, type ParsedGame, toSpanishSan } from './analysis'
import { CLAUDE_AI_REPORT_REQUEST, claudeAiPrompt } from '../../shared/coachPrompts'
import { load, save } from './storage'
import { outcomeFor, type GameSummary } from './types'

export interface CoachReport {
  resumen: string
  apertura: string
  medio_juego: string
  final: string
  momentos_clave: { ply: number; titulo: string; explicacion: string; idea: string }[]
  comentarios: { ply: number; comentario: string }[]
  lecciones: string[]
  temas: string[]
  consejo: string
}

/** Turno de conversación. Las respuestas de Claude se guardan completas para reenviarlas sin cambios. */
export type ChatTurn = { role: 'user'; text: string; ply: number } | { role: 'assistant'; content?: unknown[]; text: string }

export type CoachProvider = 'plan' | 'api'

export interface CoachChat {
  context: string
  provider: CoachProvider
  /** Sesión de Claude Code para continuar la conversación (modo plan). */
  sessionId?: string
  turns: ChatTurn[]
}

const moveLabel = (ply: number, san: string, color: 'w' | 'b') =>
  `${Math.ceil(ply / 2)}${color === 'w' ? '.' : '...'} ${toSpanishSan(san)}`

const RESULT_TEXT: Record<string, string> = { victoria: 'victoria del alumno', derrota: 'derrota del alumno', tablas: 'tablas' }

/** Resume la partida y el análisis de Stockfish en texto para Claude. */
export function buildGameContext(game: GameSummary, parsed: ParsedGame, analysis: GameAnalysis): string {
  const side = (c: 'white' | 'black') => (c === 'white' ? 'blancas' : 'negras')
  const outcome = outcomeFor(game)
  const lines: string[] = [
    'PARTIDA',
    `Blancas: ${game.white.name}${game.white.rating ? ` (${game.white.rating})` : ''}`,
    `Negras: ${game.black.name}${game.black.rating ? ` (${game.black.rating})` : ''}`,
    `El alumno juega con: ${game.userColor ? side(game.userColor) : 'no se sabe; comenta ambos bandos'}`,
    `Resultado: ${game.result}${outcome ? ` (${RESULT_TEXT[outcome]})` : ''}`,
  ]
  if (game.timeClass) lines.push(`Ritmo: ${game.timeClass}`)
  if (game.opening) lines.push(`Apertura: ${game.opening}`)
  const c = analysis.counts
  lines.push(
    `Precisión según Stockfish: blancas ${analysis.accuracy.white.toFixed(0)} %, negras ${analysis.accuracy.black.toFixed(0)} %`,
    `Imprecisiones, errores y errores graves: blancas ${c.white.imprecision}, ${c.white.error} y ${c.white.grave}; negras ${c.black.imprecision}, ${c.black.error} y ${c.black.grave}`,
    '',
    `JUGADAS (evaluación desde el punto de vista de las blancas, Stockfish a profundidad ${analysis.depth}; "#3" es mate en 3 a favor de blancas y "#-3" a favor de negras)`,
  )

  analysis.moves.forEach((m, i) => {
    const before = analysis.positions[i]
    const after = analysis.positions[i + 1]
    const who = m.color === 'w' ? 'blancas' : 'negras'
    let line = `[ply ${m.ply}] ${moveLabel(m.ply, m.san, m.color)} (${who}) | ${formatEval(before)} a ${formatEval(after)} | ${CLASS_LABEL[m.classification].toLowerCase()}`
    if (m.classification === 'imprecision' || m.classification === 'error' || m.classification === 'grave') {
      line += ` | pierde ${m.drop.toFixed(0)} puntos de probabilidad de ganar`
      line += `\n    FEN antes de la jugada: ${parsed.fens[i]}`
      line += `\n    Mejor jugada: ${m.bestSan ? toSpanishSan(m.bestSan) : '?'} (línea: ${lineToSpanish(parsed.fens[i], before.pv, 6)})`
      line += `\n    Tras la jugada, el motor espera: ${lineToSpanish(parsed.fens[i + 1], after.pv, 6) || 'fin de la partida'}`
    }
    lines.push(line)
  })

  const last = parsed.fens[parsed.fens.length - 1]
  lines.push('', `Posición final (FEN): ${last}`)
  return lines.join('\n')
}

/** Describe la posición que el alumno está mirando, para acompañar su pregunta. */
export function describePosition(parsed: ParsedGame, analysis: GameAnalysis | null, ply: number): string {
  const fen = parsed.fens[ply]
  const turn = fen.split(' ')[1] === 'w' ? 'blancas' : 'negras'
  const parts = [
    ply === 0
      ? 'Posición actual: posición inicial de la partida.'
      : `Posición actual: tras [ply ${ply}] ${moveLabel(ply, parsed.moves[ply - 1].san, parsed.moves[ply - 1].color)}.`,
    `Juegan las ${turn}. FEN: ${fen}`,
  ]
  const ev = analysis?.positions[ply]
  if (ev) {
    parts.push(`Evaluación de Stockfish: ${formatEval(ev)}.`)
    if (ev.pv.length) parts.push(`Mejor línea según Stockfish: ${lineToSpanish(fen, ev.pv, 6)}.`)
  }
  return parts.join('\n')
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('No se ha podido conectar con el servidor local. ¿Está arrancado con npm run dev?')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data as T
}

export interface CoachStatus {
  provider: CoachProvider
  /** true si el modo elegido está listo para usarse. */
  ready: boolean
  plan: { installed: boolean; loggedIn: boolean; authMethod?: string; usesApiBilling: boolean }
  api: { configured: boolean; model: string }
}

export async function fetchCoachStatus(): Promise<CoachStatus | null> {
  try {
    const res = await fetch('/api/coach/status')
    if (!res.ok) return null
    return (await res.json()) as CoachStatus
  } catch {
    return null
  }
}

export const saveCoachKey = (apiKey: string) => post<CoachStatus>('/api/coach/key', { apiKey })
export const setCoachProvider = (provider: CoachProvider) => post<CoachStatus>('/api/coach/provider', { provider })

export async function requestReport(context: string): Promise<CoachReport> {
  return (await post<{ report: CoachReport }>('/api/coach/report', { context })).report
}

export async function askCoach(chat: CoachChat): Promise<{ turn: ChatTurn; sessionId?: string }> {
  const history = chat.turns.map((t) =>
    t.role === 'user' ? { role: 'user', text: t.text } : { role: 'assistant', content: t.content, text: t.text },
  )
  const r = await post<{ content?: unknown[]; text: string; sessionId?: string }>('/api/coach/ask', {
    context: chat.context,
    history,
    sessionId: chat.sessionId,
  })
  return { turn: { role: 'assistant', content: r.content, text: r.text }, sessionId: r.sessionId }
}

/**
 * Copia al portapapeles el texto para Claude y abre claude.ai en una pestaña nueva.
 * Funciona con cualquier plan y no necesita configuración.
 */
export async function openInClaudeAi(context: string, request = CLAUDE_AI_REPORT_REQUEST): Promise<void> {
  const text = claudeAiPrompt(context, request)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    throw new Error('No se ha podido copiar al portapapeles. Revisa los permisos del navegador.')
  } finally {
    window.open('https://claude.ai/new', '_blank', 'noopener')
  }
}

export const loadReport = (gameId: string) => load<CoachReport | null>(`coach:${gameId}`, null)
export const saveReport = (gameId: string, r: CoachReport) => save(`coach:${gameId}`, r)
export const loadChat = (gameId: string) => load<CoachChat | null>(`coachChat:${gameId}`, null)
export const saveChat = (gameId: string, c: CoachChat | null) => save(`coachChat:${gameId}`, c)
