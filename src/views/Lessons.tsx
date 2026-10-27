import { Chess } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import { type Arrow, Board } from '../components/Board'
import { needsPromotion, PromotionPicker } from '../components/PromotionPicker'
import { setBusy } from '../lib/activity'
import { getEngine } from '../lib/engine'
import { useBackGuard, useBackHandler } from '../lib/nav'
import { checkLesson, type Lesson, lessonColor, type LessonStatus, LESSONS, loadLessonProgress, recordLesson } from '../lib/lessons'

/** Lista de lecciones prácticas para la pantalla Aprender. */
export function LessonList({ onOpen }: { onOpen: (l: Lesson) => void }) {
  const progress = loadLessonProgress()
  return (
    <div className="lesson-list">
      {LESSONS.map((l) => {
        const p = progress[l.id]
        return (
          <button key={l.id} className={`lesson-item ${p?.done ? 'done' : ''}`} onClick={() => onOpen(l)}>
            <span className="lesson-check" aria-hidden="true">
              {p?.done ? '✓' : '○'}
            </span>
            <span className="lesson-text">
              <strong>{l.title}</strong>
              <span className="muted small">{l.summary}</span>
              {p?.best && (
                <span className="small">
                  Tu mejor marca: {p.best} jugadas{p.best <= l.par && l.goal !== 'draw' ? ', ¡de nivel!' : ''}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const ENGINE_DEPTH = 14

export function LessonPlayer({ lesson, onBack, onNext, onPlayFrom }: { lesson: Lesson; onBack: () => void; onNext?: () => void; onPlayFrom?: (fen: string) => void }) {
  const userColor = lessonColor(lesson)
  const userTurnChar = userColor === 'white' ? 'w' : 'b'
  const [chess] = useState(() => new Chess(lesson.fen))
  const [fen, setFen] = useState(lesson.fen)
  const [lastMove, setLastMove] = useState<[string, string] | undefined>()
  const [status, setStatus] = useState<LessonStatus>({ state: 'playing' })
  const [thinking, setThinking] = useState(false)
  const [userMoves, setUserMoves] = useState(0)
  const [hint, setHint] = useState<Arrow[]>([])
  const [mateIn, setMateIn] = useState<number | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [showSteps, setShowSteps] = useState(true)
  const startPieces = useRef(countPieces(new Chess(lesson.fen)))
  // Con la lección empezada, ir atrás no la abandona; si no, vuelve a la lista.
  useBackGuard(status.state === 'playing' && userMoves > 0, 'Lección en curso. Para salir, pulsa Volver a las lecciones.')
  useBackHandler(true, onBack)
  const alive = useRef(true)
  /** Se incrementa al empezar de nuevo, para descartar cálculos del motor de la ronda anterior. */
  const round = useRef(0)

  useEffect(() => {
    alive.current = true
    setBusy('lesson', true)
    return () => {
      alive.current = false
      setBusy('lesson', false)
    }
  }, [])

  /** Distancia al mate según Stockfish, para que el alumno vea si progresa. */
  const measure = async () => {
    if (lesson.goal !== 'mate') return
    const fen = chess.fen()
    try {
      const r = await getEngine('main').evaluate(fen, 12, 1, 'lesson-mate')
      if (alive.current && chess.fen() === fen) setMateIn(r.mate !== undefined && r.mate > 0 ? r.mate : null)
    } catch {
      // Sustituida por una medición más reciente.
    }
  }

  const play = (from: string, to: string, promotion?: string) => {
    let m
    try {
      m = chess.move({ from, to, promotion })
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    const n = userMoves + 1
    setUserMoves(n)
    setHint([])
    setFen(chess.fen())
    setLastMove([m.from, m.to])
    const s = checkLesson(lesson, chess, n, startPieces.current)
    setStatus(s)
    if (s.state === 'won') recordLesson(lesson.id, n)
    else if (s.state === 'playing') void engineMoveWith(n)
  }

  /** Jugada del motor; `n` son las jugadas del alumno hasta ahora. */
  const engineMoveWith = async (n: number) => {
    const myRound = round.current
    setThinking(true)
    try {
      const r = await getEngine('main').evaluate(chess.fen(), ENGINE_DEPTH)
      // Si entretanto se ha empezado de nuevo, la jugada calculada ya no vale.
      if (!alive.current || !r.best || myRound !== round.current) return
      const m = chess.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] })
      setFen(chess.fen())
      setLastMove([m.from, m.to])
      const s = checkLesson(lesson, chess, n, startPieces.current)
      setStatus(s)
      if (s.state === 'won') recordLesson(lesson.id, n)
      else if (s.state === 'playing') void measure()
    } finally {
      if (alive.current) setThinking(false)
    }
  }

  // En la lección de defensa empieza el motor.
  useEffect(() => {
    if (chess.turn() !== userTurnChar) void engineMoveWith(0)
    else void measure()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (from: string, to: string) => {
    const piece = chess.get(from as Parameters<Chess['get']>[0])
    if (needsPromotion(chess.fen(), from, to, piece?.type)) setPromo({ from, to })
    else play(from, to)
  }

  const showHint = async () => {
    const r = await getEngine('main').evaluate(chess.fen(), ENGINE_DEPTH)
    if (alive.current && r.best) setHint([{ orig: r.best.slice(0, 2), dest: r.best.slice(2, 4), brush: 'green' }])
  }

  const restart = () => {
    round.current++
    chess.load(lesson.fen)
    setFen(lesson.fen)
    setLastMove(undefined)
    setStatus({ state: 'playing' })
    setUserMoves(0)
    setHint([])
    setMateIn(null)
    setResetKey((k) => k + 1)
    if (chess.turn() !== userTurnChar) void engineMoveWith(0)
    else void measure()
  }

  const userTurn = status.state === 'playing' && !thinking && chess.turn() === userTurnChar
  const counter =
    lesson.goal === 'draw' ? `Jugadas aguantadas: ${userMoves} de ${lesson.limit}` : `Jugadas: ${userMoves} (objetivo: ${lesson.par} o menos; máximo ${lesson.limit})`

  return (
    <div className="page puzzles lesson">
      <div className="puzzle-board">
        <Board fen={fen} orientation={userColor} movableColor={userTurn ? userColor : undefined} lastMove={lastMove} arrows={hint} onMove={onMove} resetKey={resetKey} />
      </div>
      <div className="puzzle-side">
        <section className="card">
          <button className="link small" onClick={onBack}>
            Volver a las lecciones
          </button>
          <h2>{lesson.title}</h2>
          {status.state === 'playing' ? (
            <p className="msg info">
              {thinking ? (
                <>
                  <span className="spinner" /> El rival está pensando…
                </>
              ) : (
                <>
                  Te toca mover{chess.inCheck() ? ': estás en jaque' : ''}.{' '}
                  {mateIn !== null && <span className="small">Stockfish ve mate en {mateIn}.</span>}
                </>
              )}
            </p>
          ) : (
            <p className={`msg ${status.state === 'won' ? 'ok' : 'error'}`}>{status.text}</p>
          )}
          <p className="small muted">{counter}</p>
          <div className="toolbar">
            {status.state === 'playing' && (
              <button className="btn" onClick={() => void showHint()} disabled={!userTurn}>
                Pista
              </button>
            )}
            <button className="btn" onClick={restart} disabled={thinking}>
              {status.state === 'playing' ? 'Empezar de nuevo' : 'Repetir'}
            </button>
            {status.state !== 'playing' && onPlayFrom && (
              <button className="btn" onClick={() => onPlayFrom(lesson.fen)}>
                Practicar contra un bot
              </button>
            )}
            {status.state === 'won' && onNext && (
              <button className="btn primary" onClick={onNext}>
                Siguiente lección
              </button>
            )}
          </div>
        </section>
        <section className="card">
          <button className="lesson-steps-head" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
            <h3>Cómo se hace</h3>
            <span>{showSteps ? '▴' : '▾'}</span>
          </button>
          {showSteps && (
            <ol className="rules">
              {lesson.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {promo && (
        <PromotionPicker
          color={userColor}
          onCancel={() => {
            setPromo(null)
            setResetKey((k) => k + 1)
          }}
          onPick={(p) => {
            const { from, to } = promo
            setPromo(null)
            play(from, to, p)
          }}
        />
      )}
    </div>
  )
}

function countPieces(c: Chess) {
  const out = { w: 0, b: 0 }
  for (const p of c.board().flat()) if (p && p.type !== 'k') out[p.color]++
  return out
}
