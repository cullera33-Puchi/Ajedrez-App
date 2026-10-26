import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildAnalysis, classify, formatEval, materialBalance, moveAccuracy, parsePgn, type PositionEval, toSpanishSan, winPercent } from './analysis'
import { normalizeChesscomGame, openingFromPgn } from './chesscom'
import { DEMO_GAMES } from './games'
import { normalizeLichessGame, puzzleFromLichess } from './lichess'
import { gameFromPgn } from './pgnImport'
import { INITIAL_PUZZLE_STATS, LOCAL_PUZZLES, updateRating } from './puzzles'
import { dailyStats, mergeLogs, type PuzzleAttempt, ratingChange } from './puzzleLog'
import { type GameSummary, outcomeFor } from './types'
import { isOnlineGame, openingStats, ratingSeries, results, score, themeTotals, weeklyAccuracy, weekStart } from './progress'
import type { AnalysisSummary } from './recommend'
import { boardToFen, fenToBoard, piecesToBoard } from './scan/scan'
import { cleanShape, fillHoles } from './scan/features'

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
