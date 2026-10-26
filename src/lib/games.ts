import type { GameAnalysis } from './analysis'
import { db } from './db'
import type { AnalysisSummary } from './recommend'
import { listKeys, load, remove } from './storage'
import type { GameSummary } from './types'

/**
 * Almacén de partidas y análisis en IndexedDB. La lista de partidas y los resúmenes de análisis
 * se mantienen en memoria para leerlos al instante; el análisis completo se carga al abrir la partida.
 */

let games: GameSummary[] = []
const summaries = new Map<string, AnalysisSummary>()

const byDate = (a: GameSummary, b: GameSummary) => b.date - a.date

export type Summarizer = (game: GameSummary, analysis: GameAnalysis) => AnalysisSummary | null

/** Abre la base de datos, migra lo guardado en versiones anteriores (localStorage) y carga la memoria. */
export async function initStore(summarize: Summarizer): Promise<void> {
  const store = await db()
  // Migración desde localStorage
  const oldGames = load<GameSummary[] | null>('games', null)
  if (oldGames?.length) {
    await store.putMany('games', oldGames.map((g) => [g.id, g]))
    remove('games')
  }
  const loaded = await store.getAll<GameSummary>('games')
  games = loaded.sort(byDate)
  for (const key of listKeys('analysis:')) {
    const id = key.slice('analysis:'.length)
    const analysis = load<GameAnalysis | null>(key, null)
    const game = games.find((g) => g.id === id) ?? DEMO_GAMES.find((g) => g.id === id)
    if (analysis && game) {
      const s = summarize(game, analysis)
      await store.putMany('analyses', [[id, analysis]])
      if (s) await store.putMany('summaries', [[id, s]])
    }
    remove(key)
  }
  for (const s of await store.getAll<AnalysisSummary>('summaries')) summaries.set(s.id, s)
  // Pide al navegador que no borre los datos por falta de espacio (sobre todo en iPhone).
  navigator.storage?.persist?.().catch(() => undefined)
}

export const getGames = () => games

/** Añade o actualiza partidas sin duplicar. Devuelve la nueva lista (ordenada por fecha). */
export function mergeGames(incoming: GameSummary[]): GameSummary[] {
  if (!incoming.length) return games
  const byId = new Map(games.map((g) => [g.id, g]))
  for (const g of incoming) byId.set(g.id, g)
  games = [...byId.values()].sort(byDate)
  void db().then((s) => s.putMany('games', incoming.map((g) => [g.id, g])))
  return games
}

export const getSummary = (id: string) => summaries.get(id)
export const allSummaries = () => [...summaries.values()]

export async function loadAnalysis(id: string): Promise<GameAnalysis | null> {
  return (await (await db()).get<GameAnalysis>('analyses', id)) ?? null
}

export async function saveAnalysis(id: string, analysis: GameAnalysis, summary: AnalysisSummary | null): Promise<void> {
  const store = await db()
  await store.putMany('analyses', [[id, analysis]])
  if (summary) {
    summaries.set(id, summary)
    await store.putMany('summaries', [[id, summary]])
  }
}

/** Actualiza solo el resumen (por ejemplo, para marcar que ya se generaron sus problemas). */
export async function updateSummary(summary: AnalysisSummary): Promise<void> {
  summaries.set(summary.id, summary)
  await (await db()).putMany('summaries', [[summary.id, summary]])
}

/** Solo para pruebas. */
export function resetStoreForTests() {
  games = []
  summaries.clear()
}

export const DEMO_GAMES: GameSummary[] = [
  {
    id: 'demo-trampa',
    source: 'demo',
    white: { name: 'Tú (ejemplo)', rating: 500 },
    black: { name: 'Rival', rating: 520 },
    result: '0-1',
    userColor: 'white',
    timeClass: 'rapid',
    date: Date.UTC(2026, 9, 20),
    opening: 'Trampa Blackburne Shilling',
    pgn: '[White "Tú (ejemplo)"]\n[Black "Rival"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1',
  },
  {
    id: 'demo-opera',
    source: 'demo',
    white: { name: 'Paul Morphy' },
    black: { name: 'Duque de Brunswick y Conde Isouard' },
    result: '1-0',
    timeClass: 'classical',
    date: Date.UTC(1858, 10, 2),
    opening: 'Defensa Philidor',
    pgn: '[Event "Partida de la Ópera, París"]\n[White "Paul Morphy"]\n[Black "Duque de Brunswick y Conde Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',
  },
]
