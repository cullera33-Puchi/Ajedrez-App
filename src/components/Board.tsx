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
  /** `premove` indica que la jugada estaba preparada de antemano y se ha hecho al llegar el turno. */
  onMove?: (from: string, to: string, premove?: boolean) => void
  /** Deja preparar una jugada mientras juega el rival (se hace sola si sigue siendo legal). */
  premove?: boolean
  /** Cambiar este valor fuerza a redibujar la posición aunque la FEN no cambie (por ejemplo, tras una jugada incorrecta). */
  resetKey?: number
  /** Toque en cualquier casilla (para los ejercicios de visión del tablero). */
  onSelect?: (square: string) => void
  /** Letras y números del borde (se fija al crear el tablero). */
  coordinates?: boolean
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

export function Board({ fen, orientation, movableColor, lastMove, arrows, onMove, resetKey, onSelect, coordinates = true, premove = false }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  const onSelectRef = useRef(onSelect)
  const initialFen = useRef(fen)
  const initialOrientation = useRef(orientation)
  const initialCoordinates = useRef(coordinates)
  useEffect(() => {
    onMoveRef.current = onMove
    onSelectRef.current = onSelect
  }, [onMove, onSelect])

  useEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      fen: initialFen.current,
      orientation: initialOrientation.current,
      // En tinta electrónica, las animaciones dejan rastros y van lentas.
      animation: { enabled: !isEink(), duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      coordinates: initialCoordinates.current,
      movable: { free: false, showDests: true, events: { after: (o, d, meta) => onMoveRef.current?.(o, d, meta.premove) } },
      events: { select: (key) => onSelectRef.current?.(key) },
    })
    // Se redibuja en el siguiente fotograma y solo si cambia el tamaño: redibujar dentro del aviso
    // provoca otro aviso y el navegador se queja de un bucle («ResizeObserver loop…»).
    let frame = 0
    let size = ''
    const ro = new ResizeObserver(([entry]) => {
      const next = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`
      if (next === size) return
      size = next
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => api.current?.redrawAll())
    })
    ro.observe(el.current)
    return () => {
      cancelAnimationFrame(frame)
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
      premovable: { enabled: premove },
      drawable: { autoShapes: (arrows ?? []) as DrawShape[] },
    })
    // Jugada preparada: se hace al llegar el turno; si ya no se puede mover, se descarta.
    if (!movableColor) api.current?.cancelPremove()
    else if (premove && movableColor === turnColor) api.current?.playPremove()
  }, [fen, orientation, movableColor, lastMove, arrows, resetKey, premove])

  return <div ref={el} className="board" />
}
