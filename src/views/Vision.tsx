import { useEffect, useRef, useState } from 'react'
import { type Arrow, Board } from '../components/Board'
import { useBackHandler } from '../lib/nav'
import { loadPack, offlinePuzzles } from '../lib/puzzlePack'
import type { Color } from '../lib/types'
import { checkHanging, COORDS_SECONDS, HANGING_ROUND, type HangingPosition, hangingPositions, loadVisionBest, randomSquare, recordVision, type VisionBest } from '../lib/vision'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Tarjeta de Aprender con los dos ejercicios y tus mejores marcas. */
export function VisionCard({ onOpen }: { onOpen: (kind: keyof VisionBest) => void }) {
  const best = loadVisionBest()
  return (
    <div className="lesson-list">
      <button className="lesson-item" onClick={() => onOpen('coords')}>
        <span className="lesson-text">
          <strong>Coordenadas</strong>
          <span className="muted small">Toca la casilla que se pide. Tienes {COORDS_SECONDS} segundos.</span>
          {best.coords > 0 && <span className="small">Tu mejor marca: {best.coords} casillas</span>}
        </span>
      </button>
      <button className="lesson-item" onClick={() => onOpen('hanging')}>
        <span className="lesson-text">
          <strong>Piezas colgadas</strong>
          <span className="muted small">Marca las piezas del rival que puedes ganar. {HANGING_ROUND} posiciones.</span>
          {best.hanging > 0 && (
            <span className="small">
              Tu mejor marca: {best.hanging} de {HANGING_ROUND}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

interface DrillProps {
  kind: keyof VisionBest
  onBack: () => void
  backLabel?: string
}

export function VisionDrill({ kind, onBack, backLabel = 'Volver a Aprender' }: DrillProps) {
  useBackHandler(true, onBack)
  const back = (
    <button className="link small" onClick={onBack}>
      {backLabel}
    </button>
  )
  return kind === 'coords' ? <CoordsDrill back={back} /> : <HangingDrill back={back} />
}

// ---------------------------------------------------------------------------
// Coordenadas

function CoordsDrill({ back }: { back: React.ReactNode }) {
  const [color, setColor] = useState<Color>('white')
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready')
  const [target, setTarget] = useState(() => randomSquare())
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState(0)
  const [left, setLeft] = useState(COORDS_SECONDS)
  const [flash, setFlash] = useState<Arrow[]>([])
  const [record, setRecord] = useState(false)
  const scoreRef = useRef(0)

  useEffect(() => {
    if (phase !== 'playing') return
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (phase === 'playing' && left === 0) {
      setPhase('done')
      setRecord(recordVision('coords', scoreRef.current))
    }
  }, [left, phase])

  const start = () => {
    scoreRef.current = 0
    setScore(0)
    setMisses(0)
    setLeft(COORDS_SECONDS)
    setTarget(randomSquare())
    setFlash([])
    setRecord(false)
    setPhase('playing')
  }

  const tap = (sq: string) => {
    if (phase !== 'playing') return
    if (sq === target) {
      scoreRef.current++
      setScore(scoreRef.current)
      setTarget(randomSquare(target))
      setFlash([{ orig: sq, brush: 'green' }])
    } else {
      setMisses((m) => m + 1)
      setFlash([{ orig: sq, brush: 'red' }])
    }
  }

  return (
    <div className="page puzzles vision">
      <div className="puzzle-board">
        <Board key={color} fen={START} orientation={color} arrows={flash} onSelect={tap} coordinates={false} />
      </div>
      <div className="puzzle-side">
        <section className="card">
          {back}
          <h2>Coordenadas</h2>
          {phase === 'ready' && (
            <>
              <p className="muted">Toca en el tablero la casilla que se pide. El tablero no tiene letras ni números: tienes {COORDS_SECONDS} segundos.</p>
              <div className="segmented" role="radiogroup" aria-label="Lado">
                {(['white', 'black'] as Color[]).map((c) => (
                  <button key={c} role="radio" aria-checked={color === c} className={color === c ? 'active' : ''} onClick={() => setColor(c)}>
                    Desde {c === 'white' ? 'blancas' : 'negras'}
                  </button>
                ))}
              </div>
              <button className="btn primary" onClick={start}>
                Empezar
              </button>
            </>
          )}
          {phase === 'playing' && (
            <>
              <p className="vision-target" aria-live="polite">
                {target}
              </p>
              <p className="small">
                Aciertos: <strong>{score}</strong>. Fallos: {misses}. Quedan {left} s.
              </p>
            </>
          )}
          {phase === 'done' && (
            <>
              <p className="msg ok">
                Has encontrado {score} {score === 1 ? 'casilla' : 'casillas'} con {misses} {misses === 1 ? 'fallo' : 'fallos'}.{' '}
                {record ? '¡Nuevo récord!' : `Tu mejor marca: ${loadVisionBest().coords}.`}
              </p>
              <button className="btn primary" onClick={start}>
                Otra vez
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Piezas colgadas

function HangingDrill({ back }: { back: React.ReactNode }) {
  const [positions, setPositions] = useState<HangingPosition[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [marked, setMarked] = useState<string[]>([])
  const [checked, setChecked] = useState<ReturnType<typeof checkHanging> | null>(null)
  const [perfect, setPerfect] = useState(0)
  const [record, setRecord] = useState(false)

  const newRound = () => {
    void loadPack().then(() => {
      setPositions(hangingPositions(offlinePuzzles('mix')))
      setIdx(0)
      setMarked([])
      setChecked(null)
      setPerfect(0)
      setRecord(false)
    })
  }
  useEffect(newRound, [])

  if (!positions) return <p className="muted page">Preparando posiciones…</p>
  const done = idx >= positions.length
  const pos = positions[Math.min(idx, positions.length - 1)]
  const side = pos?.fen.split(' ')[1] === 'b' ? 'black' : 'white'

  const tap = (sq: string) => {
    if (checked || done) return
    setMarked((m) => (m.includes(sq) ? m.filter((x) => x !== sq) : [...m, sq]))
  }
  const check = () => {
    const r = checkHanging(pos, marked)
    setChecked(r)
    if (r.perfect) setPerfect((p) => p + 1)
  }
  const next = () => {
    const n = idx + 1
    setIdx(n)
    setMarked([])
    setChecked(null)
    if (n >= positions.length) setRecord(recordVision('hanging', perfect))
  }

  const arrows: Arrow[] = checked
    ? [
        ...checked.hits.map((s) => ({ orig: s, brush: 'green' as const })),
        ...checked.wrong.map((s) => ({ orig: s, brush: 'red' as const })),
        ...checked.missed.map((s) => ({ orig: s, brush: 'yellow' as const })),
        ...pos.targets.map((t) => ({ orig: t.by.from, dest: t.square, brush: 'paleGreen' as const })),
      ]
    : marked.map((s) => ({ orig: s, brush: 'blue' as const }))

  return (
    <div className="page puzzles vision">
      <div className="puzzle-board">{pos ? <Board key={idx} fen={pos.fen} orientation={side} arrows={arrows} onSelect={tap} /> : <div className="board placeholder">Sin posiciones</div>}</div>
      <div className="puzzle-side">
        <section className="card">
          {back}
          <h2>Piezas colgadas</h2>
          {!positions.length && <p className="msg info">No hay posiciones disponibles sin conexión. Vuelve a intentarlo con conexión.</p>}
          {!done && pos && (
            <>
              <p className="muted small">
                Posición {idx + 1} de {positions.length}. Juegan las {side === 'white' ? 'blancas' : 'negras'}.
              </p>
              {!checked ? (
                <p className="msg info">Toca las piezas del rival que puedes ganar con una captura (gratis o a cambio de una pieza de menos valor). Después, pulsa Comprobar.</p>
              ) : (
                <p className={`msg ${checked.perfect ? 'ok' : 'error'}`}>
                  {checked.perfect
                    ? '¡Exacto!'
                    : `${checked.hits.length ? `Has visto ${checked.hits.length}. ` : ''}${checked.missed.length ? `Se te ${checked.missed.length === 1 ? 'ha escapado 1 (en amarillo)' : `han escapado ${checked.missed.length} (en amarillo)`}. ` : ''}${checked.wrong.length ? `${checked.wrong.length === 1 ? 'La marcada en rojo no se gana' : `Las ${checked.wrong.length} marcadas en rojo no se ganan`}.` : ''}`}{' '}
                  Las flechas muestran con qué pieza se captura.
                </p>
              )}
              <div className="toolbar">
                {!checked ? (
                  <button className="btn primary" onClick={check}>
                    Comprobar
                  </button>
                ) : (
                  <button className="btn primary" onClick={next}>
                    {idx + 1 < positions.length ? 'Siguiente posición' : 'Ver resultado'}
                  </button>
                )}
              </div>
            </>
          )}
          {done && positions.length > 0 && (
            <>
              <p className="msg ok">
                Has acertado del todo {perfect} de {positions.length} posiciones. {record ? '¡Nuevo récord!' : `Tu mejor marca: ${loadVisionBest().hanging} de ${HANGING_ROUND}.`}
              </p>
              <button className="btn primary" onClick={newRound}>
                Otra ronda
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
