import { Chess } from 'chess.js'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { DrawShape } from 'chessground/draw'
import type { Dests, Key } from 'chessground/types'
import { useEffect, useRef } from 'react'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'
import { isEink } from '../lib/theme'
import type { Color } from '../lib/types'

export interface Arrow {
  orig: string
  dest?: string
  brush?: 'green' | 'red' | 'blue' | 'yellow' | 'paleBlue' | 'paleGreen'
}

interface Props {
  fen: string
  orientation: Color
  /** Si se indica, ese bando puede mover piezas (solo jugadas legales). */
  movableColor?: Color
  lastMove?: [string, string]
  arrows?: Arrow[]
  onMove?: (from: string, to: string) => void
  /** Cambiar este valor fuerza a redibujar la posición aunque la FEN no cambie (por ejemplo, tras una jugada incorrecta). */
  resetKey?: number
}

export function legalDests(fen: string): Dests {
  const dests: Dests = new Map()
  for (const m of new Chess(fen).moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? []
    list.push(m.to as Key)
    dests.set(m.from as Key, list)
  }
  return dests
}

export function Board({ fen, orientation, movableColor, lastMove, arrows, onMove, resetKey }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  const initialFen = useRef(fen)
  const initialOrientation = useRef(orientation)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  useEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      fen: initialFen.current,
      orientation: initialOrientation.current,
      // En tinta electrónica, las animaciones dejan rastros y van lentas.
      animation: { enabled: !isEink(), duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      movable: { free: false, showDests: true, events: { after: (o, d) => onMoveRef.current?.(o, d) } },
    })
    const ro = new ResizeObserver(() => api.current?.redrawAll())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      api.current?.destroy()
      api.current = null
    }
  }, [])

  useEffect(() => {
    const chess = new Chess(fen)
    const turnColor: Color = chess.turn() === 'w' ? 'white' : 'black'
    api.current?.set({
      fen,
      orientation,
      turnColor,
      check: chess.inCheck(),
      lastMove: lastMove as Key[] | undefined,
      movable: {
        color: movableColor,
        dests: movableColor === turnColor ? legalDests(fen) : new Map(),
      },
      drawable: { autoShapes: (arrows ?? []) as DrawShape[] },
    })
  }, [fen, orientation, movableColor, lastMove, arrows, resetKey])

  return <div ref={el} className="board" />
}
