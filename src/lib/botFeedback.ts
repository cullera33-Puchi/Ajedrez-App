import type { BotStyle } from './bots'
import { load, save } from './storage'
import type { Color, Result } from './types'

/**
 * Valoraciones del usuario sobre la fuerza de los bots. Se copian como texto para pasárselas a Claude,
 * que ajusta los parámetros (registro en docs/AJUSTE_BOTS.md).
 */

export type BotFeel = 'facil' | 'adecuado' | 'dificil'

export const FEEL_LABEL: Record<BotFeel, string> = { facil: 'Fácil', adecuado: 'Adecuado', dificil: 'Difícil' }

export interface BotFeedback {
  /** Momento de la valoración (ms); sirve de identificador al fusionar copias. */
  t: number
  gameId: string
  elo: number
  style: BotStyle
  feel: BotFeel
  note?: string
  result: Result
  userColor: Color
  /** Jugadas de la partida (de los dos bandos). */
  plies: number
}

const KEY = 'botFeedback'

export const loadFeedback = (): BotFeedback[] => load<BotFeedback[]>(KEY, [])

/** Guarda una valoración. Si ya había una de esa partida, la sustituye. */
export function addFeedback(f: BotFeedback) {
  save(KEY, [...loadFeedback().filter((x) => x.gameId !== f.gameId), f])
}

export function mergeFeedback(a: BotFeedback[], b: BotFeedback[]): BotFeedback[] {
  const byGame = new Map<string, BotFeedback>()
  for (const f of [...a, ...b]) {
    const cur = byGame.get(f.gameId)
    if (!cur || f.t > cur.t) byGame.set(f.gameId, f)
  }
  return [...byGame.values()].sort((x, y) => x.t - y.t)
}

const outcome = (f: BotFeedback) => {
  if (f.result === '1/2-1/2') return 'tablas'
  return (f.result === '1-0') === (f.userColor === 'white') ? 'gané' : 'perdí'
}

/** Texto para pegar en la conversación con Claude. */
export function feedbackReport(list: BotFeedback[]): string {
  const lines = [`Valoraciones de los bots de Ajedrez App (${list.length}). Apúntalas en docs/AJUSTE_BOTS.md y propón ajustes respetando el Elo:`]
  for (const f of list) {
    const date = new Date(f.t).toLocaleDateString('es-ES')
    const color = f.userColor === 'white' ? 'blancas' : 'negras'
    const moves = Math.ceil(f.plies / 2)
    lines.push(
      `- ${date}, bot ${f.elo} ${f.style}, ${outcome(f)} con ${color} en ${moves} ${moves === 1 ? 'jugada' : 'jugadas'}: ${FEEL_LABEL[f.feel].toLowerCase()}.${f.note ? ` Nota: ${f.note}` : ''}`,
    )
  }
  return lines.join('\n')
}
