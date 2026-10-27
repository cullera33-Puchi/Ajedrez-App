import { Chess, validateFen } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import { CLAUDE_AI_URL, copyText } from '../lib/coach'
import {
  type BoardRect,
  boardToFen,
  fenToBoard,
  type Img,
  learnedCount,
  learnFromCorrection,
  type PieceCode,
  piecesToBoard,
  readBoard,
  scanImage,
  type ScanResult,
} from '../lib/scan/scan'
import type { GameSummary } from '../lib/types'

interface Props {
  onAnalyze: (game: GameSummary) => void
  onBack: () => void
  onPlay: (fen: string) => void
}

type Board = (PieceCode | null)[]
type Tool = PieceCode | 'borrar'

const MAX_SIDE = 1400
const PIECE_CLASS: Record<string, string> = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' }
const PALETTE: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const CLAUDE_FEN_PROMPT =
  'Te adjunto una imagen con una posición de ajedrez. Devuélveme solo la FEN completa en una línea, sin explicaciones. Si no se ve a quién le toca mover, pon que juegan las blancas.'

/** Carga una imagen, la reduce si es muy grande y devuelve sus píxeles. */
async function loadImage(file: Blob): Promise<{ img: Img; url: string }> {
  const url = URL.createObjectURL(file)
  const el = new Image()
  el.src = url
  await el.decode()
  const scale = Math.min(1, MAX_SIDE / Math.max(el.naturalWidth, el.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(el.naturalWidth * scale)
  canvas.height = Math.round(el.naturalHeight * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
  return { img: ctx.getImageData(0, 0, canvas.width, canvas.height), url }
}

/** Problemas que impiden analizar la posición, en lenguaje llano. */
function positionProblem(board: Board, fen: string): string | null {
  const count = (p: PieceCode) => board.filter((x) => x === p).length
  if (count('wK') !== 1 || count('bK') !== 1) return 'Tiene que haber exactamente un rey de cada color.'
  if (board.slice(0, 8).some((p) => p?.[1] === 'P') || board.slice(56).some((p) => p?.[1] === 'P')) return 'Hay un peón en la primera o en la última fila.'
  const v = validateFen(fen)
  if (!v.ok) return 'La posición no es válida.'
  // El bando que no mueve no puede estar en jaque.
  const other = fen.replace(/ [wb] /, (m) => (m === ' w ' ? ' b ' : ' w '))
  try {
    if (new Chess(other, { skipValidation: true }).inCheck()) return 'El rey del bando que no mueve está en jaque: revisa a quién le toca.'
  } catch {
    return 'La posición no es válida.'
  }
  return null
}

export function ScanView({ onAnalyze, onBack, onPlay }: Props) {
  const [image, setImage] = useState<{ img: Img; url: string } | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [board, setBoard] = useState<Board>(() => fenToBoard(START_FEN)!)
  /** Si la lectura se ha girado para dejar las blancas abajo (para aprender de las correcciones). */
  const [scanFlipped, setScanFlipped] = useState(false)
  const [toMove, setToMove] = useState<'w' | 'b'>('w')
  const [tool, setTool] = useState<Tool>('wP')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [fenInput, setFenInput] = useState('')
  const [edited, setEdited] = useState<Set<number>>(new Set())

  const fen = boardToFen(board, toMove)
  const problem = positionProblem(board, fen)
  // Se puede analizar una posición de mate o tablas, pero no jugar desde ella.
  const over = !problem && new Chess(fen).isGameOver()

  useEffect(() => {
    setFenInput(fen)
  }, [fen])

  const applyScan = (r: ScanResult) => {
    setScan(r)
    setBoard(piecesToBoard(
      r.squares.map((s) => s.piece),
      r.flipped,
    ))
    setScanFlipped(r.flipped)
    setToMove(r.toMove ?? 'w')
    setEdited(new Set())
    const doubtful = r.squares.filter((s) => s.piece && s.conf < 0.12).length
    setMsg(
      r.boardConfidence < 0.3
        ? { kind: 'info', text: 'No estoy seguro de haber encontrado bien el tablero. Si las piezas no cuadran, pulsa Ajustar recuadro.' }
        : {
            kind: 'ok',
            text: `Posición leída. ${doubtful ? `Revisa las casillas marcadas (${doubtful}), son las más dudosas. ` : ''}${r.toMove ? '' : 'Indica a quién le toca mover.'}`,
          },
    )
  }

  const onFile = async (file?: Blob | null) => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    setAdjusting(false)
    try {
      if (image) URL.revokeObjectURL(image.url)
      const loaded = await loadImage(file)
      setImage(loaded)
      // Se cede un momento para que se pinte el aviso antes del cálculo.
      await new Promise((r) => setTimeout(r, 30))
      const r = scanImage(loaded.img)
      if (r) applyScan(r)
      else {
        setScan(null)
        setAdjusting(true)
        setMsg({ kind: 'error', text: 'No encuentro el tablero en la imagen. Marca el tablero con el dedo, de una esquina a la opuesta.' })
      }
    } catch {
      setMsg({ kind: 'error', text: 'No se ha podido abrir la imagen.' })
    } finally {
      setBusy(false)
    }
  }

  // En el PC se puede pegar una captura con Ctrl+V.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (item) void onFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const setRect = (rect: BoardRect) => {
    if (!image) return
    setAdjusting(false)
    applyScan(readBoard(image.img, rect))
  }

  const tap = (i: number) => {
    const next = [...board]
    next[i] = tool === 'borrar' || board[i] === tool ? null : tool
    setBoard(next)
    setEdited(new Set(edited).add(i))
  }

  const rotate = () => {
    setBoard([...board].reverse())
    setScanFlipped((f) => !f)
    setEdited(new Set([...edited].map((i) => 63 - i)))
  }

  const loadFen = (text: string) => {
    const b = fenToBoard(text)
    if (!b) {
      setMsg({ kind: 'error', text: 'La FEN no es válida.' })
      return
    }
    setBoard(b)
    setToMove(text.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w')
    setScan(null)
    setMsg({ kind: 'ok', text: 'Posición cargada desde la FEN.' })
  }

  const analyze = () => {
    if (problem) return
    if (scan) learnFromCorrection(scan.squares, scanFlipped ? [...board].reverse() : board)
    const now = Date.now()
    onAnalyze({
      id: `pos-${now}`,
      source: 'posicion',
      white: { name: 'Blancas' },
      black: { name: 'Negras' },
      result: '*',
      date: now,
      opening: 'Posición escaneada',
      pgn: `[Event "Posición escaneada"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`,
    })
  }

  const openClaude = async () => {
    await copyText(CLAUDE_FEN_PROMPT)
    window.open(CLAUDE_AI_URL, '_blank', 'noreferrer')
  }

  // Casillas dudosas de la lectura, en el orden del tablero que se muestra.
  const doubtful = new Set<number>()
  scan?.squares.forEach((s, vi) => {
    if (s.piece && s.conf < 0.12) doubtful.add(scanFlipped ? 63 - vi : vi)
  })

  return (
    <div className="page scan">
      <header className="page-head">
        <h1>Escanear posición</h1>
        <p className="muted">
          Elige una captura de pantalla de Chess.com, Lichess u otra app. Se lee en tu dispositivo, sin conexión y sin ningún coste.
        </p>
      </header>

      <section className="card">
        <div className="toolbar">
          <label className="btn primary file-btn">
            {image ? 'Elegir otra captura' : 'Elegir captura'}
            <input type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} hidden />
          </label>
          <button className="btn" onClick={onBack}>
            Volver
          </button>
        </div>
        <p className="muted small desktop-only">En el ordenador también puedes pegar una captura con Ctrl+V.</p>
        {busy && (
          <p className="msg info">
            <span className="spinner" /> Leyendo la posición…
          </p>
        )}
        {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
        {image && (
          <>
            <ImageCrop image={image} rect={adjusting ? null : (scan?.rect ?? null)} adjusting={adjusting} onRect={setRect} />
            <button className="btn small" onClick={() => setAdjusting((a) => !a)}>
              {adjusting ? 'Cancelar ajuste' : 'Ajustar recuadro'}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>Revisa la posición</h2>
        <p className="muted small">
          Las blancas, abajo. Toca una casilla para poner la pieza elegida (o quitarla si ya está). {learnedCount() > 0 && 'La app aprende de tus correcciones.'}
        </p>
        <div className="cg-wrap scan-editor">
          {board.map((p, i) => {
            const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0
            return (
              <button
                key={i}
                className={`scan-sq ${light ? 'light' : 'dark'} ${doubtful.has(i) && !edited.has(i) ? 'doubt' : ''}`}
                onClick={() => tap(i)}
                aria-label={`Casilla ${String.fromCharCode(97 + (i % 8))}${8 - Math.floor(i / 8)}`}
              >
                {p && <piece className={`${PIECE_CLASS[p[1]]} ${p[0] === 'w' ? 'white' : 'black'}`} />}
              </button>
            )
          })}
        </div>
        <div className="cg-wrap scan-palette" role="toolbar" aria-label="Piezas">
          {PALETTE.map((p) => (
            <button key={p} className={`scan-tool ${tool === p ? 'active' : ''}`} onClick={() => setTool(p)} aria-label={p}>
              <piece className={`${PIECE_CLASS[p[1]]} ${p[0] === 'w' ? 'white' : 'black'}`} />
            </button>
          ))}
          <button className={`scan-tool erase ${tool === 'borrar' ? 'active' : ''}`} onClick={() => setTool('borrar')}>
            Borrar
          </button>
        </div>

        <div className="segmented" role="tablist" aria-label="Turno">
          <button className={toMove === 'w' ? 'active' : ''} onClick={() => setToMove('w')}>
            Juegan blancas
          </button>
          <button className={toMove === 'b' ? 'active' : ''} onClick={() => setToMove('b')}>
            Juegan negras
          </button>
        </div>
        <div className="toolbar">
          <button className="btn small" onClick={rotate}>
            Girar posición
          </button>
          <button className="btn small" onClick={() => setBoard(Array(64).fill(null))}>
            Vaciar
          </button>
          <button className="btn small" onClick={() => loadFen(START_FEN)}>
            Posición inicial
          </button>
        </div>
        <label className="field">
          <span>FEN</span>
          <input value={fenInput} onChange={(e) => setFenInput(e.target.value)} onBlur={() => fenInput !== fen && loadFen(fenInput)} spellCheck={false} />
        </label>
        {problem && <p className="msg error">{problem}</p>}
        <div className="toolbar">
          <button className="btn primary" onClick={analyze} disabled={Boolean(problem)}>
            Analizar posición
          </button>
          <button
            className="btn"
            disabled={Boolean(problem) || over}
            title={over ? 'La partida ya está terminada en esta posición' : undefined}
            onClick={() => {
              if (scan) learnFromCorrection(scan.squares, scanFlipped ? [...board].reverse() : board)
              onPlay(fen)
            }}
          >
            Jugar desde aquí
          </button>
          <button className="btn small" onClick={() => void copyText(fen).then(() => setMsg({ kind: 'ok', text: 'FEN copiada.' }))}>
            Copiar FEN
          </button>
        </div>
      </section>

      <section className="card">
        <h3>¿Es una foto de un libro o de un tablero real?</h3>
        <p className="muted small">
          Eso lo lee mejor Claude, con tu plan. Pulsa el botón: se copia la petición y se abre claude.ai. Pega la petición, adjunta la foto y copia
          la FEN que te devuelva en el campo FEN de arriba.
        </p>
        <button className="btn small" onClick={() => void openClaude()}>
          Abrir en claude.ai
        </button>
      </section>
    </div>
  )
}

/** Muestra la captura con el recuadro del tablero. En modo ajuste se marca el tablero arrastrando. */
function ImageCrop({
  image,
  rect,
  adjusting,
  onRect,
}: {
  image: { img: Img; url: string }
  rect: BoardRect | null
  adjusting: boolean
  onRect: (r: BoardRect) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const { width: W, height: H } = image.img

  const toImg = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const square = (d: { x0: number; y0: number; x1: number; y1: number }): BoardRect => {
    const size = Math.max(Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0))
    return { x: d.x1 < d.x0 ? d.x0 - size : d.x0, y: d.y1 < d.y0 ? d.y0 - size : d.y0, size }
  }
  const shown = drag ? square(drag) : rect
  const pct = (v: number, total: number) => `${(v / total) * 100}%`

  return (
    <div
      ref={box}
      className={`scan-image ${adjusting ? 'adjusting' : ''}`}
      style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(55vh * ${W / H}))` }}
      onPointerDown={(e) => {
        if (!adjusting) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = toImg(e)
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      }}
      onPointerMove={(e) => {
        if (!drag) return
        const p = toImg(e)
        setDrag({ ...drag, x1: p.x, y1: p.y })
      }}
      onPointerUp={() => {
        if (!drag) return
        const r = square(drag)
        setDrag(null)
        if (r.size > 40) onRect(r)
      }}
    >
      <img src={image.url} alt="Captura" draggable={false} />
      {shown && (
        <div
          className="scan-rect"
          style={{ left: pct(shown.x, W), top: pct(shown.y, H), width: pct(shown.size, W), height: pct(shown.size, H) }}
        />
      )}
    </div>
  )
}
