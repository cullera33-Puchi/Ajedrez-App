export interface Puzzle {
  id: string
  /** Posición inicial. Mueve el jugador que resuelve. */
  fen: string
  /** Solución en UCI: jugada del usuario, respuesta del rival, jugada del usuario... */
  moves: string[]
  rating: number
  themes: string[]
  source: 'local' | 'lichess'
  url?: string
  /** Última jugada del rival antes del problema, para resaltarla en el tablero. */
  lastMove?: [string, string]
}

type LocalPuzzle = Omit<Puzzle, 'source'>

/** Set de iniciación. Cada solución está comprobada con Stockfish (única jugada ganadora). */
const LOCAL: LocalPuzzle[] = [
  { id: 'b09', fen: '4k3/ppp2ppp/8/8/3r4/8/PPP2PPP/3QK3 w - - 0 1', moves: ['d1d4'], rating: 300, themes: ['hangingPiece'] },
  { id: 'c07', fen: 'rnbqkbnr/ppp2ppp/8/3pp1Q1/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 3', moves: ['d8g5'], rating: 300, themes: ['hangingPiece','opening'] },
  { id: 'c11', fen: '8/4P3/8/8/8/k7/8/K7 w - - 0 1', moves: ['e7e8q'], rating: 300, themes: ['promotion'] },
  { id: 'b03', fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', moves: ['f3h4'], rating: 350, themes: ['hangingPiece','opening'] },
  { id: 'b13', fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3', moves: ['d1h5'], rating: 350, themes: ['mateIn1','opening'] },
  { id: 'c03', fen: 'k7/pp6/8/8/8/8/8/K6R w - - 0 1', moves: ['h1h8'], rating: 350, themes: ['mateIn1','backRankMate'] },
  { id: 'c09', fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', moves: ['d8h4'], rating: 350, themes: ['mateIn1','opening'] },
  { id: 'b02', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', moves: ['h5f7'], rating: 400, themes: ['mateIn1','opening'] },
  { id: 'b07', fen: 'k7/2Q5/1K6/8/8/8/8/8 w - - 0 1', moves: ['c7d8'], rating: 400, themes: ['mateIn1'] },
  { id: 'c02', fen: 'rn1qkbnr/ppp2ppp/3p4/4p3/4P1b1/5P2/PPPP2PP/RNBQKBNR w KQkq - 1 4', moves: ['f3g4'], rating: 400, themes: ['hangingPiece','opening'] },
  { id: 'b01', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', moves: ['d1d8'], rating: 450, themes: ['mateIn1','backRankMate'] },
  { id: 'b15', fen: '3r2k1/5ppp/8/8/8/8/1Q3PPP/6K1 b - - 0 1', moves: ['d8d1'], rating: 450, themes: ['mateIn1','backRankMate'] },
  { id: 'b08', fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1', moves: ['h6f7'], rating: 500, themes: ['mateIn1','smotheredMate'] },
  { id: 'c04', fen: 'r4rk1/ppp2ppp/8/8/3Q4/2B5/PPP2PPP/R5K1 w - - 0 1', moves: ['d4g7'], rating: 500, themes: ['mateIn1'] },
  { id: 'c01', fen: 'r3k3/5ppp/8/1N6/8/8/5PPP/6K1 w - - 0 1', moves: ['b5c7','e8d7','c7a8'], rating: 550, themes: ['fork'] },
  { id: 'c10', fen: '6k1/5ppp/8/8/3n4/8/5PPP/R3K3 b - - 0 1', moves: ['d4c2','e1d2','c2a1'], rating: 550, themes: ['fork'] },
  { id: 'b04', fen: '2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', moves: ['d5e7','g8h8','e7c8'], rating: 600, themes: ['fork'] },
  { id: 'c05', fen: '4k3/pp1q1ppp/8/8/8/2N5/PPP2PPP/4KB2 w - - 0 1', moves: ['f1b5','a7a6','b5d7'], rating: 750, themes: ['pin'] },
]

export const LOCAL_PUZZLES: Puzzle[] = LOCAL.map((p) => ({ ...p, source: 'local' }))

export const THEME_NAMES: Record<string, string> = {
  mix: 'Variado',
  mate: 'Mate',
  mateIn1: 'Mate en 1',
  mateIn2: 'Mate en 2',
  mateIn3: 'Mate en 3',
  mateIn4: 'Mate en 4',
  mateIn5: 'Mate en 5 o más',
  backRankMate: 'Mate del pasillo',
  smotheredMate: 'Mate de la coz',
  anastasiaMate: 'Mate de Anastasia',
  arabianMate: 'Mate árabe',
  bodenMate: 'Mate de Boden',
  hookMate: 'Mate del gancho',
  doubleBishopMate: 'Mate de los dos alfiles',
  dovetailMate: 'Mate de la cola de paloma',
  fork: 'Doble ataque',
  pin: 'Clavada',
  skewer: 'Ensartada',
  hangingPiece: 'Pieza colgada',
  trappedPiece: 'Pieza atrapada',
  discoveredAttack: 'Ataque a la descubierta',
  doubleCheck: 'Jaque doble',
  promotion: 'Coronación',
  underPromotion: 'Subpromoción',
  advancedPawn: 'Peón avanzado',
  attackingF2F7: 'Ataque a f2 o f7',
  capturingDefender: 'Captura del defensor',
  deflection: 'Desviación',
  attraction: 'Atracción',
  clearance: 'Despeje',
  interference: 'Interferencia',
  intermezzo: 'Jugada intermedia',
  sacrifice: 'Sacrificio',
  quietMove: 'Jugada tranquila',
  defensiveMove: 'Jugada defensiva',
  xRayAttack: 'Ataque de rayos X',
  zugzwang: 'Zugzwang',
  exposedKing: 'Rey expuesto',
  kingsideAttack: 'Ataque en el flanco de rey',
  queensideAttack: 'Ataque en el flanco de dama',
  opening: 'Apertura',
  middlegame: 'Medio juego',
  endgame: 'Final',
  pawnEndgame: 'Final de peones',
  rookEndgame: 'Final de torres',
  bishopEndgame: 'Final de alfiles',
  knightEndgame: 'Final de caballos',
  queenEndgame: 'Final de damas',
  queenRookEndgame: 'Final de dama y torre',
  oneMove: 'Una jugada',
  short: 'Corto',
  long: 'Largo',
  veryLong: 'Muy largo',
  advantage: 'Ventaja',
  crushing: 'Ventaja decisiva',
  equality: 'Igualdad',
  castling: 'Enroque',
  enPassant: 'Captura al paso',
  master: 'Partida de maestro',
  masterVsMaster: 'Maestro contra maestro',
  superGM: 'Partida de súper GM',
}

export const themeName = (t: string) => THEME_NAMES[t] ?? t

/** Temas que se ofrecen en el selector, pensados para empezar. */
export const BEGINNER_THEMES = ['mix', 'mateIn1', 'mateIn2', 'hangingPiece', 'fork', 'pin', 'skewer', 'backRankMate', 'promotion', 'endgame']

export function localPuzzlesFor(theme: string): Puzzle[] {
  return theme === 'mix' ? LOCAL_PUZZLES : LOCAL_PUZZLES.filter((p) => p.themes.includes(theme))
}

export interface PuzzleStats {
  rating: number
  solved: number
  failed: number
  streak: number
  history: { id: string; win: boolean; rating: number }[]
}

export const INITIAL_PUZZLE_STATS: PuzzleStats = { rating: 600, solved: 0, failed: 0, streak: 0, history: [] }

/** Actualización tipo Elo. Más sensible en los primeros problemas para encontrar antes el nivel real. */
export function updateRating(stats: PuzzleStats, puzzle: Puzzle, win: boolean): PuzzleStats {
  const played = stats.solved + stats.failed
  const k = played < 20 ? 48 : 24
  const expected = 1 / (1 + 10 ** ((puzzle.rating - stats.rating) / 400))
  const rating = Math.max(100, Math.round(stats.rating + k * ((win ? 1 : 0) - expected)))
  return {
    rating,
    solved: stats.solved + (win ? 1 : 0),
    failed: stats.failed + (win ? 0 : 1),
    streak: win ? stats.streak + 1 : 0,
    history: [{ id: puzzle.id, win, rating }, ...stats.history].slice(0, 50),
  }
}
