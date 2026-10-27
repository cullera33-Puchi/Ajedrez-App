import type { ReactNode } from 'react'
import { type PlayPhase, type PuzzleEvents, usePuzzlePlay } from '../lib/usePuzzlePlay'
import type { Puzzle } from '../lib/puzzles'
import { Board } from './Board'

interface Props {
  puzzle: Puzzle
  /** Texto antes de la primera jugada. */
  intro: string
  /** Texto al resolverlo, según si ha sido limpio (sin fallos ni pista). */
  solvedText: (clean: boolean, flags: { mistake: boolean; hint: boolean }) => string
  events: PuzzleEvents
  /** Clase extra de la página (la base es la de Problemas). */
  className?: string
  /** Dentro de la tarjeta del problema, antes del mensaje. */
  header?: ReactNode
  /** Botones según la fase, además de Pista y Ver solución mientras se juega. */
  actions: (phase: PlayPhase) => ReactNode
  /** Dentro de la tarjeta, al final. */
  footer?: (phase: PlayPhase) => ReactNode
  /** Tarjetas de la columna lateral antes y después de la del problema. */
  before?: ReactNode
  after?: ReactNode
}

/**
 * Tablero y tarjeta de un problema: lo usan Problemas y el entrenamiento de hoy. Montarlo con
 * `key={puzzle.id}` para que cada problema empiece de cero.
 */
export function PuzzleSolver({ puzzle, intro, solvedText, events, className = '', header, actions, footer, before, after }: Props) {
  const play = usePuzzlePlay(puzzle, {
    ...events,
    onSolved: (clean) => {
      events.onSolved?.(clean)
      play.setFeedback({ kind: 'ok', text: solvedText(clean, play.flags) })
    },
  })
  const feedback = play.feedback ?? { kind: 'info' as const, text: intro }
  return (
    <div className={`page puzzles ${className}`}>
      <div className="puzzle-board">
        <Board
          fen={play.fen}
          orientation={play.orientation}
          movableColor={play.userTurn ? play.orientation : undefined}
          lastMove={play.lastMove}
          arrows={play.arrows}
          onMove={play.onMove}
          resetKey={play.resetKey}
        />
      </div>
      <div className="puzzle-side">
        {before}
        <section className="card puzzle-main">
          {header}
          <p className={`msg ${feedback.kind}`}>{feedback.text}</p>
          <div className="toolbar">
            {play.phase === 'playing' && (
              <>
                <button className="btn" onClick={play.hint} disabled={play.flags.hint}>
                  Pista
                </button>
                <button className="btn" onClick={play.showSolution}>
                  Ver solución
                </button>
              </>
            )}
            {actions(play.phase)}
          </div>
          {footer?.(play.phase)}
        </section>
        {after}
      </div>
    </div>
  )
}
