import { Chess } from 'chess.js'
import { useEffect, useState } from 'react'
import type { Color } from './types'

/**
 * Ayudas para las pantallas de juego (bots y Lichess): piezas capturadas por cada bando con la
 * ventaja de material, y repasar jugadas anteriores sin salir de la partida.
 */

export type Role = 'p' | 'n' | 'b' | 'r' | 'q'
const ROLES: Role[] = ['p', 'n', 'b', 'r', 'q']
export const ROLE_VALUE: Record<Role, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function count(fen: string): Record<Color, Record<Role, number>> {
  const c: Record<Color, Record<Role, number>> = { white: { p: 0, n: 0, b: 0, r: 0, q: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } }
  for (const ch of fen.split(' ')[0]) {
    const role = ch.toLowerCase() as Role
    if (role in c.white) c[ch === role ? 'black' : 'white'][role]++
  }
  return c
}

export interface Material {
  /** Piezas del rival que ha capturado cada bando, de menos a más valor. */
  captured: Record<Color, Role[]>
  /** Ventaja de material de cada bando en puntos (solo uno de los dos es positivo). */
  advantage: Record<Color, number>
}

/**
 * Capturas de cada bando respecto a la posición de salida. Una coronación no cuenta como pieza
 * capturada: el peón que desaparece al coronar se descuenta.
 */
export function materialInfo(fen: string, startFen = START): Material {
  const start = count(startFen)
  const now = count(fen)
  const captured: Record<Color, Role[]> = { white: [], black: [] }
  const points: Record<Color, number> = { white: 0, black: 0 }
  for (const victim of ['white', 'black'] as Color[]) {
    const s = start[victim]
    const n = now[victim]
    const promoted = ROLES.slice(1).reduce((a, r) => a + Math.max(0, n[r] - s[r]), 0)
    const lost: Record<Role, number> = { p: Math.max(0, s.p - n.p - promoted), n: 0, b: 0, r: 0, q: 0 }
    for (const r of ROLES.slice(1)) lost[r] = Math.max(0, s[r] - n[r])
    const by: Color = victim === 'white' ? 'black' : 'white'
    for (const r of ROLES) for (let i = 0; i < lost[r]; i++) captured[by].push(r)
    for (const r of ROLES) points[victim] += n[r] * ROLE_VALUE[r]
  }
  const diff = points.white - points.black
  return { captured, advantage: { white: Math.max(0, diff), black: Math.max(0, -diff) } }
}

/** Posición tras las primeras `ply` jugadas (UCI) y la última jugada hecha. */
export function positionAt(moves: string[], ply: number, startFen?: string): { fen: string; lastMove?: [string, string] } {
  const c = new Chess(startFen)
  let lastMove: [string, string] | undefined
  for (const uci of moves.slice(0, ply)) {
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      lastMove = [uci.slice(0, 2), uci.slice(2, 4)]
    } catch {
      break
    }
  }
  return { fen: c.fen(), lastMove }
}

/**
 * Repaso de jugadas durante la partida. `view` es null mientras se ve la posición actual. Cuando
 * llega una jugada nueva se vuelve a la posición actual para no perderse la respuesta del rival.
 */
export function useMoveBrowser(total: number) {
  const [view, setView] = useState<number | null>(null)
  const [seen, setSeen] = useState(total)
  if (seen !== total) {
    setSeen(total)
    setView(null)
  }
  const go = (ply: number) => setView(ply >= total ? null : Math.max(0, ply))
  const ply = view ?? total

  // Flechas del teclado en el ordenador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setView((v) => Math.max(0, (v ?? total) - 1))
      else if (e.key === 'ArrowRight') setView((v) => (v === null || v + 1 >= total ? null : v + 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  return { ply, viewing: view !== null, go }
}
