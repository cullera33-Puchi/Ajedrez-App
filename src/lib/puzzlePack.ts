import { LOCAL_PUZZLES, type Puzzle } from './puzzles'

/**
 * Paquete de problemas sin conexión: problemas reales de Lichess (licencia CC0) de 400 a 1500,
 * generados al publicar la app (scripts/build-puzzle-pack.mjs) y guardados por el service worker.
 */

type Row = [id: string, fen: string, moves: string, rating: number, themes: string, lastMove: string]

let pack: Puzzle[] | null = null
let loading: Promise<Puzzle[]> | null = null

const toPuzzle = ([id, fen, moves, rating, themes, last]: Row): Puzzle => ({
  id: `lp-${id}`,
  fen,
  moves: moves.split(' '),
  rating,
  themes: themes.split(' '),
  source: 'local',
  url: `https://lichess.org/training/${id}`,
  lastMove: [last.slice(0, 2), last.slice(2, 4)],
})

/** Carga el paquete (una sola vez). Si no está disponible, devuelve una lista vacía. */
export function loadPack(): Promise<Puzzle[]> {
  if (pack) return Promise.resolve(pack)
  loading ??= fetch(`${import.meta.env.BASE_URL}puzzles/pack.json`)
    .then((r) => (r.ok ? r.json() : { puzzles: [] }))
    .then((d: { puzzles: Row[] }) => (pack = d.puzzles.map(toPuzzle)))
    .catch(() => {
      loading = null
      return []
    })
  return loading
}

/** Problemas disponibles sin conexión para un tema: el set de iniciación más el paquete. */
export function offlinePuzzles(theme: string): Puzzle[] {
  const all = [...LOCAL_PUZZLES, ...(pack ?? [])]
  return theme === 'mix' ? all : all.filter((p) => p.themes.includes(theme))
}

export const packSize = () => pack?.length ?? 0

/**
 * Elige un problema cercano a tu nivel: al azar entre los de ±100 puntos (si no hay, se amplía),
 * evitando los ya resueltos y los vistos hace poco.
 */
export function pickNear(pool: Puzzle[], rating: number, avoid: Set<string>, rnd = Math.random): Puzzle | null {
  const fresh = pool.filter((p) => !avoid.has(p.id))
  const list = fresh.length ? fresh : pool
  for (const margin of [100, 200, 400, 800, Infinity]) {
    const near = list.filter((p) => Math.abs(p.rating - rating) <= margin)
    if (near.length) return near[Math.floor(rnd() * near.length)]
  }
  return null
}
