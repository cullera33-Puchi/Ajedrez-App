import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildAnalysis, classify, formatEval, materialBalance, moveAccuracy, parsePgn, type PositionEval, toSpanishSan, winPercent } from './analysis'
import { normalizeChesscomGame, openingFromPgn } from './chesscom'
import { DEMO_GAMES } from './games'
import { normalizeLichessGame, puzzleFromLichess } from './lichess'
import { gameFromPgn, gamesFromPgnFile } from './pgnImport'
import { INITIAL_PUZZLE_STATS, LOCAL_PUZZLES, updateRating } from './puzzles'
import { dailyStats, mergeLogs, type PuzzleAttempt, ratingChange } from './puzzleLog'
import { type GameSummary, outcomeFor } from './types'
import { isOnlineGame, openingStats, ratingSeries, results, score, themeTotals, weeklyAccuracy, weekStart } from './progress'
import type { AnalysisSummary } from './recommend'
import { boardToFen, fenToBoard, piecesToBoard } from './scan/scan'
import { cleanShape, fillHoles } from './scan/features'
import { LESSONS } from './lessons'
import { buildPlan, chooseReviewGame, judgeAnswer, mergeLists, planComplete, planSteps, PUZZLES_PER_DAY, refreshPlan, reviewMoments, streak, winAfterReply } from './training'
import type { GameAnalysis, MoveAnalysis } from './analysis'
import type { MyPuzzle } from './myPuzzles'
import type { OpeningGroup } from './openings'

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
      // Historial completo: primera vez todos los meses; la segunda, solo los dos más recientes
      const { importChesscomHistory } = await import('./chesscom')
      const got: string[] = []
      const urls: string[] = []
      const fetchMock = globalThis.fetch
      globalThis.fetch = (async (url: string) => {
        urls.push(url)
        return fetchMock(url)
      }) as typeof fetch
      const first = await importChesscomHistory('anriqui', (g) => got.push(...g.map((x) => x.id)))
      expect(first).toEqual({ games: 1, months: 3 })
      urls.length = 0
      const second = await importChesscomHistory('anriqui', () => undefined)
      expect(second.months).toBe(2)
      expect(urls.some((u) => u.endsWith('/2026/02'))).toBe(false)
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

describe('recomendación de temas por errores', () => {
  it('detecta un doble ataque de caballo', async () => {
    const { isFork } = await import('./recommend')
    // Tras Ce7+ el caballo ataca al rey de g8 y a la dama de c8
    const chess = new Chess('2q3k1/4Nppp/8/8/8/8/5PPP/6K1 b - - 1 1')
    expect(isFork(chess, 'e7')).toBe(true)
    expect(isFork(new Chess(), 'g1')).toBe(false)
  })

  it('asocia los errores de la partida trampa con temas', async () => {
    const { mistakeThemes } = await import('./recommend')
    const parsed = parsePgn(DEMO_GAMES[0].pgn)
    const positions: PositionEval[] = parsed.fens.map(() => ({ cp: 30, pv: [] }))
    // 5. Cxf7?? permite Dxg2 y pierde material
    positions[8] = { cp: 250, best: 'c4f7', pv: ['c4f7', 'e8e7', 'e5d4'] }
    positions[9] = { cp: -600, best: 'g5g2', pv: ['g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'] }
    // 7. Ae2?? permite mate en 1
    positions[12] = { cp: -700, best: 'd1e2', pv: ['d1e2', 'e4e2'] }
    positions[13] = { mate: -1, best: 'd4f3', pv: ['d4f3'] }
    const a = buildAnalysis(parsed, positions, 12)
    const res = mistakeThemes(parsed, a, 'w')
    const byPly = Object.fromEntries(res.map((r) => [r.ply, r.themes]))
    expect(byPly[13]).toEqual(expect.arrayContaining(['mateIn1', 'defensiveMove']))
    expect(byPly[9]).toBeDefined()
    expect(res.every((r) => r.themes.length > 0)).toBe(true)
  })
})

describe('bots', () => {
  const lines = [
    { move: 'e2e4', cp: 30, pv: ['e2e4'] },
    { move: 'd2d4', cp: 25, pv: ['d2d4'] },
    { move: 'g1h3', cp: -60, pv: ['g1h3'] },
    { move: 'f2f3', cp: -120, pv: ['f2f3'] },
  ]
  const legal = lines.map((l) => l.move)
  const start = new Chess().fen()

  it('el bot fuerte casi siempre elige las mejores y el flojo varía más', async () => {
    const { makeBot, pickMove } = await import('./bots')
    const BOTS = [makeBot(400), makeBot(1500)]
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const count = (botIdx: number) => {
      const c: Record<string, number> = {}
      for (let i = 0; i < 2000; i++) {
        const m = pickMove(start, BOTS[botIdx], lines, legal, 20, rand)
        c[m] = (c[m] ?? 0) + 1
      }
      return c
    }
    const strong = count(BOTS.length - 1)
    const weak = count(0)
    expect((strong['e2e4'] ?? 0) + (strong['d2d4'] ?? 0)).toBeGreaterThan(1900)
    expect((weak['g1h3'] ?? 0) + (weak['f2f3'] ?? 0)).toBeGreaterThan(300)
  })

  it('aprovecha un mate cuando no se despista', async () => {
    const { makeBot, pickMove } = await import('./bots')
    const BOTS = [makeBot(400)]
    const withMate = [{ move: 'h5f7', mate: 1, pv: ['h5f7'] }, ...lines]
    const noBlunder = () => 0.99 // nunca entra en el despiste y el sorteo cae en la jugada con más peso
    expect(pickMove(start, BOTS[0], withMate, legal, 20, noBlunder)).toBe('h5f7')
  })

  it('convierte la partida en un PGN válido', async () => {
    const { botGameToSummary } = await import('./bots')
    const g = { elo: 400, style: 'equilibrado' as const, userColor: 'white' as const, moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'], startedAt: Date.UTC(2026, 9, 27), undos: 0 }
    const s = botGameToSummary(g, '1-0', 'Anriqui', 'Jaque mate')
    expect(s.source).toBe('bot')
    expect(s.black.name).toBe('Lucía (bot)')
    expect(s.black.rating).toBe(400)
    expect(parsePgn(s.pgn).moves).toHaveLength(7)
    expect(s.pgn).toContain('[Result "1-0"]')
  })
})

describe('almacén de partidas (IndexedDB o memoria)', () => {
  it('migra partidas y análisis del formato anterior y guarda resúmenes', async () => {
    const { resetDbForTests } = await import('./db')
    const store = await import('./games')
    const { save, load, listKeys } = await import('./storage')
    const { summarizeStored } = await import('./recommend')
    resetDbForTests()
    store.resetStoreForTests()
    const g = { ...DEMO_GAMES[0], id: 'cc-viejo', source: 'chesscom' as const }
    const parsed = parsePgn(g.pgn)
    const positions: PositionEval[] = parsed.fens.map(() => ({ cp: 30, pv: [] }))
    positions[8] = { cp: 250, best: 'c4f7', pv: ['c4f7', 'e8e7'] }
    positions[9] = { cp: -600, best: 'g5g2', pv: ['g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'] }
    save('games', [g])
    save('analysis:cc-viejo', buildAnalysis(parsed, positions, 12))
    await store.initStore(summarizeStored)
    expect(store.getGames().map((x) => x.id)).toEqual(['cc-viejo'])
    expect(store.getSummary('cc-viejo')?.counts.white.grave).toBe(1)
    expect((await store.loadAnalysis('cc-viejo'))?.depth).toBe(12)
    expect(load('games', null)).toBeNull()
    expect(listKeys('analysis:')).toEqual([])
    // Fusión sin duplicados y ordenada por fecha
    const newer = { ...g, id: 'cc-nuevo', date: g.date + 1000 }
    expect(store.mergeGames([newer, g]).map((x) => x.id)).toEqual(['cc-nuevo', 'cc-viejo'])
  })
})

describe('problemas con tus errores', () => {
  it('repaso espaciado: acierto alarga el intervalo y fallo lo reinicia', async () => {
    const { scheduleNext } = await import('./myPuzzles')
    const DAY = 86400000
    const p = { id: 'g:9', gameId: 'g', ply: 9, fen: '', moves: ['c4f7'], playedSan: 'Cxf7', bestSan: 'Axf7+', opponent: 'Rival', date: 0, themes: [], srs: { due: 0, interval: 0, reps: 0, lapses: 0 } }
    const a = scheduleNext(p, true, 0)
    expect(a.srs).toMatchObject({ interval: 1, reps: 1, due: DAY })
    const b = scheduleNext(a, true, 0)
    expect(b.srs.interval).toBe(3)
    const c = scheduleNext(b, false, 0)
    expect(c.srs).toMatchObject({ interval: 0, lapses: 1, due: 10 * 60 * 1000 })
  })

  it('elige como candidatos los errores del usuario', async () => {
    const { candidatePlies } = await import('./myPuzzles')
    const parsed = parsePgn(DEMO_GAMES[0].pgn)
    const positions: PositionEval[] = parsed.fens.map(() => ({ cp: 30, pv: [] }))
    positions[8] = { cp: 250, best: 'c4f7', pv: ['c4f7', 'e8e7'] }
    positions[9] = { cp: -600, best: 'g5g2', pv: ['g5g2', 'h1f1'] }
    positions[12] = { cp: -700, best: 'd1e2', pv: ['d1e2'] }
    positions[13] = { mate: -1, best: 'd4f3', pv: ['d4f3'] }
    const a = buildAnalysis(parsed, positions, 12)
    const plies = candidatePlies({ ...DEMO_GAMES[0], userColor: 'white' }, parsed, a).map((c) => c.ply)
    expect(plies).toEqual(expect.arrayContaining([9, 13]))
    expect(plies.every((p) => p % 2 === 1)).toBe(true)
    expect(candidatePlies({ ...DEMO_GAMES[0], userColor: undefined }, parsed, a)).toEqual([])
  })
})

describe('copia de seguridad', () => {
  it('exporta e importa fusionando sin perder datos', async () => {
    const { resetDbForTests } = await import('./db')
    const store = await import('./games')
    const { save, load } = await import('./storage')
    const { exportBackup, importBackup, parseBackup } = await import('./backup')
    resetDbForTests()
    store.resetStoreForTests()
    const g1 = { ...DEMO_GAMES[0], id: 'cc-a', source: 'chesscom' as const }
    store.mergeGames([g1])
    save('puzzleStats', { rating: 700, solved: 10, failed: 5, streak: 2, history: [] })
    save('botRecord', { lucia: { w: 1, l: 2, d: 0 } })
    const backup = parseBackup(JSON.stringify(await exportBackup()))
    expect(backup.games.map((g) => g.id)).toEqual(['cc-a'])

    // Otro dispositivo: otra partida y menos problemas resueltos
    resetDbForTests()
    store.resetStoreForTests()
    store.mergeGames([{ ...g1, id: 'cc-b' }])
    save('puzzleStats', { rating: 600, solved: 1, failed: 0, streak: 1, history: [] })
    save('botRecord', { bruno: { w: 3, l: 0, d: 0 } })
    const r = await importBackup(backup)
    expect(r.games).toBe(1)
    expect(store.getGames().map((g) => g.id).sort()).toEqual(['cc-a', 'cc-b'])
    expect(load<{ rating: number }>('puzzleStats', { rating: 0 }).rating).toBe(700)
    expect(Object.keys(load('botRecord', {})).sort()).toEqual(['bruno', 'lucia'])
    expect(() => parseBackup('{"x":1}')).toThrow()
  })
})

describe('enlaces de aprendizaje', () => {
  it('prepara enlaces por tema', async () => {
    const { resourceLinks } = await import('../components/ResourceLinks')
    const fork = resourceLinks('fork')
    expect(fork[0].href).toBe('https://lichess.org/training/fork')
    expect(fork.some((l) => l.href.includes('youtube.com') && l.href.includes('doble%20ataque'))).toBe(true)
    expect(fork.some((l) => l.href.includes('google.com/search'))).toBe(true)
    expect(resourceLinks('raroDesconocido').some((l) => l.href.includes('lichess'))).toBe(false)
  })
})

describe('niveles de bot de 50 en 50', () => {
  it('ajusta el nivel a pasos de 50 y la fuerza crece con el nivel', async () => {
    const { makeBot, clampElo } = await import('./bots')
    expect(clampElo(437)).toBe(450)
    expect(clampElo(10)).toBe(250)
    expect(clampElo(5000)).toBe(2000)
    const a = makeBot(550)
    const b = makeBot(600)
    expect(a.id).toBe('elo-550')
    expect(a.name).toBe('Bruno')
    expect(b.blunder).toBeLessThan(a.blunder)
    expect(b.temperature).toBeLessThan(a.temperature)
    expect(makeBot(2000).depth).toBeGreaterThan(makeBot(250).depth)
    expect(makeBot(1800).name).toBe('La Maestra')
  })

  it('los despistes no pasan del límite de su nivel', async () => {
    const { makeBot, pickMove } = await import('./bots')
    const lines = [
      { move: 'e2e4', cp: 30, pv: ['e2e4'] },
      { move: 'd2d4', cp: -100, pv: ['d2d4'] },
      { move: 'd1h5', cp: -900, pv: ['d1h5'] },
    ]
    const strong = makeBot(1600)
    const alwaysBlunder = () => 0 // siempre entra en el despiste y elige el primero del grupo
    expect(pickMove(new Chess().fen(), strong, lines, lines.map((l) => l.move), 20, alwaysBlunder)).toBe('d2d4')
    const onlyHuge = [lines[0], lines[2]]
    // Si no hay jugadas «razonablemente peores», no regala la dama: juega con normalidad
    expect(pickMove(new Chess().fen(), strong, onlyHuge, onlyHuge.map((l) => l.move), 20, alwaysBlunder)).toBe('e2e4')
  })

  it('pasa el récord de la versión anterior a niveles', async () => {
    const { save } = await import('./storage')
    const { loadBotRecord } = await import('./bots')
    save('botRecord', { lucia: { w: 1, l: 2, d: 0 }, 'elo-400': { w: 1, l: 0, d: 0 } })
    expect(loadBotRecord()).toEqual({ 'elo-400': { w: 2, l: 2, d: 0 } })
  })
})

describe('histórico de problemas', () => {
  const day = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()
  const log: PuzzleAttempt[] = [
    { t: day(20), win: true, source: 'local', difficulty: 500, prev: 600, rating: 620 },
    { t: day(24), win: false, source: 'lichess', difficulty: 700, prev: 620, rating: 600 },
    { t: day(24, 18), win: true, source: 'mine', difficulty: null, prev: null, rating: null },
    { t: day(26), win: true, source: 'local', difficulty: 600, prev: 600, rating: 630 },
  ]

  it('agrupa por día con días vacíos y arrastra el nivel', () => {
    const s = dailyStats(log, 5, day(26, 20))
    expect(s.map((d) => d.total)).toEqual([0, 0, 2, 0, 1])
    expect(s[0].rating).toBe(620)
    expect(s[2]).toMatchObject({ wins: 1, avgDifficulty: 700, rating: 600 })
    expect(s[3].rating).toBe(600)
    expect(ratingChange(log, s)).toBe(10)
  })

  it('calcula el cambio desde el primer intento si no hay datos previos', () => {
    expect(ratingChange(log, dailyStats(log, 30, day(26, 20)))).toBe(30)
  })

  it('fusiona históricos sin duplicar', () => {
    expect(mergeLogs(log.slice(0, 3), log.slice(1))).toHaveLength(4)
  })
})

describe('progreso', () => {
  const mk = (id: string, days: number, color: 'white' | 'black', result: '1-0' | '0-1' | '1/2-1/2', rating: number, opening: string, source: GameSummary['source'] = 'chesscom'): GameSummary => ({
    id,
    source,
    white: { name: color === 'white' ? 'yo' : 'rival', rating: color === 'white' ? rating : 600 },
    black: { name: color === 'black' ? 'yo' : 'rival', rating: color === 'black' ? rating : 600 },
    userColor: color,
    result,
    timeClass: 'rapid',
    date: new Date(2026, 9, days).getTime(),
    opening,
    pgn: '',
  })
  const games = [
    mk('a', 1, 'white', '1-0', 500, 'Italian Game: Two Knights'),
    mk('b', 3, 'white', '0-1', 490, 'Italian Game'),
    mk('c', 5, 'white', '0-1', 480, 'Italian Game: Giuoco Piano'),
    mk('d', 8, 'black', '1/2-1/2', 485, 'Sicilian Defense'),
    mk('e', 9, 'black', '0-1', 500, 'Sicilian Defense'),
    mk('f', 10, 'black', '0-1', 515, 'Sicilian Defense: Najdorf'),
    mk('z', 11, 'white', '1-0', 900, 'Italian Game', 'bot'),
  ]

  it('excluye las partidas contra bots', () => {
    expect(games.filter(isOnlineGame)).toHaveLength(6)
  })

  it('cuenta resultados y puntuación', () => {
    const r = results(games.filter(isOnlineGame))
    expect(r).toEqual({ n: 6, w: 3, d: 1, l: 2 })
    expect(score(r)).toBe(58)
  })

  it('agrupa aperturas por familia y color, de peor a mejor', () => {
    const o = openingStats(games.filter(isOnlineGame))
    expect(o.map((x) => [x.opening, x.color, x.score])).toEqual([
      ['Italian Game', 'white', 33],
      ['Sicilian Defense', 'black', 83],
    ])
  })

  it('ordena el rating por fecha y agrupa la precisión por semana', () => {
    const online = games.filter(isOnlineGame)
    expect(ratingSeries(online).map((p) => p.rating)).toEqual([500, 490, 480, 485, 500, 515])
    const sums = new Map<string, AnalysisSummary>(
      online.map((g, i) => [g.id, { id: g.id, depth: 12, accuracy: { white: 60 + i, black: 60 + i }, counts: { white: { grave: 1 }, black: { grave: 2 } }, themes: [{ theme: 'fork', count: 1 }], analyzedAt: 0 } as unknown as AnalysisSummary]),
    )
    const w = weeklyAccuracy(online, sums)
    expect(w.reduce((s, x) => s + x.n, 0)).toBe(6)
    expect(themeTotals(online, sums)).toEqual([{ theme: 'fork', count: 6 }])
    expect(weekStart(new Date(2026, 9, 29, 15).getTime())).toBe(new Date(2026, 9, 26).getTime())
  })
})

describe('escáner', () => {
  it('pasa de FEN a casillas y vuelve, deduciendo los enroques', () => {
    const fen = 'r3k2r/pppq1ppp/2n2n2/8/8/2N2N2/PPPQ1PPP/R3K2R b KQkq - 0 1'
    const b = fenToBoard(fen)!
    expect(b).toHaveLength(64)
    expect(boardToFen(b, 'b')).toBe(fen)
    const noCastle = [...b]
    noCastle[63] = null
    expect(boardToFen(noCastle, 'w').split(' ')[2]).toBe('Qkq')
  })

  it('gira la lectura si las blancas estaban arriba', () => {
    const b = fenToBoard('4k3/8/8/8/8/8/8/4K3 w - - 0 1')!
    expect(piecesToBoard([...b].reverse(), true)).toEqual(b)
  })

  it('rellena los huecos de una silueta y descarta manchas sueltas', () => {
    // Anillo de 5x5 con hueco y un punto suelto en la esquina.
    const w = 8
    const m = new Uint8Array(w * w)
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) if (y === 1 || y === 5 || x === 1 || x === 5) m[y * w + x] = 1
    m[7 * w + 7] = 1
    expect(fillHoles(m, w, w)[3 * w + 3]).toBe(1)
    const s = cleanShape(m, w, w)!
    expect(s.box).toEqual({ x0: 1, y0: 1, x1: 5, y1: 5 })
    expect(s.mask[7 * w + 7]).toBe(0)
  })
})

describe('familias de aperturas', () => {
  it('agrupa nombres de Chess.com y de Lichess', async () => {
    const { openingFamily } = await import('./progress')
    expect(openingFamily('Italian Game Two Knights Defense')).toBe('Italian Game')
    expect(openingFamily('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense')
    expect(openingFamily('Queens Pawn Opening Zukertort')).toBe('Queens Pawn Opening')
    expect(openingFamily('Kings Gambit Accepted')).toBe('Kings Gambit')
    expect(openingFamily('Ruy Lopez')).toBe('Ruy Lopez')
  })
})

describe('valoraciones de bots', () => {
  it('genera el texto para Claude y fusiona sin duplicar partidas', async () => {
    const { feedbackReport, mergeFeedback } = await import('./botFeedback')
    const f = { t: new Date(2026, 9, 26).getTime(), gameId: 'bot-1', elo: 550, style: 'equilibrado' as const, feel: 'dificil' as const, note: 'Me ganó la dama en la jugada 8', result: '0-1' as const, userColor: 'white' as const, plies: 41 }
    const text = feedbackReport([f])
    expect(text).toContain('bot 550 equilibrado, perdí con blancas en 21 jugadas: difícil. Nota: Me ganó la dama en la jugada 8')
    expect(mergeFeedback([f], [{ ...f, t: f.t + 1, feel: 'adecuado' }])).toHaveLength(1)
    expect(mergeFeedback([f], [{ ...f, t: f.t + 1, feel: 'adecuado' }])[0].feel).toBe('adecuado')
  })
})

describe('paquete de problemas', () => {
  it('elige cerca del nivel y evita los ya vistos', async () => {
    const { pickNear } = await import('./puzzlePack')
    const mk = (id: string, rating: number) => ({ id, fen: '', moves: [], rating, themes: [], source: 'local' as const })
    const pool = [mk('a', 400), mk('b', 620), mk('c', 650), mk('d', 1400)]
    expect(['b', 'c']).toContain(pickNear(pool, 600, new Set())!.id)
    expect(pickNear(pool, 600, new Set(['b']), () => 0)!.id).toBe('c')
    expect(pickNear(pool, 600, new Set(['b', 'c']), () => 0)!.id).toBe('a')
    expect(pickNear([], 600, new Set())).toBeNull()
  })
})

describe('lecciones', () => {
  it('tienen posiciones válidas y empieza el bando correcto', async () => {
    const { LESSONS, lessonColor } = await import('./lessons')
    expect(LESSONS.length).toBe(11)
    for (const l of LESSONS) {
      const c = new Chess(l.fen)
      expect(c.isGameOver()).toBe(false)
      // Siempre empiezan las blancas: el alumno o, en las de defensa (alumno con negras), el motor.
      expect(c.turn()).toBe('w')
      expect(lessonColor(l)).toBe(l.goal === 'draw' ? 'black' : 'white')
    }
  })

  it('reconoce el mate de la coz y el fallo por pieza perdida', async () => {
    const { LESSONS, checkLesson } = await import('./lessons')
    const coz = LESSONS.find((l) => l.id === 'smothered')!
    const c = new Chess(coz.fen)
    for (const m of ['Nf7+', 'Kg8', 'Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#']) c.move(m)
    expect(checkLesson(coz, c, 4, { w: 2, b: 1 }).state).toBe('won')
    const phil = LESSONS.find((l) => l.id === 'philidor')!
    const p = new Chess('4k3/7R/8/3KP3/8/8/8/8 b - - 0 1')
    expect(checkLesson(phil, p, 3, { w: 2, b: 1 }).state).toBe('lost')
  })
})

describe('aperturas', () => {
  const mkGame = (id: string, pgn: string, color: 'white' | 'black', opening: string, result: '1-0' | '0-1' = '1-0'): GameSummary => ({
    id,
    source: 'chesscom',
    white: { name: 'w' },
    black: { name: 'b' },
    userColor: color,
    result,
    date: 0,
    opening,
    pgn,
  })

  it('agrupa, construye el árbol y saca la línea habitual con la corrección de Stockfish', async () => {
    const o = await import('./openings')
    const games = [
      mkGame('1', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5', 'white', 'Italian Game Two Knights'),
      mkGame('2', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Bc5', 'white', 'Italian Game'),
      mkGame('3', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6', 'white', 'Italian Game: Giuoco Piano', '0-1'),
      mkGame('4', '1. d4 d5 2. c4 e6', 'black', 'Queens Gambit Declined'),
      mkGame('5', '1. e4 e5 2. Nf3 Nc6', 'white', 'Italian Game', '1-0'),
    ]
    games[4].source = 'bot'
    const top = o.topOpenings(games)
    expect(top.white.map((g) => [g.family, g.games.length])).toEqual([['Italian Game', 3]])
    expect(top.black[0].family).toBe('Queens Gambit')
    const tree = o.buildTree(top.white[0])
    const root = tree.get(o.START_KEY)!
    expect(root.userToMove).toBe(true)
    expect(root.moves[0]).toMatchObject({ san: 'e4', count: 3 })
    const line = o.mainLine(tree, {})
    expect(line.map((s) => s.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5'])
    // Si Stockfish ve peor Cg5 (pierde un 12 %), el repertorio propone d4.
    const g5 = line[6]
    const reviews = { [`${g5.key}|${g5.uci}`]: { best: 'd2d4', bestSan: 'd4', drop: 12 } }
    const fixed = o.mainLine(tree, reviews)
    expect(fixed[6]).toMatchObject({ san: 'd4', rep: { corrected: { yourSan: 'Ng5', drop: 12 } } })
    expect(o.reviewLabel(12)).toBe('error')
  })

  it('elige la respuesta del rival según lo que te juegan y programa los repasos', async () => {
    const o = await import('./openings')
    const node = { key: 'k', fen: '', ply: 1, count: 5, userToMove: false, moves: [{ san: 'e5', uci: 'e7e5', count: 4 }, { san: 'c5', uci: 'c7c5', count: 1 }] }
    expect(o.pickReply(node, () => 0.99)!.san).toBe('e5')
    o.recordPractice('x', true, 0)
    expect(o.isDue(o.loadOpeningSrs(), 'x', 1000)).toBe(false)
    o.recordPractice('x', false, 0)
    expect(o.isDue(o.loadOpeningSrs(), 'x', 11 * 60 * 1000)).toBe(true)
  })
})

describe('sincronización', () => {
  it('la copia no incluye la sesión ni la configuración de la sincronización', async () => {
    const { save } = await import('./storage')
    const { exportBackup } = await import('./backup')
    save('syncSession', { access_token: 'secreto' })
    save('syncConfig', { url: 'https://x.supabase.co', anonKey: 'k' })
    save('botElo', 550)
    const b = await exportBackup(false)
    expect(Object.keys(b.local)).toContain('botElo')
    expect(Object.keys(b.local)).not.toContain('syncSession')
    expect(Object.keys(b.local)).not.toContain('syncConfig')
  })

  it('valida la dirección del proyecto', async () => {
    const { saveSyncConfig, loadSyncConfig } = await import('./sync')
    expect(() => saveSyncConfig('http://inseguro.com', 'x'.repeat(30))).toThrow()
    saveSyncConfig('https://abcd.supabase.co/', 'x'.repeat(30))
    expect(loadSyncConfig()!.url).toBe('https://abcd.supabase.co')
  })
})

describe('juego online en Lichess', () => {
  it('interpreta el estado completo y los cambios de la partida', async () => {
    const { applyGameEvent, clockLeft, formatClock, isFinished } = await import('./lichessPlay')
    const full = {
      type: 'gameFull',
      id: 'abc',
      rated: false,
      speed: 'rapid',
      clock: { initial: 600000, increment: 0 },
      initialFen: 'startpos',
      white: { id: 'anriqui', name: 'anriqui', rating: 1100 },
      black: { aiLevel: 3 },
      state: { type: 'gameState', moves: 'e2e4 e7e5', wtime: 590000, btime: 600000, status: 'started', wdraw: false, bdraw: false },
    }
    let g = applyGameEvent(null, full, 'Anriqui')!
    expect(g.color).toBe('white')
    expect(g.black.name).toBe('Stockfish de Lichess (nivel 3)')
    expect(g.moves).toEqual(['e2e4', 'e7e5'])
    // Le toca a blancas: su reloj corre.
    expect(clockLeft(g, 'white', g.receivedAt + 5000)).toBe(585000)
    expect(clockLeft(g, 'black', g.receivedAt + 5000)).toBe(600000)
    g = applyGameEvent(g, { type: 'gameState', moves: 'e2e4 e7e5 d1h5', wtime: 588000, btime: 600000, status: 'started', bdraw: true }, 'anriqui')!
    expect(g.bdraw).toBe(true)
    g = applyGameEvent(g, { type: 'gameState', moves: 'e2e4 e7e5 d1h5', status: 'resign', winner: 'white' }, 'anriqui')!
    expect(isFinished(g.status)).toBe(true)
    expect(g.winner).toBe('white')
    expect(formatClock(65000)).toBe('1:05')
    expect(formatClock(9400)).toBe('0:09,4')
  })

  it('lee un flujo NDJSON partido en trozos', async () => {
    const { readNdjson } = await import('./lichessPlay')
    const enc = new TextEncoder()
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('{"type":"gameStart","ga'))
        c.enqueue(enc.encode('me":{"gameId":"x1"}}\n\n{"type":"gameFinish"}\n'))
        c.close()
      },
    })
    const got: unknown[] = []
    await readNdjson(new Response(body), (o) => got.push(o))
    expect(got).toEqual([{ type: 'gameStart', game: { gameId: 'x1' } }, { type: 'gameFinish' }])
  })

  it('prepara la página del token con los permisos', async () => {
    const { tokenCreateUrl } = await import('./lichessAuth')
    const u = new URL(tokenCreateUrl())
    expect(u.searchParams.getAll('scopes[]')).toEqual(['board:play', 'challenge:read', 'challenge:write'])
  })
})

describe('correcciones de la revisión', () => {
  it('no duplica una partida importada por la API y desde un PGN', async () => {
    const { mergeGames, getGames } = await import('./games')
    const base = { white: { name: 'a' }, black: { name: 'b' }, result: '1-0' as const, date: 5, pgn: '1. e4' }
    mergeGames([{ ...base, id: 'pgn-x1', source: 'chesscom', url: 'https://www.chess.com/game/live/999' }])
    mergeGames([{ ...base, id: 'cc-uuid', source: 'chesscom', url: 'https://www.chess.com/game/live/999' }])
    mergeGames([{ ...base, id: 'pgn-x2', source: 'chesscom', url: 'https://www.chess.com/game/live/999' }])
    expect(getGames().filter((g) => g.url === 'https://www.chess.com/game/live/999').map((g) => g.id)).toEqual(['cc-uuid'])
  })

  it('da a los PGN de Lichess el mismo id que la API y marca las partidas contra su Stockfish', () => {
    const pgn = (white: string) => `[Event "Rated"]\n[Site "https://lichess.org/AbCd1234"]\n[White "${white}"]\n[Black "anriqui"]\n[Result "0-1"]\n\n1. e4 e5 0-1`
    const { games } = gamesFromPgnFile(`${pgn('rival')}\n\n${pgn('lichess AI level 3')}`, 'anriqui')
    expect(games[0]).toMatchObject({ id: 'li-AbCd1234', source: 'lichess' })
    expect(games[1].source).toBe('bot')
    const g = normalizeLichessGame(
      { id: 'zz', variant: 'standard', status: 'mate', createdAt: 0, winner: 'white', players: { white: { user: { name: 'anriqui' } }, black: { aiLevel: 2 } }, pgn: '1. e4 e5' },
      'anriqui',
    )
    expect(g?.source).toBe('bot')
  })

  it('fusiona el progreso de lecciones y aperturas de dos dispositivos', async () => {
    const { save, load } = await import('./storage')
    const { importBackup } = await import('./backup')
    save('lessonProgress', { 'two-rooks': { done: true, best: 9 } })
    save('openingSrs', { a: { due: 1, interval: 1, reps: 1, lapses: 0 } })
    await importBackup({
      app: 'ajedrez-app',
      version: 1,
      exportedAt: 0,
      games: [],
      analyses: [],
      summaries: [],
      puzzles: [],
      local: { lessonProgress: { 'two-rooks': { done: true, best: 7 }, queen: { done: true, best: 12 } }, openingSrs: { a: { due: 9, interval: 3, reps: 2, lapses: 1 } } },
    })
    expect(load('lessonProgress', {})).toEqual({ 'two-rooks': { done: true, best: 7 }, queen: { done: true, best: 12 } })
    expect(load<Record<string, { reps: number }>>('openingSrs', {}).a.reps).toBe(2)
  })
})

describe('entrenamiento de hoy', () => {
  const DAY = 86_400_000
  const now = new Date('2026-10-27T18:00:00').getTime()
  const game = (id: string, daysAgo: number, source: GameSummary['source'] = 'chesscom'): GameSummary => ({
    id, source, white: { name: 'anriqui' }, black: { name: `rival-${id}` }, result: '0-1', userColor: 'white', date: now - daysAgo * DAY, pgn: '',
  })
  const counts = (error: number, grave: number) => ({ mejor: 0, buena: 0, imprecision: 0, error, grave })
  const summary = (id: string, errors: number): AnalysisSummary => ({
    id, depth: 12, accuracy: { white: 70, black: 70 }, counts: { white: counts(errors, 0), black: counts(0, 0) }, themes: [], analyzedAt: now,
  })

  it('elige para el repaso la partida real más reciente, analizada, con errores y sin repasar', () => {
    const games = [game('a', 1), game('b', 2), game('bot', 0, 'bot'), game('c', 3), game('vieja', 40)]
    const sums = new Map([['a', summary('a', 0)], ['b', summary('b', 2)], ['c', summary('c', 1)], ['bot', summary('bot', 3)], ['vieja', summary('vieja', 3)]])
    expect(chooseReviewGame(games, (id) => sums.get(id), [], now)?.id).toBe('b')
    expect(chooseReviewGame(games, (id) => sums.get(id), ['b'], now)?.id).toBe('c')
    expect(chooseReviewGame(games, (id) => sums.get(id), ['b', 'c'], now)).toBeUndefined()
  })

  it('momentos del repaso: los errores más caros, en el orden de la partida', () => {
    const m = (ply: number, color: 'w' | 'b', classification: MoveAnalysis['classification'], drop: number) => ({ ply, color, classification, drop }) as MoveAnalysis
    const analysis = { moves: [m(1, 'w', 'grave', 30), m(2, 'b', 'grave', 50), m(3, 'w', 'error', 12), m(5, 'w', 'grave', 40), m(7, 'w', 'error', 11), m(9, 'w', 'imprecision', 6)] } as GameAnalysis
    expect(reviewMoments(game('x', 0), analysis).map((x) => x.ply)).toEqual([1, 3, 5])
    const clean = { moves: [m(1, 'w', 'buena', 1), m(3, 'w', 'imprecision', 7)] } as GameAnalysis
    expect(reviewMoments(game('x', 0), clean).map((x) => x.ply)).toEqual([3])
  })

  it('valora la respuesta del repaso', () => {
    expect(judgeAnswer('e2e4', 'e2e4', 'd2d4', 60, undefined)).toBe('best')
    expect(judgeAnswer('d2d4', 'e2e4', 'd2d4', 60, 30)).toBe('played')
    expect(judgeAnswer('c2c4', 'e2e4', 'd2d4', 60, 57)).toBe('good')
    expect(judgeAnswer('g2g4', 'e2e4', 'd2d4', 60, 40)).toBe('bad')
    expect(winAfterReply({ cp: 0 })).toBeCloseTo(50)
    expect(winAfterReply({ mate: -2 })).toBe(100)
  })

  it('plan del día: quita del paso de errores los de la partida repasada y elige tema, apertura y lección', () => {
    const mp = (id: string, gameId: string) => ({ id, gameId }) as MyPuzzle
    const opening = (id: string) => ({ id, family: id, color: 'white' }) as OpeningGroup
    const plan = buildPlan({
      day: '2026-10-27',
      reviewGame: game('b', 2),
      dueMistakes: [mp('b:5', 'b'), mp('x:3', 'x'), mp('y:9', 'y'), mp('z:1', 'z'), mp('w:2', 'w')],
      themes: ['raro', 'fork'],
      themeAvailable: (t) => t === 'fork',
      openings: [opening('ya'), opening('toca')],
      openingSrs: { ya: { due: now + DAY, interval: 1, reps: 1, lapses: 0 }, toca: { due: now - 1, interval: 1, reps: 2, lapses: 1 } },
      lessons: LESSONS,
      lessonProgress: { [LESSONS[0].id]: { done: true } },
      now,
    })
    expect(plan.review).toEqual({ gameId: 'b', opponent: 'rival-b' })
    expect(plan.mistakes).toEqual(['x:3', 'y:9', 'z:1'])
    expect(plan.theme).toBe('fork')
    expect(plan.opening).toEqual({ id: 'toca', family: 'toca', mark: 3 })
    expect(plan.lesson?.id).toBe(LESSONS[1].id)
    expect(planSteps(plan).map((s) => s.id)).toEqual(['review', 'mistakes', 'puzzles', 'opening', 'lesson'])
    expect(planComplete(plan)).toBe(false)

    // Lo que se hace fuera de la sesión cuenta al volver.
    const after = refreshPlan(plan, { toca: { due: now + DAY, interval: 2, reps: 3, lapses: 1 } }, { [LESSONS[1].id]: { done: true } }, ['b'])
    expect(after.done).toMatchObject({ review: true, opening: true, lesson: true })
    expect(planComplete({ ...after, done: { ...after.done, mistakes: 3, puzzles: PUZZLES_PER_DAY } })).toBe(true)
  })

  it('sin datos, el plan es de problemas variados y la primera lección', () => {
    const plan = buildPlan({ day: 'd', dueMistakes: [], themes: [], themeAvailable: () => true, openings: [], openingSrs: {}, lessons: LESSONS, lessonProgress: {} })
    expect(planSteps(plan).map((s) => s.id)).toEqual(['puzzles', 'lesson'])
    expect(plan.theme).toBe('mix')
  })

  it('racha de días seguidos, contando hasta ayer si hoy aún no está hecho', () => {
    expect(streak(['2026-10-25', '2026-10-26', '2026-10-27'], now)).toBe(3)
    expect(streak(['2026-10-25', '2026-10-26'], now)).toBe(2)
    expect(streak(['2026-10-24', '2026-10-26'], now)).toBe(1)
    expect(streak(['2026-10-20'], now)).toBe(0)
    expect(mergeLists(['2026-10-26', 'a'], ['a', '2026-10-27'])).toEqual(['2026-10-26', '2026-10-27', 'a'])
  })
})

describe('huella de la sincronización', () => {
  const base = { app: 'ajedrez-app' as const, version: 1 as const, games: [], analyses: [], summaries: [], puzzles: [] }
  it('no depende de la fecha de exportación ni del orden de los ajustes', async () => {
    const { fingerprint } = await import('./sync')
    const a = await fingerprint({ ...base, exportedAt: 1, local: { b: { y: 1, x: 2 }, a: [1, 2] } })
    const b = await fingerprint({ ...base, exportedAt: 2, local: { a: [1, 2], b: { x: 2, y: 1 } } })
    const c = await fingerprint({ ...base, exportedAt: 2, local: { a: [2, 1], b: { x: 2, y: 1 } } })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('piezas colgadas', () => {
  it('ve una pieza que se puede capturar gratis y una mal defendida', async () => {
    const { winnableTargets } = await import('./hanging')
    // Las blancas mueven: caballo negro en e5 sin defender; alfil negro en c5 defendido por el peón b6, atacado por el peón d4.
    const t = winnableTargets('4k3/8/1p6/2b1n3/3P4/8/8/3RK3 w - - 0 1')
    const by = Object.fromEntries(t.map((x) => [x.square, x.gain]))
    expect(by.e5).toBe(3)
    expect(by.c5).toBe(2)
  })

  it('avisa si tu jugada deja una pieza colgada o un mate, y no por un cambio igualado', async () => {
    const { dangerAfterMove, describeDanger } = await import('./hanging')
    // Dama blanca a h5, donde la captura el caballo de f6.
    const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 3'
    const d = dangerAfterMove(fen, 'd1h5')
    expect(d?.kind).toBe('hanging')
    expect(describeDanger(d!, 'Dh5')).toContain('tu dama de h5 se queda colgada')
    // Jugada normal: sin aviso.
    expect(dangerAfterMove(fen, 'g1f3')).toBeNull()
    // Mate del pastor permitido: tras f3 las negras dan mate con Dh4.
    const d2 = dangerAfterMove('rnbqkbnr/pppp1ppp/8/4p3/6P1/8/PPPPPP1P/RNBQKBNR w KQkq - 0 2', 'f2f3')
    expect(d2).toEqual({ kind: 'mate', reply: 'Dh4#' })
    // Capturar una pieza aunque la recuperen (alfil por caballo): no es un error.
    expect(dangerAfterMove('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'b5c6')).toBeNull()
  })
})

describe('gestión del tiempo', () => {
  const pgn = `[White "anriqui"]
[Black "rival"]
[Result "0-1"]
[TimeControl "600"]
[Termination "rival won on time"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:55]} 2. Qh5 {[%clk 0:09:56]} 2... Nc6 {[%clk 0:09:40]} 3. Qxf7+ {[%clk 0:00:30]} 0-1`

  it('lee los relojes y calcula el tiempo de cada jugada', async () => {
    const { parseClocks, quickLimit } = await import('./clock')
    const c = parseClocks(pgn)!
    expect(c.base).toBe(600)
    expect(c.left).toEqual([598, 595, 596, 580, 30])
    expect(c.spent).toEqual([2, 5, 2, 15, 566])
    expect(quickLimit(600)).toBe(6)
    expect(parseClocks('[TimeControl "1/259200"]\n\n1. e4 *')).toBeNull()
  })

  it('cuenta los errores hechos con prisa y la derrota por tiempo', async () => {
    const { timingFor } = await import('./clock')
    const m = (ply: number, color: 'w' | 'b', classification: MoveAnalysis['classification']) => ({ ply, color, classification }) as MoveAnalysis
    const game = { id: 'x', source: 'chesscom', white: { name: 'anriqui' }, black: { name: 'rival' }, result: '0-1', userColor: 'white', date: 0, pgn } as GameSummary
    const t = timingFor(game, { moves: [m(1, 'w', 'mejor'), m(2, 'b', 'buena'), m(3, 'w', 'grave'), m(4, 'b', 'buena'), m(5, 'w', 'error')] } as GameAnalysis)!
    expect(t).toMatchObject({ moves: 3, quick: 2, errors: 2, quickErrors: 1, low: 1, lowErrors: 1, lostOnTime: true })
  })
})

describe('resumen semanal', () => {
  it('compara la semana actual con la anterior', async () => {
    const { weeklySummary } = await import('./weekly')
    const now = new Date('2026-10-28T12:00:00').getTime() // miércoles
    const g = (id: string, iso: string, result: GameSummary['result'], rating: number): GameSummary => ({
      id, source: 'chesscom', white: { name: 'anriqui', rating }, black: { name: 'r' }, result, userColor: 'white', timeClass: 'rapid', date: new Date(iso).getTime(), pgn: '',
    })
    const games = [g('a', '2026-10-27T10:00:00', '1-0', 520), g('b', '2026-10-26T10:00:00', '0-1', 505), g('c', '2026-10-21T10:00:00', '1-0', 500)]
    const log: PuzzleAttempt[] = [
      { t: new Date('2026-10-27T09:00:00').getTime(), win: true, source: 'local', difficulty: 600, prev: 600, rating: 615 },
      { t: new Date('2026-10-28T09:00:00').getTime(), win: false, source: 'local', difficulty: 700, prev: 615, rating: 605 },
    ]
    const w = weeklySummary(now, games, new Map(), log, ['2026-10-26', '2026-10-27', '2026-10-20'])
    expect(w.days).toBe(3)
    expect(w.current).toMatchObject({ games: 2, w: 1, l: 1, rating: 520, ratingDelta: 20, puzzles: 2, puzzleWins: 1, puzzleRating: 605, puzzleDelta: 5, trainingDays: 2 })
    expect(w.previous).toMatchObject({ games: 1, trainingDays: 1 })
  })
})

describe('visión del tablero', () => {
  it('comprueba las piezas marcadas y fusiona las mejores marcas', async () => {
    const { checkHanging, mergeVisionBest, randomSquare } = await import('./vision')
    const pos = { fen: '', targets: [{ square: 'e5' }, { square: 'c5' }] } as never
    expect(checkHanging(pos, ['e5', 'c5']).perfect).toBe(true)
    expect(checkHanging(pos, ['e5', 'a1'])).toMatchObject({ hits: ['e5'], wrong: ['a1'], missed: ['c5'], perfect: false })
    expect(mergeVisionBest({ coords: 12, hanging: 2 }, { coords: 9, hanging: 4 })).toEqual({ coords: 12, hanging: 4 })
    expect(randomSquare('e4', () => 0.5)).toMatch(/^[a-h][1-8]$/)
  })
})
