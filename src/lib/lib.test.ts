import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildAnalysis, classify, formatEval, materialBalance, moveAccuracy, parsePgn, type PositionEval, toSpanishSan, winPercent } from './analysis'
import { normalizeChesscomGame, openingFromPgn } from './chesscom'
import { DEMO_GAMES } from './games'
import { normalizeLichessGame, puzzleFromLichess } from './lichess'
import { gameFromPgn } from './pgnImport'
import { INITIAL_PUZZLE_STATS, LOCAL_PUZZLES, updateRating } from './puzzles'
import { outcomeFor } from './types'

describe('problemas locales', () => {
  it.each(LOCAL_PUZZLES.map((p) => [p.id, p] as const))('%s tiene una solución legal', (_id, p) => {
    const chess = new Chess(p.fen)
    for (const uci of p.moves) {
      expect(() => chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })).not.toThrow()
    }
  })

  it('los ids no se repiten', () => {
    expect(new Set(LOCAL_PUZZLES.map((p) => p.id)).size).toBe(LOCAL_PUZZLES.length)
  })

  it('el nivel sube al acertar y baja al fallar', () => {
    const p = LOCAL_PUZZLES[0]
    expect(updateRating(INITIAL_PUZZLE_STATS, p, true).rating).toBeGreaterThan(INITIAL_PUZZLE_STATS.rating)
    expect(updateRating(INITIAL_PUZZLE_STATS, p, false).rating).toBeLessThan(INITIAL_PUZZLE_STATS.rating)
    expect(updateRating(INITIAL_PUZZLE_STATS, p, true).streak).toBe(1)
  })
})

describe('cálculos de análisis', () => {
  it('probabilidad de ganar', () => {
    expect(winPercent({ cp: 0, pv: [] })).toBeCloseTo(50)
    expect(winPercent({ cp: 300, pv: [] })).toBeGreaterThan(75)
    expect(winPercent({ mate: 3, pv: [] })).toBe(100)
    expect(winPercent({ mate: -2, pv: [] })).toBe(0)
  })

  it('clasificación por caída de probabilidad', () => {
    expect(classify(0, true)).toBe('mejor')
    expect(classify(2, false)).toBe('buena')
    expect(classify(6, false)).toBe('imprecision')
    expect(classify(12, false)).toBe('error')
    expect(classify(40, false)).toBe('grave')
  })

  it('precisión de jugada', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
    expect(moveAccuracy(50)).toBeLessThan(15)
  })

  it('formato de evaluación en español', () => {
    expect(formatEval({ cp: 125, pv: [] })).toBe('+1,3')
    expect(formatEval({ cp: -40, pv: [] })).toBe('-0,4')
    expect(formatEval({ mate: -3, pv: [] })).toBe('#-3')
  })

  it('notación española', () => {
    expect(toSpanishSan('Nxf7')).toBe('Cxf7')
    expect(toSpanishSan('Kxe2')).toBe('Rxe2')
    expect(toSpanishSan('Rxd7')).toBe('Txd7')
    expect(toSpanishSan('e8=Q+')).toBe('e8=D+')
    expect(toSpanishSan('O-O-O')).toBe('O-O-O')
  })

  it('balance de material', () => {
    expect(materialBalance(new Chess().fen())).toBe(0)
    expect(materialBalance('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(9)
  })

  it('las partidas de ejemplo se leen bien', () => {
    expect(parsePgn(DEMO_GAMES[0].pgn).moves).toHaveLength(14)
    expect(parsePgn(DEMO_GAMES[1].pgn).moves).toHaveLength(33)
  })

  it('detecta el error grave y explica la mejor jugada', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 4.Nxe5 Qg5 5.Nxf7?? (era mejor 5.Bxf7+)
    const parsed = parsePgn(DEMO_GAMES[0].pgn)
    const positions: PositionEval[] = parsed.fens.map(() => ({ cp: 30, pv: [] }))
    positions[8] = { cp: 250, best: 'c4f7', pv: ['c4f7', 'e8d8'] }
    positions[9] = { cp: -600, best: 'g5g2', pv: ['g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'] }
    const a = buildAnalysis(parsed, positions, 12)
    const m = a.moves[8]
    expect(m.san).toBe('Nxf7')
    expect(m.classification).toBe('grave')
    expect(m.comment).toContain('Era mejor Axf7+')
    expect(m.comment).toContain('Dxg2')
    expect(a.counts.white.grave).toBe(1)
  })
})

describe('importación', () => {
  it('normaliza una partida de Chess.com', () => {
    const pgn = '[ECOUrl "https://www.chess.com/openings/Italian-Game-Two-Knights-Defense-4.d3"]\n\n1. e4 e5 1-0'
    const g = normalizeChesscomGame(
      {
        url: 'https://www.chess.com/game/live/123',
        uuid: 'abc',
        pgn,
        end_time: 1700000000,
        time_class: 'rapid',
        rules: 'chess',
        white: { username: 'Pepe', rating: 512, result: 'win' },
        black: { username: 'Rival', rating: 530, result: 'resigned' },
      },
      'pepe',
    )!
    expect(g.result).toBe('1-0')
    expect(g.userColor).toBe('white')
    expect(outcomeFor(g)).toBe('victoria')
    expect(g.opening).toBe('Italian Game Two Knights Defense')
    expect(openingFromPgn('sin cabecera')).toBeUndefined()
  })

  it('descarta variantes en Chess.com y detecta tablas', () => {
    const base = { url: 'u/1', pgn: '1. e4', end_time: 1, white: { username: 'a', result: 'agreed' }, black: { username: 'b', result: 'agreed' } }
    expect(normalizeChesscomGame({ ...base, rules: 'chess960' }, 'a')).toBeNull()
    expect(normalizeChesscomGame({ ...base, rules: 'chess' }, 'a')!.result).toBe('1/2-1/2')
  })

  it('normaliza una partida de Lichess', () => {
    const g = normalizeLichessGame(
      {
        id: 'xyz',
        variant: 'standard',
        speed: 'blitz',
        status: 'mate',
        createdAt: 1,
        winner: 'black',
        players: { white: { user: { name: 'Pepe' }, rating: 900 }, black: { aiLevel: 3 } },
        opening: { name: 'Sicilian Defense' },
        pgn: '1. e4 c5',
      },
      'pepe',
    )!
    expect(g.result).toBe('0-1')
    expect(g.black.name).toBe('Stockfish nivel 3')
    expect(outcomeFor(g)).toBe('derrota')
  })

  it('convierte un problema de Lichess', () => {
    const p = puzzleFromLichess({
      game: { pgn: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7' },
      puzzle: { id: 'abc', rating: 900, solution: ['g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'], themes: ['mateIn3'], initialPly: 8 },
    })
    expect(p.fen.split(' ')[1]).toBe('b')
    expect(p.lastMove).toEqual(['e5', 'f7'])
    expect(p.moves[0]).toBe('g5g2')
  })

  it('importa un PGN pegado', () => {
    const g = gameFromPgn('[White "Pepe"]\n[Black "Ana"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0', 'pepe')
    expect(g.userColor).toBe('white')
    expect(g.result).toBe('1-0')
    expect(() => gameFromPgn('esto no es un pgn')).toThrow()
  })
})

describe('contexto para el entrenador', () => {
  it('resume la partida con los datos de Stockfish', async () => {
    const { buildGameContext, describePosition } = await import('./coach')
    const parsed = parsePgn(DEMO_GAMES[0].pgn)
    const positions: PositionEval[] = parsed.fens.map(() => ({ cp: 30, pv: [] }))
    positions[8] = { cp: 250, best: 'c4f7', pv: ['c4f7', 'e8d8'] }
    positions[9] = { cp: -600, best: 'g5g2', pv: ['g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'] }
    const a = buildAnalysis(parsed, positions, 12)
    const ctx = buildGameContext(DEMO_GAMES[0], parsed, a)
    expect(ctx).toContain('El alumno juega con: blancas')
    expect(ctx).toContain('derrota del alumno')
    expect(ctx).toContain('[ply 9] 5. Cxf7 (blancas)')
    expect(ctx).toContain('Mejor jugada: Axf7+ (línea: Axf7+ Rd8)')
    expect(ctx).toContain('el motor espera: Dxg2 Tf1 Dxe4+ Ae2 Cf3#')
    const pos = describePosition(parsed, a, 9)
    expect(pos).toContain('Juegan las negras')
    expect(pos).toContain('Mejor línea según Stockfish: Dxg2')
  })
})

describe('importación de Chess.com con fetch simulado', () => {
  const pgn = (w: string, b: string, r: string) =>
    `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "${w}"]\n[Black "${b}"]\n[Result "${r}"]\n[WhiteElo "500"]\n[BlackElo "510"]\n[Link "https://www.chess.com/game/live/1"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# ${r}`

  it('descarga el último mes y, si está vacío, sigue hacia atrás', async () => {
    const { fetchChesscomGames } = await import('./chesscom')
    const base = 'https://api.chess.com/pub/player/anriqui/games'
    const responses: Record<string, unknown> = {
      [`${base}/archives`]: { archives: [`${base}/2026/02`, `${base}/2026/09`, `${base}/2026/10`] },
      [`${base}/2026/10`]: { games: [] },
      [`${base}/2026/09`]: { games: [] },
      [`${base}/2026/02`]: {
        games: [{ url: 'https://www.chess.com/game/live/9', uuid: 'u9', pgn: pgn('Anriqui', 'Rival', '1-0'), end_time: 1771400000, rules: 'chess', time_class: 'rapid', white: { username: 'Anriqui', rating: 500, result: 'win' }, black: { username: 'Rival', rating: 510, result: 'checkmated' } }],
      },
    }
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const body = responses[url]
      return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 })
    }) as typeof fetch
    try {
      const games = await fetchChesscomGames('Anriqui ')
      expect(games).toHaveLength(1)
      expect(games[0].userColor).toBe('white')
    } finally {
      globalThis.fetch = original
    }
  })

  it('explica los errores con detalle técnico', async () => {
    const { fetchChesscomGames, ImportError } = await import('./chesscom')
    const original = globalThis.fetch
    try {
      globalThis.fetch = (async () => new Response('{}', { status: 404, statusText: 'Not Found' })) as typeof fetch
      await expect(fetchChesscomGames('anreki')).rejects.toThrow('no existe')
      globalThis.fetch = (async () => {
        throw new TypeError('Load failed')
      }) as typeof fetch
      const err = await fetchChesscomGames('anriqui').catch((e) => e)
      expect(err).toBeInstanceOf(ImportError)
      expect(err.detail).toContain('TypeError: Load failed')
    } finally {
      globalThis.fetch = original
    }
  })

  it('lee un archivo PGN con varias partidas', async () => {
    const { gamesFromPgnFile } = await import('./pgnImport')
    const text = [pgn('Anriqui', 'A', '1-0'), pgn('B', 'Anriqui', '1-0'), '[Event "Roto"]\n\n1. e4 e9'].join('\n\n')
    const { games, failed } = gamesFromPgnFile(text, 'anriqui')
    expect(games).toHaveLength(2)
    expect(failed).toBe(1)
    expect(games[0].source).toBe('chesscom')
    expect(games[1].userColor).toBe('black')
    expect(games[0].url).toBe('https://www.chess.com/game/live/1')
  })
})
