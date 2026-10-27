import { Chess } from 'chess.js'
import { useEffect, useState } from 'react'
import { formatEval, type PositionEval, toSpanishSan } from '../lib/analysis'
import { type EngineLine, getEngine } from '../lib/engine'

/** Evaluación de una línea del motor pasada al punto de vista de las blancas. */
export function lineToWhite(fen: string, line: Pick<EngineLine, 'cp' | 'mate' | 'move'> | undefined): PositionEval | undefined {
  if (!line) return undefined
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  return {
    cp: line.cp !== undefined ? line.cp * sign : undefined,
    mate: line.mate !== undefined ? line.mate * sign : undefined,
    best: line.move,
    pv: [],
  }
}

/**
 * Líneas candidatas de Stockfish para una posición. Espera un momento antes de pedirlas, para no
 * encolar búsquedas mientras se avanza deprisa por las jugadas.
 */
export function useEngineLines(fen: string | null, depth = 12, multipv = 3) {
  const [state, setState] = useState<{ fen: string; lines: EngineLine[]; depth: number } | null>(null)
  useEffect(() => {
    if (!fen) return
    let cancelled = false
    const timer = setTimeout(() => {
      getEngine('main')
        .evaluate(fen, depth, multipv, 'lines')
        .then((r) => {
          if (!cancelled) setState({ fen, lines: r.lines, depth: r.depth })
        })
        .catch(() => undefined)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fen, depth, multipv])
  return state && state.fen === fen ? state : null
}

/** Línea en notación española con números de jugada, por ejemplo «12... Cxe5 13. Dh5». */
export function numberedLine(fen: string, uci: string[], plies = 8): string {
  const chess = new Chess(fen)
  let n = Number(fen.split(' ')[5] ?? 1)
  const out: string[] = []
  for (const [i, u] of uci.slice(0, plies).entries()) {
    const white = chess.turn() === 'w'
    let m
    try {
      m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      break
    }
    if (white) out.push(`${n}. ${toSpanishSan(m.san)}`)
    else {
      out.push(i === 0 ? `${n}... ${toSpanishSan(m.san)}` : toSpanishSan(m.san))
      n++
    }
  }
  return out.join(' ')
}

interface Props {
  fen: string
  lines: { lines: EngineLine[]; depth: number } | null
  /** Al tocar una línea se juega su primera jugada. */
  onPlay?: (uci: string) => void
}

export function EngineLines({ fen, lines, onPlay }: Props) {
  const over = new Chess(fen).isGameOver()
  if (over) return <p className="muted small engine-lines-empty">Partida terminada en esta posición.</p>
  if (!lines) {
    return (
      <p className="muted small engine-lines-empty">
        <span className="spinner" /> Stockfish está calculando…
      </p>
    )
  }
  return (
    <div className="engine-lines">
      {lines.lines.map((l, i) => (
        <button key={i} className="engine-line" onClick={() => onPlay?.(l.move)} title="Jugar esta línea en el tablero">
          <span className="eval-chip">{formatEval(lineToWhite(fen, l))}</span>
          <span className="engine-line-moves">{numberedLine(fen, l.pv)}</span>
        </button>
      ))}
      <span className="muted small">Profundidad {lines.depth}</span>
    </div>
  )
}
