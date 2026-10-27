import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { toSpanishSan } from './analysis'

/**
 * Piezas colgadas: material que el bando que mueve puede ganar con una captura. Sirve para avisar
 * en las partidas contra los bots antes de dejar una pieza (o un mate) al rival, y para el ejercicio
 * de visión del tablero. Es una cuenta sencilla (una captura y la posible recaptura), no un motor.
 */

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const NAME: Record<PieceSymbol, { name: string; fem: boolean }> = {
  p: { name: 'peón', fem: false },
  n: { name: 'caballo', fem: false },
  b: { name: 'alfil', fem: false },
  r: { name: 'torre', fem: true },
  q: { name: 'dama', fem: true },
  k: { name: 'rey', fem: false },
}

export interface Target {
  square: Square
  victim: PieceSymbol
  /** Material que se gana: la pieza capturada, menos la que se pierde si hay recaptura. */
  gain: number
  /** La captura que más gana sobre esa casilla. */
  by: { from: Square; piece: PieceSymbol }
  defended: boolean
}

/** Capturas que ganan material para el bando que mueve, por casilla (la mejor de cada una). */
export function winnableTargets(fen: string, minGain = 1): Target[] {
  const c = new Chess(fen)
  const best = new Map<Square, Target>()
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured) continue
    c.move(m)
    // ¿Puede el otro bando recuperar en esa casilla?
    const defended = c.moves({ verbose: true }).some((r) => r.to === m.to)
    c.undo()
    const gain = defended ? VALUE[m.captured] - VALUE[m.piece] : VALUE[m.captured]
    if (gain < minGain) continue
    const cur = best.get(m.to)
    if (!cur || gain > cur.gain) best.set(m.to, { square: m.to, victim: m.captured, gain, by: { from: m.from, piece: m.piece }, defended })
  }
  return [...best.values()].sort((a, b) => b.gain - a.gain)
}

export type Danger = { kind: 'mate'; reply: string } | { kind: 'hanging'; target: Target }

/**
 * ¿Qué deja tu jugada al rival? Un mate en una, o una captura que gana al menos una pieza menor
 * (descontando lo que tú acabas de capturar). Los peones sueltos no avisan: serían demasiados avisos.
 */
export function dangerAfterMove(fen: string, uci: string): Danger | null {
  const c = new Chess(fen)
  let mv
  try {
    mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
  if (c.isGameOver()) return null
  for (const r of c.moves({ verbose: true })) {
    c.move(r)
    const mate = c.isCheckmate()
    c.undo()
    if (mate) return { kind: 'mate', reply: toSpanishSan(r.san) }
  }
  const taken = mv.captured ? VALUE[mv.captured] : 0
  const target = winnableTargets(c.fen(), 2).find((t) => t.gain - taken >= 2)
  return target ? { kind: 'hanging', target } : null
}

const theName = (p: PieceSymbol) => `${NAME[p].fem ? 'la' : 'el'} ${NAME[p].name}`

/** Aviso en palabras. `san` es tu jugada en notación española. */
export function describeDanger(d: Danger, san: string): string {
  if (d.kind === 'mate') return `Cuidado: si juegas ${san}, el rival te da mate con ${d.reply}.`
  const t = d.target
  const piece = `tu ${NAME[t.victim].name} de ${t.square}`
  const by = `${theName(t.by.piece)} de ${t.by.from}`
  const fem = NAME[t.victim].fem
  if (!t.defended) return `Cuidado: si juegas ${san}, ${piece} se queda ${fem ? 'colgada' : 'colgado'}: ${by} ${fem ? 'la' : 'lo'} puede capturar gratis.`
  return `Cuidado: si juegas ${san}, el rival gana material: ${by} captura ${piece} aunque puedas recuperar.`
}
