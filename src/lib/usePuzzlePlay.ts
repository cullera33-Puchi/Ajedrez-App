import { Chess } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import type { Arrow } from '../components/Board'
import type { Puzzle } from './puzzles'
import type { Color } from './types'

/**
 * Resolución de un problema en el tablero: tus jugadas, la respuesta automática del rival, pista y
 * solución. Avisa a quien lo usa del primer fallo, de si se resuelve (limpio o no) y de si se
 * rinde, para que decida qué cuenta (nivel, repaso espaciado…).
 */

export type PlayPhase = 'playing' | 'solution' | 'done'

export interface PuzzleEvents {
  onFirstMistake?: () => void
  onSolved?: (clean: boolean) => void
  onGaveUp?: () => void
  /** El problema trae una jugada imposible: quien lo usa suele pasar al siguiente. */
  onInvalid?: () => void
}

const parseUci = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

export function usePuzzlePlay(puzzle: Puzzle, events: PuzzleEvents) {
  const [fen, setFen] = useState(puzzle.fen)
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<PlayPhase>('playing')
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(puzzle.lastMove)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [resetKey, setResetKey] = useState(0)
  const [flags, setFlags] = useState({ mistake: false, hint: false })
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const ev = useRef(events)
  useEffect(() => {
    ev.current = events
  })

  const finish = (byUser: boolean) => {
    setPhase('done')
    if (byUser) ev.current.onSolved?.(!flags.mistake && !flags.hint)
  }

  // Respuesta automática del rival y reproducción de la solución.
  useEffect(() => {
    if (step >= puzzle.moves.length) return
    const opponentTurn = step % 2 === 1
    if (!(phase === 'solution' || (phase === 'playing' && opponentTurn))) return
    const timer = setTimeout(
      () => {
        const chess = new Chess(fen)
        let m
        try {
          m = chess.move(parseUci(puzzle.moves[step]))
        } catch {
          if (ev.current.onInvalid) ev.current.onInvalid()
          else finish(false)
          return
        }
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
    if (phase !== 'playing') return
    const chess = new Chess(fen)
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    // Si la solución corona en otra pieza (subpromoción), se respeta; si no, dama.
    const expectedPromo = puzzle.moves[step]?.slice(0, 4) === from + to ? puzzle.moves[step][4] : undefined
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? (expectedPromo ?? 'q') : undefined
    let played
    try {
      played = chess.move({ from, to, promotion })
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    if (played.lan === puzzle.moves[step] || chess.isCheckmate()) {
      setFen(chess.fen())
      setLastMove([from, to])
      setArrows([])
      const nextStep = step + 1
      setStep(nextStep)
      if (nextStep >= puzzle.moves.length || chess.isCheckmate()) finish(true)
      else setFeedback({ kind: 'ok', text: 'Bien. Sigue.' })
    } else {
      if (!flags.mistake) ev.current.onFirstMistake?.()
      setFlags((f) => ({ ...f, mistake: true }))
      setFeedback({ kind: 'error', text: 'Esa no es la mejor. Inténtalo otra vez.' })
      setResetKey((k) => k + 1)
    }
  }

  const hint = () => {
    if (phase !== 'playing') return
    setFlags((f) => ({ ...f, hint: true }))
    setArrows([{ orig: puzzle.moves[step].slice(0, 2), brush: 'green' }])
    setFeedback({ kind: 'info', text: 'Pista: mueve la pieza marcada.' })
  }

  const showSolution = () => {
    if (phase !== 'playing') return
    ev.current.onGaveUp?.()
    setPhase('solution')
    setFeedback({ kind: 'info', text: 'Esta es la solución.' })
  }

  const orientation: Color = puzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const userTurn = phase === 'playing' && step % 2 === 0
  return { fen, lastMove, arrows, resetKey, phase, flags, feedback, setFeedback, onMove, hint, showSolution, orientation, userTurn }
}
