import type { GameAnalysis } from './analysis'
import { load, save } from './storage'
import type { GameSummary } from './types'

const MAX_GAMES = 300

export function loadGames(): GameSummary[] {
  return load<GameSummary[]>('games', [])
}

/** Añade partidas nuevas sin duplicar y guarda la lista ordenada por fecha. */
export function mergeGames(current: GameSummary[], incoming: GameSummary[]): GameSummary[] {
  const byId = new Map(current.map((g) => [g.id, g]))
  for (const g of incoming) byId.set(g.id, g)
  const merged = [...byId.values()].sort((a, b) => b.date - a.date).slice(0, MAX_GAMES)
  save('games', merged)
  return merged
}

export function saveGames(games: GameSummary[]): void {
  save('games', games)
}

export const loadAnalysis = (gameId: string) => load<GameAnalysis | null>(`analysis:${gameId}`, null)
export const saveAnalysis = (gameId: string, a: GameAnalysis) => save(`analysis:${gameId}`, a)

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
