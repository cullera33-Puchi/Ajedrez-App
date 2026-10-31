import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PuzzleSolver } from '../components/PuzzleSolver'
import { ResourceLinks } from '../components/ResourceLinks'
import { type Difficulty, fetchLichessPuzzle } from '../lib/lichess'
import {
  BEGINNER_THEMES,
  MY_ERRORS,
  INITIAL_PUZZLE_STATS,
  LOCAL_PUZZLES,
  type Puzzle,
  type PuzzleStats,
  themeName,
  updateRating,
} from '../lib/puzzles'
import { getGames } from '../lib/games'
import { loadPack, offlinePuzzles, packSize, pickNear } from '../lib/puzzlePack'
import { recommendThemes } from '../lib/recommend'
import { allMyPuzzles, duePuzzles, type MyPuzzle, recordResult, toPuzzle } from '../lib/myPuzzles'
import { loadLog, logAttempt } from '../lib/puzzleLog'
import { PuzzleProgress } from '../components/PuzzleProgress'
import { load, usePersistentState } from '../lib/storage'

type Phase = 'loading' | 'ready' | 'empty'
type PuzzleSource = 'local' | 'lichess' | 'mine'

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easiest', label: 'Muy fácil' },
  { value: 'easier', label: 'Fácil' },
  { value: 'normal', label: 'Normal' },
]

export function PuzzlesView({ initialTheme }: { initialTheme: string }) {
  const [stats, setStats] = usePersistentState<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS)
  const [storedSource, setSource] = usePersistentState<PuzzleSource>('puzzleSource', 'local')
  const [forceMine, setForceMine] = useState(initialTheme === MY_ERRORS)
  const source: PuzzleSource = forceMine && storedSource !== 'mine' ? 'mine' : storedSource
  const [difficulty, setDifficulty] = usePersistentState<Difficulty>('puzzleDifficulty', 'easiest')
  const [theme, setTheme] = useState(initialTheme === MY_ERRORS ? 'mix' : initialTheme)
  const [mine, setMine] = useState<MyPuzzle | null>(null)
  const [dueCount, setDueCount] = useState(() => duePuzzles().length)
  const [log, setLog] = useState(loadLog)
  const [packCount, setPackCount] = useState(packSize)

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  // Cada problema cuenta una sola vez para el nivel (o para el repaso, si es uno de tus errores).
  const rated = useRef(false)
  // Tus errores saltados en esta sesión: si no, «Saltar» volvería a mostrar el mismo.
  const skipped = useRef(new Set<string>())
  // Solo se aplica la respuesta de la última petición (al cambiar rápido de tema o de origen).
  const request = useRef(0)
  // Cada problema monta el tablero de cero, aunque se repita el mismo.
  const [round, setRound] = useState(0)
  const recommendation = useMemo(() => recommendThemes(getGames()), [])

  const begin = (p: Puzzle, own: MyPuzzle | null = null) => {
    rated.current = false
    setRound((r) => r + 1)
    setMine(own)
    setPuzzle(p)
    setPhase('ready')
  }

  const pickLocal = useCallback(
    (t: string): Puzzle => {
      const pool = offlinePuzzles(t).length ? offlinePuzzles(t) : offlinePuzzles('mix')
      // Se evitan los resueltos y los vistos hace poco (incluido el actual).
      const avoid = new Set([...stats.history.map((h) => h.id), ...(puzzle ? [puzzle.id] : [])])
      return pickNear(pool, stats.rating, avoid) ?? LOCAL_PUZZLES[0]
    },
    [stats, puzzle],
  )

  const next = useCallback(
    async (t = theme, src = source) => {
      const id = ++request.current
      const current = () => id === request.current
      setPhase('loading')
      setNotice(null)
      if (src === 'mine') {
        const due = duePuzzles()
        setDueCount(due.length)
        if (!due.length) {
          setPuzzle(null)
          setMine(null)
          setPhase('empty')
          return
        }
        const pick = due.find((p) => !skipped.current.has(p.id)) ?? due[0]
        begin(toPuzzle(pick), pick)
        return
      }
      if (src === 'local') {
        await loadPack()
        if (!current()) return
        setPackCount(packSize())
      }
      // Si los problemas sin conexión casi no tienen ese tema, se usan los de Lichess.
      const sparse = src === 'local' && t !== 'mix' && offlinePuzzles(t).length < 3 && navigator.onLine
      if (sparse) setNotice(`Hay pocos problemas de ${themeName(t).toLowerCase()} sin conexión: se usan los de Lichess.`)
      if (src === 'lichess' || sparse) {
        try {
          const p = await fetchLichessPuzzle(t, difficulty)
          if (current()) begin(p)
          return
        } catch (e) {
          if (!current()) return
          setNotice(`${(e as Error).message} Se usa el set de iniciación.`)
        }
      }
      begin(pickLocal(t))
    },
    [theme, source, difficulty, pickLocal],
  )

  useEffect(() => {
    void next()
    // Primer problema al entrar.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rate = (win: boolean) => {
    if (!puzzle || rated.current) return
    rated.current = true
    // Los problemas de tus errores no cambian tu nivel: solo deciden cuándo vuelven a salir.
    if (puzzle.source === 'mine') {
      void recordResult(puzzle.id, win).then(() => setDueCount(duePuzzles().length))
      logAttempt({ t: Date.now(), win, source: 'mine', difficulty: null, prev: null, rating: null })
    } else {
      // Se parte de lo guardado, que puede traer lo sincronizado desde otro dispositivo con la pantalla abierta.
      const base = load<PuzzleStats>('puzzleStats', stats)
      const updated = updateRating(base, puzzle, win)
      setStats(updated)
      logAttempt({ t: Date.now(), win, source: puzzle.source, difficulty: puzzle.rating || null, prev: base.rating, rating: updated.rating })
    }
    setLog(loadLog())
  }

  const changeTheme = (t: string) => {
    setTheme(t)
    void next(t)
  }
  const changeSource = (s: PuzzleSource) => {
    setForceMine(false)
    setSource(s)
    void next(theme, s)
  }

  const side = puzzle?.fen.split(' ')[1] === 'w' ? 'blancas' : 'negras'
  const intro = mine
    ? `Posición de tu partida contra ${mine.opponent}. Juegan las ${side}: encuentra la jugada que se te escapó.`
    : `Juegan las ${side}. Encuentra la mejor jugada.`
  const solvedText = (clean: boolean, flags: { mistake: boolean; hint: boolean }) => {
    if (mine)
      return `${clean ? '¡Bien visto!' : 'Resuelto.'} En la partida jugaste ${mine.playedSan}; lo mejor era ${mine.bestSan}. ${clean ? 'Volverá dentro de unos días para repasarlo.' : 'Volverá a salir pronto.'}`
    if (clean) return '¡Correcto! Problema resuelto.'
    return flags.mistake ? 'Resuelto, aunque con algún fallo.' : 'Resuelto con pista. No cuenta para tu nivel.'
  }

  const statsCard = (
    <section className="card">
      <h2>Problemas</h2>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{stats.rating}</span>
          <span className="kpi-label">Tu nivel</span>
        </div>
        <div className="kpi good">
          <span className="kpi-value">{stats.streak}</span>
          <span className="kpi-label">Racha</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">
            {stats.solved}/{stats.solved + stats.failed}
          </span>
          <span className="kpi-label">Acertados</span>
        </div>
      </div>
      <div className="history">
        {stats.history.slice(0, 15).map((h, i) => (
          <span key={i} className={`dot ${h.win ? 'win' : 'loss'}`} title={h.win ? 'Acertado' : 'Fallado'} />
        ))}
      </div>
      <a className="small" href="#evolucion" onClick={(e) => (e.preventDefault(), document.getElementById('evolucion')?.scrollIntoView({ behavior: 'smooth' }))}>
        Ver tu evolución
      </a>
    </section>
  )

  const otherCards = (
    <>
      <section className="card">
        <h3>Recomendado para ti</h3>
        {recommendation.themes.length ? (
          <>
            <p className="muted small">
              Según los errores de {recommendation.games === 1 ? 'tu última partida analizada' : `tus últimas ${recommendation.games} partidas analizadas`}:
            </p>
            <div className="reco">
              {recommendation.themes.slice(0, 4).map((t) => (
                <button key={t.theme} className={`reco-item ${theme === t.theme ? 'active' : ''}`} onClick={() => changeTheme(t.theme)}>
                  <span>{themeName(t.theme)}</span>
                  <span className="muted small">
                    {t.count} {t.count === 1 ? 'error' : 'errores'}
                  </span>
                </button>
              ))}
            </div>
            <ResourceLinks theme={recommendation.themes.some((t) => t.theme === theme) ? theme : recommendation.themes[0].theme} />
          </>
        ) : (
          <p className="muted small">Importa y analiza algunas partidas tuyas y te diré qué temas practicar según tus errores.</p>
        )}
      </section>

      <PuzzleProgress log={log} rating={stats.rating} />

      <section className="card">
        <h3>Opciones</h3>
        <label className="field">
          <span>Origen</span>
          <select value={source} onChange={(e) => changeSource(e.target.value as PuzzleSource)}>
            <option value="mine">Mis errores ({dueCount} pendientes hoy)</option>
            <option value="local">Sin conexión ({LOCAL_PUZZLES.length + packCount} problemas de tu nivel)</option>
            <option value="lichess">Lichess (millones de problemas, requiere conexión)</option>
          </select>
        </label>
        <label className="field" hidden={source === 'mine'}>
          <span>Tema</span>
          <select value={theme} onChange={(e) => changeTheme(e.target.value)}>
            {BEGINNER_THEMES.map((t) => (
              <option key={t} value={t}>
                {themeName(t)}
              </option>
            ))}
          </select>
        </label>
        {source === 'lichess' && (
          <label className="field">
            <span>Dificultad</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
    </>
  )

  // Mientras carga el siguiente se sigue viendo el anterior.
  if (puzzle && phase !== 'empty')
    return (
      <PuzzleSolver
        key={`${puzzle.id}-${round}`}
        puzzle={puzzle}
        intro={intro}
        solvedText={solvedText}
        events={{
          onFirstMistake: () => rate(false),
          // Con pista no cuenta para el nivel; en tus errores, decide cuándo vuelve a salir.
          onSolved: (clean) => {
            if (mine || clean) rate(clean)
            else rated.current = true
          },
          onGaveUp: () => rate(false),
          onInvalid: () => void next(),
        }}
        header={notice && <p className="msg info small">{notice}</p>}
        actions={(p) =>
          (p === 'done' || p === 'playing') && (
            <button
              className={`btn ${p === 'done' ? 'primary' : ''}`}
              onClick={() => {
                if (p === 'playing' && mine) skipped.current.add(mine.id)
                void next()
              }}
            >
              {p === 'done' ? 'Siguiente problema' : 'Saltar'}
            </button>
          )
        }
        footer={(p) =>
          p === 'done' && (
            <div className="puzzle-info">
              {puzzle.rating > 0 && (
                <p className="small">
                  Dificultad del problema: <strong>{puzzle.rating}</strong>
                </p>
              )}
              <div className="chips">
                {puzzle.themes.map((t) => (
                  <span key={t} className="chip static">
                    {themeName(t)}
                  </span>
                ))}
              </div>
              {puzzle.url && (
                <a className="small" href={puzzle.url} target="_blank" rel="noreferrer">
                  Ver en Lichess
                </a>
              )}
            </div>
          )
        }
        before={statsCard}
        after={otherCards}
      />
    )

  return (
    <div className="page puzzles">
      <div className="puzzle-board">
        <div className="board placeholder">{phase === 'empty' ? 'Sin errores pendientes' : 'Cargando problema…'}</div>
      </div>
      <div className="puzzle-side">
        {statsCard}
        <section className="card">
          {phase === 'empty' && (
            <div className="msg info">
              <p>
                No tienes errores pendientes de repasar.{' '}
                {allMyPuzzles().length
                  ? 'Los que ya acertaste volverán en unos días.'
                  : 'Cuando se analicen tus partidas, aquí aparecerán las posiciones donde fallaste.'}
              </p>
              <button className="btn small" onClick={() => changeSource('local')}>
                Ir a otros problemas
              </button>
            </div>
          )}
          {notice && <p className="msg info small">{notice}</p>}
        </section>
        {otherCards}
      </div>
    </div>
  )
}
