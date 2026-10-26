import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Arrow, Board } from '../components/Board'
import { type Difficulty, fetchLichessPuzzle } from '../lib/lichess'
import {
  BEGINNER_THEMES,
  INITIAL_PUZZLE_STATS,
  localPuzzlesFor,
  LOCAL_PUZZLES,
  type Puzzle,
  type PuzzleStats,
  themeName,
  updateRating,
} from '../lib/puzzles'
import { loadGames } from '../lib/games'
import { recommendThemes } from '../lib/recommend'
import { usePersistentState } from '../lib/storage'
import type { Color } from '../lib/types'

type Phase = 'loading' | 'playing' | 'solution' | 'done' | 'error'
type PuzzleSource = 'local' | 'lichess'

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easiest', label: 'Muy fácil' },
  { value: 'easier', label: 'Fácil' },
  { value: 'normal', label: 'Normal' },
]

const parseUci = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

export function PuzzlesView({ initialTheme }: { initialTheme: string }) {
  const [stats, setStats] = usePersistentState<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS)
  const [source, setSource] = usePersistentState<PuzzleSource>('puzzleSource', 'local')
  const [difficulty, setDifficulty] = usePersistentState<Difficulty>('puzzleDifficulty', 'easiest')
  const [theme, setTheme] = useState(initialTheme)

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [fen, setFen] = useState('')
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [lastMove, setLastMove] = useState<[string, string] | undefined>()
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [flags, setFlags] = useState({ mistake: false, hint: false, rated: false })
  const [notice, setNotice] = useState<string | null>(null)
  const recommendation = useMemo(() => recommendThemes(loadGames()), [])

  const begin = (p: Puzzle) => {
    setPuzzle(p)
    setFen(p.fen)
    setStep(0)
    setLastMove(p.lastMove)
    setArrows([])
    setFlags({ mistake: false, hint: false, rated: false })
    setPhase('playing')
    setFeedback({ kind: 'info', text: `Juegan las ${p.fen.split(' ')[1] === 'w' ? 'blancas' : 'negras'}. Encuentra la mejor jugada.` })
  }

  const pickLocal = useCallback(
    (t: string): Puzzle => {
      const pool = localPuzzlesFor(t).length ? localPuzzlesFor(t) : LOCAL_PUZZLES
      const solved = new Set(stats.history.filter((h) => h.win).map((h) => h.id))
      const pending = pool.filter((p) => !solved.has(p.id) && p.id !== puzzle?.id)
      const candidates = pending.length ? pending : pool.filter((p) => p.id !== puzzle?.id)
      const list = candidates.length ? candidates : pool
      // El más cercano al nivel del usuario.
      return [...list].sort((a, b) => Math.abs(a.rating - stats.rating) - Math.abs(b.rating - stats.rating))[0]
    },
    [stats, puzzle],
  )

  const next = useCallback(
    async (t = theme, src = source) => {
      setPhase('loading')
      setNotice(null)
      // Si el set sin conexión casi no tiene problemas de ese tema, se usan los de Lichess.
      const sparse = src === 'local' && t !== 'mix' && localPuzzlesFor(t).length < 3 && navigator.onLine
      if (sparse) setNotice(`Hay pocos problemas de ${themeName(t).toLowerCase()} sin conexión: se usan los de Lichess.`)
      if (src === 'lichess' || sparse) {
        try {
          begin(await fetchLichessPuzzle(t, difficulty))
          return
        } catch (e) {
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
    if (!puzzle || flags.rated) return
    setStats((s) => updateRating(s, puzzle, win))
    setFlags((f) => ({ ...f, rated: true }))
  }

  const finish = (byUser: boolean) => {
    setPhase('done')
    if (!byUser) return
    if (!flags.mistake && !flags.hint) {
      rate(true)
      setFeedback({ kind: 'ok', text: '¡Correcto! Problema resuelto.' })
    } else {
      setFeedback({ kind: 'ok', text: flags.mistake ? 'Resuelto, aunque con algún fallo.' : 'Resuelto con pista. No cuenta para tu nivel.' })
      setFlags((f) => ({ ...f, rated: true }))
    }
  }

  // Respuesta automática del rival y reproducción de la solución.
  useEffect(() => {
    if (!puzzle || step >= puzzle.moves.length) return
    const opponentTurn = step % 2 === 1
    if (!(phase === 'solution' || (phase === 'playing' && opponentTurn))) return
    const timer = setTimeout(
      () => {
        const chess = new Chess(fen)
        const m = chess.move(parseUci(puzzle.moves[step]))
        setFen(chess.fen())
        setLastMove([m.from, m.to])
        setArrows(phase === 'solution' ? [{ orig: m.from, dest: m.to, brush: 'green' }] : [])
        const nextStep = step + 1
        setStep(nextStep)
        if (nextStep >= puzzle.moves.length) finish(phase === 'playing')
      },
      phase === 'solution' ? 800 : 450,
    )
    return () => clearTimeout(timer)
  }, [puzzle, step, phase, fen, flags]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (from: string, to: string) => {
    if (!puzzle || phase !== 'playing') return
    const chess = new Chess(fen)
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
    let played
    try {
      played = chess.move({ from, to, promotion })
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    const expected = puzzle.moves[step]
    if (played.lan === expected || chess.isCheckmate()) {
      setFen(chess.fen())
      setLastMove([from, to])
      setArrows([])
      const nextStep = step + 1
      setStep(nextStep)
      if (nextStep >= puzzle.moves.length || chess.isCheckmate()) finish(true)
      else setFeedback({ kind: 'ok', text: 'Bien. Sigue.' })
    } else {
      if (!flags.rated && !flags.mistake) rate(false)
      setFlags((f) => ({ ...f, mistake: true }))
      setFeedback({ kind: 'error', text: 'Esa no es la mejor. Inténtalo otra vez.' })
      setResetKey((k) => k + 1)
    }
  }

  const hint = () => {
    if (!puzzle || phase !== 'playing') return
    setFlags((f) => ({ ...f, hint: true }))
    setArrows([{ orig: puzzle.moves[step].slice(0, 2), brush: 'green' }])
    setFeedback({ kind: 'info', text: 'Pista: mueve la pieza marcada.' })
  }

  const showSolution = () => {
    if (!puzzle || phase !== 'playing') return
    if (!flags.rated) rate(false)
    setPhase('solution')
    setFeedback({ kind: 'info', text: 'Esta es la solución.' })
  }

  const changeTheme = (t: string) => {
    setTheme(t)
    void next(t)
  }
  const changeSource = (s: PuzzleSource) => {
    setSource(s)
    void next(theme, s)
  }

  const orientation: Color = puzzle?.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const userTurn = phase === 'playing' && step % 2 === 0

  return (
    <div className="page puzzles">
      <div className="puzzle-board">
        {puzzle ? (
          <Board
            fen={fen}
            orientation={orientation}
            movableColor={userTurn ? orientation : undefined}
            lastMove={lastMove}
            arrows={arrows}
            onMove={onMove}
            resetKey={resetKey}
          />
        ) : (
          <div className="board placeholder">Cargando problema…</div>
        )}
      </div>
      <div className="puzzle-side">
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
        </section>

        <section className="card">
          {feedback && <p className={`msg ${feedback.kind}`}>{feedback.text}</p>}
          {notice && <p className="msg info small">{notice}</p>}
          <div className="toolbar">
            {phase === 'playing' && (
              <>
                <button className="btn" onClick={hint} disabled={flags.hint}>
                  Pista
                </button>
                <button className="btn" onClick={showSolution}>
                  Ver solución
                </button>
              </>
            )}
            {(phase === 'done' || phase === 'playing') && (
              <button className={`btn ${phase === 'done' ? 'primary' : ''}`} onClick={() => next()}>
                {phase === 'done' ? 'Siguiente problema' : 'Saltar'}
              </button>
            )}
          </div>
          {phase === 'done' && puzzle && (
            <div className="puzzle-info">
              <p className="small">
                Dificultad del problema: <strong>{puzzle.rating}</strong>
              </p>
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
          )}
        </section>

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
            </>
          ) : (
            <p className="muted small">Importa y analiza algunas partidas tuyas y te diré qué temas practicar según tus errores.</p>
          )}
        </section>

        <section className="card">
          <h3>Opciones</h3>
          <label className="field">
            <span>Origen</span>
            <select value={source} onChange={(e) => changeSource(e.target.value as PuzzleSource)}>
              <option value="local">Set de iniciación ({LOCAL_PUZZLES.length} problemas, sin conexión)</option>
              <option value="lichess">Lichess (millones de problemas, requiere conexión)</option>
            </select>
          </label>
          <label className="field">
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
      </div>
    </div>
  )
}
