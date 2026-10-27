import { winnableTargets, type Target } from './hanging'
import type { Puzzle } from './puzzles'
import { load, save } from './storage'

/**
 * Visión del tablero: dos ejercicios cortos. Coordenadas (encontrar casillas por su nombre en 30
 * segundos) y piezas colgadas (marcar lo que puedes ganar en una posición). Las mejores marcas viajan
 * en las copias (regla en MERGERS de backup.ts).
 */

export const COORDS_SECONDS = 30
export const HANGING_ROUND = 5

const FILES = 'abcdefgh'

/** Casilla al azar, distinta de la anterior. */
export function randomSquare(prev?: string, rnd = Math.random): string {
  for (;;) {
    const sq = FILES[Math.floor(rnd() * 8)] + String(1 + Math.floor(rnd() * 8))
    if (sq !== prev) return sq
  }
}

export interface HangingPosition {
  fen: string
  targets: Target[]
}

/** Posiciones con entre 1 y 3 piezas del rival que se pueden ganar, sacadas de los problemas sin conexión. */
export function hangingPositions(puzzles: Puzzle[], n = HANGING_ROUND, rnd = Math.random): HangingPosition[] {
  const pool = [...puzzles]
  const out: HangingPosition[] = []
  while (pool.length && out.length < n) {
    const [p] = pool.splice(Math.floor(rnd() * pool.length), 1)
    const targets = winnableTargets(p.fen, 1)
    if (targets.length >= 1 && targets.length <= 3) out.push({ fen: p.fen, targets })
  }
  return out
}

/** Comprueba las casillas marcadas: aciertos, las que faltan y las que sobran. */
export function checkHanging(pos: HangingPosition, marked: string[]) {
  const want = new Set(pos.targets.map((t) => t.square as string))
  const hits = marked.filter((s) => want.has(s))
  const wrong = marked.filter((s) => !want.has(s))
  const missed = [...want].filter((s) => !marked.includes(s))
  return { hits, wrong, missed, perfect: !wrong.length && !missed.length }
}

export interface VisionBest {
  coords: number
  hanging: number
}

const KEY = 'visionBest'

export const loadVisionBest = (): VisionBest => ({ coords: 0, hanging: 0, ...load<Partial<VisionBest>>(KEY, {}) })

/** Guarda la marca si mejora la anterior. Devuelve true si es récord. */
export function recordVision(kind: keyof VisionBest, score: number): boolean {
  const best = loadVisionBest()
  if (score <= best[kind]) return false
  save(KEY, { ...best, [kind]: score })
  return true
}

/** Fusión de dos copias: la mejor marca de cada ejercicio. */
export function mergeVisionBest(a: unknown, b: unknown): VisionBest {
  const x = { coords: 0, hanging: 0, ...((a ?? {}) as Partial<VisionBest>) }
  const y = { coords: 0, hanging: 0, ...((b ?? {}) as Partial<VisionBest>) }
  return { coords: Math.max(x.coords, y.coords), hanging: Math.max(x.hanging, y.hanging) }
}
