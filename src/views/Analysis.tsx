import { logError } from '../lib/log'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { View } from '../App'
import { type Arrow, Board } from '../components/Board'
import { CoachPanel } from '../components/CoachPanel'
import { ResourceLinks } from '../components/ResourceLinks'
import { EvalBar } from '../components/EvalBar'
import { EvalChart } from '../components/EvalChart'
import { MoveList } from '../components/MoveList'
import { IconFirst, IconLast, IconNext, IconPrev } from '../components/NavIcons'
import { EngineLines, lineToWhite, useEngineLines } from '../components/EngineLines'
import { needsPromotion, PromotionPicker } from '../components/PromotionPicker'
import { useBackHandler } from '../lib/nav'
import { usePersistentState } from '../lib/storage'
import { Chess } from 'chess.js'
import { analyzeGame, CLASS_LABEL, CLASS_SYMBOL, formatEval, type GameAnalysis, parsePgn, toSpanishSan, winPercent } from '../lib/analysis'
import { formatClock, formatSeconds, parseClocks, quickLimit } from '../lib/clock'
import { getEngine } from '../lib/engine'
import { type CoachReport, loadReport } from '../lib/coach'
import { loadAnalysis, saveAnalysis } from '../lib/games'
import { themeName } from '../lib/puzzles'
import { buildSummary, themesForGame } from '../lib/recommend'
import { setBusy } from '../lib/activity'
import { makePuzzles } from '../lib/background'
import type { Settings } from '../lib/settings'
import type { Color, GameSummary } from '../lib/types'

interface Props {
  game: GameSummary | null
  settings: Settings
  onSettings: (s: Settings) => void
  onNavigate: (v: View) => void
  onPractice: (theme: string) => void
  onPlayFrom: (fen: string) => void
  /** Repaso guiado de esta partida: piensa tus momentos clave antes de ver el análisis. */
  onGuidedReview?: (gameId: string) => void
}

interface Retry {
  ply: number
  tries: number
  status: 'playing' | 'solved' | 'revealed'
  resetKey: number
  hint?: boolean
  checking?: boolean
  played?: string
  equal?: boolean
  lastWrong?: string
  /** Posición tras la jugada acertada, para dejarla en el tablero. */
  solvedFen?: string
  solvedMove?: [string, string]
}

/** Jugada de una variante explorada en el tablero. */
interface VarMove {
  san: string
  uci: string
  from: string
  to: string
  fen: string
}

/** Variante que sale de la partida en la jugada `base`; `idx` es la jugada de la variante que se ve (0 = la posición de salida). */
interface Variation {
  base: number
  moves: VarMove[]
  idx: number
}

const SOURCE_BADGE: Record<GameSummary['source'], string> = {
  chesscom: 'Partida de Chess.com',
  lichess: 'Partida de Lichess',
  bot: 'Partida contra bot',
  pgn: 'PGN importado',
  demo: 'Partida de ejemplo',
  posicion: 'Posición escaneada',
}

const DEPTHS = [
  { value: 10, label: 'Rápido' },
  { value: 12, label: 'Normal' },
  { value: 16, label: 'Profundo' },
]

export function AnalysisView({ game, settings, onSettings, onNavigate, onPractice, onPlayFrom, onGuidedReview }: Props) {
  if (!game) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Análisis</h1>
        </header>
        <section className="card empty">
          <p>Elige una partida para analizarla.</p>
          <div className="toolbar">
            <button className="btn primary" onClick={() => onNavigate('partidas')}>
              Ir a mis partidas
            </button>
            <button className="btn" onClick={() => onNavigate('escanear')}>
              Escanear una captura
            </button>
          </div>
        </section>
      </div>
    )
  }
  return <GameAnalysisView game={game} settings={settings} onSettings={onSettings} onPractice={onPractice} onPlayFrom={onPlayFrom} onGuidedReview={onGuidedReview} />
}

function GameAnalysisView({ game, settings, onSettings, onPractice, onPlayFrom, onGuidedReview }: Omit<Props, 'game' | 'onNavigate'> & { game: GameSummary }) {
  const parsed = useMemo(() => {
    try {
      return parsePgn(game.pgn)
    } catch {
      return null
    }
  }, [game.pgn])
  const clock = useMemo(() => parseClocks(game.pgn), [game.pgn])
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<Color>(game.userColor ?? 'white')
  const [showBest, setShowBest] = useState(true)
  const [report, setReport] = useState<CoachReport | null>(() => loadReport(game.id))
  const [retry, setRetry] = useState<Retry | null>(null)
  const [variation, setVariation] = useState<Variation | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const [boardKey, setBoardKey] = useState(0)
  const [showLines, setShowLines] = usePersistentState('showEngineLines', false)
  // Se recalcula también al llegar un informe de Claude, porque sus temas se suman (se leen del almacenamiento).
  const practice = useMemo(() => (parsed && analysis ? themesForGame(game, parsed, analysis) : []), [game, parsed, analysis, report]) // eslint-disable-line react-hooks/exhaustive-deps
  const abortRef = useRef<AbortController | null>(null)

  const total = parsed ? parsed.fens.length - 1 : 0
  const go = useCallback(
    (p: number) => {
      setRetry(null)
      setVariation(null)
      setPly(Math.max(0, Math.min(total, p)))
    },
    [total],
  )

  const start = useCallback(
    async (depth: number) => {
      if (!parsed) return
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setError(null)
      setProgress({ done: 0, total: parsed.fens.length })
      try {
        const a = await analyzeGame(parsed, depth, (done, t) => setProgress({ done, total: t }), ctrl.signal)
        setAnalysis(a)
        await saveAnalysis(game.id, a, buildSummary(game, parsed, a))
        // Problemas con los errores de esta partida (sin esperar).
        void makePuzzles(game, parsed, a)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message)
          logError(`Análisis de la partida fallido: ${(e as Error).message}`, e)
        }
      } finally {
        if (abortRef.current === ctrl) setProgress(null)
      }
    },
    [parsed, game],
  )

  // Al abrir la partida: se carga el análisis guardado o, si no hay, se analiza.
  useEffect(() => {
    let cancelled = false
    loadAnalysis(game.id).then((saved) => {
      if (cancelled) return
      if (saved) setAnalysis(saved)
      else if (parsed) void start(settings.depth)
    })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras se analiza esta partida, el análisis en segundo plano se para.
  useEffect(() => {
    setBusy('analysis', Boolean(progress))
    return () => setBusy('analysis', false)
  }, [progress])

  // Navegación: dentro de una variante se mueve por ella; si no, por la partida.
  const nav = (where: 'start' | 'prev' | 'next' | 'end') => {
    if (variation) {
      const len = variation.moves.length
      if (where === 'prev') {
        if (variation.idx > 0) setVariation({ ...variation, idx: variation.idx - 1 })
        else go(variation.base)
      } else if (where === 'next') setVariation({ ...variation, idx: Math.min(len, variation.idx + 1) })
      else if (where === 'start') setVariation({ ...variation, idx: 0 })
      else setVariation({ ...variation, idx: len })
      return
    }
    if (where === 'prev') go(ply - 1)
    else if (where === 'next') go(ply + 1)
    else if (where === 'start') go(0)
    else go(total)
  }

  // Ir atrás cierra primero la variante o el «Inténtalo tú».
  useBackHandler(Boolean(variation || retry), () => {
    if (variation) go(variation.base)
    else setRetry(null)
  })

  const boardFen = parsed ? (variation ? (variation.idx ? variation.moves[variation.idx - 1].fen : parsed.fens[variation.base]) : parsed.fens[ply]) : null
  const exploring = Boolean(variation) || showLines
  // Sin las líneas a la vista basta con la mejor (para la evaluación y la flecha): menos trabajo para el motor.
  const live = useEngineLines(exploring && !retry ? boardFen : null, 12, showLines ? 3 : 1)

  // Mientras se exploran variantes, el análisis en segundo plano se para.
  useEffect(() => {
    setBusy('explore', exploring)
    return () => setBusy('explore', false)
  }, [exploring])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key === 'ArrowLeft') nav('prev')
      else if (e.key === 'ArrowRight') nav('next')
      else if (e.key === 'Home') nav('start')
      else if (e.key === 'End') nav('end')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!parsed) {
    return (
      <div className="page">
        <section className="card">
          <p className="msg error">No se ha podido leer el PGN de esta partida.</p>
        </section>
      </div>
    )
  }

  const fen = parsed.fens[ply]
  // Número de la jugada `p` según la FEN anterior (vale también para partidas que no empiezan en la posición inicial).
  const moveNo = (p: number) => Number(parsed.fens[p - 1]?.split(' ')[5]) || Math.ceil(p / 2)
  const move = ply > 0 ? parsed.moves[ply - 1] : undefined
  const moveAnalysis = analysis && ply > 0 ? analysis.moves[ply - 1] : undefined
  const evalNow = analysis?.positions[ply]
  const coachComment = report?.comentarios.find((c) => c.ply === ply)?.comentario ?? report?.momentos_clave.find((m) => m.ply === ply)?.explicacion
  const bestNow = evalNow?.best
  const arrows: Arrow[] = showBest && bestNow ? [{ orig: bestNow.slice(0, 2), dest: bestNow.slice(2, 4), brush: 'paleBlue' }] : []
  const liveBest = exploring ? live?.lines[0]?.move : undefined
  const boardArrows: Arrow[] = variation || showLines ? (showBest && liveBest ? [{ orig: liveBest.slice(0, 2), dest: liveBest.slice(2, 4), brush: 'paleBlue' }] : []) : arrows
  const varMove = variation && variation.idx ? variation.moves[variation.idx - 1] : undefined
  const baseMove = variation && variation.base > 0 ? parsed.moves[variation.base - 1] : undefined
  const boardLastMove: [string, string] | undefined = variation
    ? varMove
      ? [varMove.from, varMove.to]
      : baseMove && [baseMove.from, baseMove.to]
    : move
      ? [move.from, move.to]
      : undefined
  const top = orientation === 'white' ? game.black : game.white
  const bottom = orientation === 'white' ? game.white : game.black

  // Momentos clave: errores y errores graves del usuario (o de ambos si no se sabe quién es).
  const userSide = game.userColor === 'white' ? 'w' : game.userColor === 'black' ? 'b' : undefined
  // Tiempo pensado en la jugada actual (si la partida trae los relojes).
  const timeSpent = clock && ply > 0 && ply <= clock.left.length ? { spent: clock.spent[ply - 1], left: clock.left[ply - 1] } : null
  const rushed =
    timeSpent !== null &&
    clock !== null &&
    timeSpent.spent < quickLimit(clock.base) &&
    (moveAnalysis?.classification === 'error' || moveAnalysis?.classification === 'grave') &&
    (!userSide || move?.color === userSide)
  const keyMoments = analysis?.moves.filter(
    (m) => (m.classification === 'grave' || m.classification === 'error') && (!userSide || m.color === userSide),
  )

  // «Inténtalo tú»: en un error del usuario, volver a la posición anterior y buscar la buena.
  const bestBefore = analysis && ply > 0 ? analysis.positions[ply - 1]?.best : undefined
  const canRetry = Boolean(
    moveAnalysis &&
      bestBefore &&
      ['imprecision', 'error', 'grave'].includes(moveAnalysis.classification) &&
      (!userSide || move?.color === userSide),
  )

  const startRetry = () => setRetry({ ply, tries: 0, status: 'playing', resetKey: 0 })

  const onRetryMove = async (from: string, to: string) => {
    if (!retry || retry.status !== 'playing' || !analysis || !bestBefore) return
    const before = parsed.fens[retry.ply - 1]
    const chess = new Chess(before)
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? (bestBefore.slice(0, 4) === from + to && bestBefore[4]) || 'q' : undefined
    let played
    try {
      played = chess.move({ from, to, promotion })
    } catch {
      setRetry({ ...retry, resetKey: retry.resetKey + 1 })
      return
    }
    if (played.lan === bestBefore || chess.isCheckmate()) {
      setRetry({ ...retry, status: 'solved', played: toSpanishSan(played.san), equal: false, solvedFen: chess.fen(), solvedMove: [from, to] })
      return
    }
    // ¿Es igual de buena? Se comprueba con el motor la posición resultante.
    setRetry({ ...retry, checking: true })
    let res
    try {
      res = await getEngine('main').evaluate(chess.fen(), 10)
    } catch {
      setRetry((cur) => (cur && cur.ply === retry.ply && cur.checking ? { ...cur, checking: false, resetKey: cur.resetKey + 1, lastWrong: 'No se ha podido comprobar la jugada con el motor. Inténtalo otra vez.' } : cur))
      return
    }
    // La evaluación es del rival: se pasa al punto de vista de las blancas.
    const sign = played.color === 'w' ? 1 : -1
    const afterWhite = { cp: res.cp !== undefined ? -res.cp * sign : undefined, mate: res.mate !== undefined ? -res.mate * sign : undefined, pv: [] }
    const toMover = (w: number) => (sign === 1 ? w : 100 - w)
    const drop = toMover(winPercent(analysis.positions[retry.ply - 1])) - toMover(winPercent(afterWhite))
    // Si mientras se calculaba se ha salido del «Inténtalo tú» o se ha cambiado de jugada, no se toca nada.
    setRetry((cur) => {
      if (!cur || cur.ply !== retry.ply || !cur.checking) return cur
      return drop < 5
        ? { ...cur, status: 'solved', played: toSpanishSan(played.san), equal: true, checking: false, solvedFen: chess.fen(), solvedMove: [from, to] }
        : { ...cur, tries: cur.tries + 1, resetKey: cur.resetKey + 1, checking: false, lastWrong: `${toSpanishSan(played.san)} deja la evaluación en ${formatEval(afterWhite)}.` }
    })
  }

  // Explorar variantes: cualquier jugada en el tablero. Si coincide con la partida, se sigue la partida.
  const playMove = (from: string, to: string, promotion?: string) => {
    if (!boardFen) return
    const chess = new Chess(boardFen)
    let m
    try {
      m = chess.move({ from, to, promotion })
    } catch {
      setBoardKey((k) => k + 1)
      return
    }
    const vm: VarMove = { san: m.san, uci: m.lan, from, to, fen: chess.fen() }
    if (!variation) {
      if (parsed.moves[ply]?.uci === m.lan) go(ply + 1)
      else setVariation({ base: ply, moves: [vm], idx: 1 })
      return
    }
    if (variation.moves[variation.idx]?.uci === m.lan) {
      setVariation({ ...variation, idx: variation.idx + 1 })
      return
    }
    if (variation.idx === 0 && parsed.moves[variation.base]?.uci === m.lan) {
      go(variation.base + 1)
      return
    }
    setVariation({ ...variation, moves: [...variation.moves.slice(0, variation.idx), vm], idx: variation.idx + 1 })
  }

  const onBoardMove = (from: string, to: string) => {
    if (!boardFen) return
    const piece = new Chess(boardFen).get(from as Parameters<Chess['get']>[0])
    if (needsPromotion(boardFen, from, to, piece?.type)) setPromo({ from, to })
    else playMove(from, to)
  }

  const playUci = (uci: string) => playMove(uci.slice(0, 2), uci.slice(2, 4), uci[4])

  const variationCard = (variant: string) => {
    if (!variation || !boardFen) return null
    const startFen = parsed.fens[variation.base]
    let n = Number(startFen.split(' ')[5] ?? 1)
    const items = variation.moves.map((m, i) => {
      const white = new Chess(i ? variation.moves[i - 1].fen : startFen).turn() === 'w'
      const label = white ? `${n}. ${toSpanishSan(m.san)}` : i === 0 ? `${n}... ${toSpanishSan(m.san)}` : toSpanishSan(m.san)
      if (!white) n++
      return { label, i: i + 1 }
    })
    const baseMove = variation.base > 0 ? parsed.moves[variation.base - 1] : undefined
    return (
      <section className={`card move-card variation-card ${variant}`}>
        <div className="move-card-head">
          <strong>Variante</strong>
          <span className="muted small">
            {baseMove ? `desde ${moveNo(variation.base)}${baseMove.color === 'w' ? '.' : '...'} ${toSpanishSan(baseMove.san)}` : 'desde el inicio'}
          </span>
          {live?.lines[0] && <span className="eval-chip">{formatEval(lineToWhite(boardFen, live.lines[0]))}</span>}
        </div>
        <div className="variation-moves">
          {items.map((it) => (
            <button key={it.i} className={`var-move ${it.i === variation.idx ? 'active' : ''}`} onClick={() => setVariation({ ...variation, idx: it.i })}>
              {it.label}
            </button>
          ))}
        </div>
        {showLines && <EngineLines fen={boardFen} lines={live} onPlay={playUci} />}
        <div className="toolbar">
          <button className="btn small" onClick={() => go(variation.base)}>
            Volver a la partida
          </button>
          <button className="link small" onClick={() => setShowLines(!showLines)}>
            {showLines ? 'Ocultar las líneas del motor' : 'Ver las 3 mejores líneas'}
          </button>
        </div>
      </section>
    )
  }

  const viewControls = (
    <div className="view-controls">
      <button className="btn small" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
        Girar tablero
      </button>
      <label className="check">
        <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Mostrar mejor jugada
      </label>
      <label className="check">
        <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Líneas del motor
      </label>
      {boardFen && !new Chess(boardFen).isGameOver() && (
        <button className="btn small" onClick={() => onPlayFrom(boardFen)}>
          Jugar desde aquí
        </button>
      )}
    </div>
  )

  const moveCard = (variant: string) => (
<section className={`card move-card ${variant} ${moveAnalysis ? 'c-' + moveAnalysis.classification : ''}`}>
      {move ? (
        <>
          <div className="move-card-head">
            <strong>
              {moveNo(ply)}
              {move.color === 'w' ? '.' : '...'} {toSpanishSan(move.san)}
            </strong>
            {moveAnalysis && (
              <span className={`badge cls-${moveAnalysis.classification}`}>
                {CLASS_SYMBOL[moveAnalysis.classification]} {CLASS_LABEL[moveAnalysis.classification]}
              </span>
            )}
            {evalNow && <span className="eval-chip">{formatEval(evalNow)}</span>}
          </div>
          {retry ? (
            <div className="retry">
              {retry.status === 'solved' ? (
                <p className="msg ok">
                  {retry.equal ? `¡Bien! ${retry.played} también es una buena jugada.` : `¡Correcto! ${retry.played} es la mejor jugada.`} En la partida
                  jugaste {toSpanishSan(move.san)}.
                </p>
              ) : retry.status === 'revealed' ? (
                <p className="msg info">La mejor era {moveAnalysis?.bestSan ? toSpanishSan(moveAnalysis.bestSan) : ''}.</p>
              ) : (
                <p>
                  {retry.checking
                    ? 'Comprobando tu jugada…'
                    : retry.lastWrong
                      ? `${retry.lastWrong} Prueba otra vez.`
                      : `Busca una jugada mejor que ${toSpanishSan(move.san)}.`}
                </p>
              )}
              <div className="toolbar">
                {retry.status === 'playing' && (
                  <>
                    <button className="btn small" onClick={() => setRetry({ ...retry, hint: true })} disabled={retry.hint}>
                      Pista
                    </button>
                    <button className="btn small" onClick={() => setRetry({ ...retry, status: 'revealed' })}>
                      Ver solución
                    </button>
                  </>
                )}
                <button className="btn small" onClick={() => setRetry(null)}>
                  {retry.status === 'playing' ? 'Salir' : 'Volver a la partida'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p>{moveAnalysis ? moveAnalysis.comment : 'Esperando al análisis…'}</p>
              {timeSpent && (
                <p className={`small move-time ${rushed ? 'rushed' : 'muted'}`}>
                  {rushed
                    ? `Jugada deprisa: en ${formatSeconds(timeSpent.spent)}, con ${formatClock(timeSpent.left)} en el reloj. Unos segundos para mirar qué ataca el rival suelen evitar este error.`
                    : `Pensada en ${formatSeconds(timeSpent.spent)}; quedaban ${formatClock(timeSpent.left)}.`}
                </p>
              )}
              {canRetry && (
                <button className="btn small primary retry-btn" onClick={startRetry}>
                  Inténtalo tú
                </button>
              )}
            </>
          )}
          {coachComment && (
            <p className="coach-comment">
              <strong>Entrenador:</strong> {coachComment}
            </p>
          )}
          {showLines && !retry && <EngineLines fen={fen} lines={live} onPlay={playUci} />}
        </>
      ) : (
        <>
          <p className="muted">
            {total ? 'Posición inicial. Avanza con los botones de la barra o mueve una pieza para explorar una variante.' : 'Mueve una pieza para explorar una variante.'}
          </p>
          {showLines && !retry && <EngineLines fen={fen} lines={live} onPlay={playUci} />}
        </>
      )}
    </section>
  )

  return (
    <div className="page analysis">
      <div className="analysis-board">
        <div className="board-block">
          <PlayerLine player={top} />
          <div className="board-row">
            <EvalBar evaluation={exploring && live?.lines[0] && boardFen ? lineToWhite(boardFen, live.lines[0]) : evalNow} orientation={orientation} />
            {retry ? (
              <Board
                fen={retry.solvedFen ?? parsed.fens[retry.ply - 1]}
                orientation={orientation}
                movableColor={retry.status === 'playing' && !retry.checking ? (parsed.moves[retry.ply - 1].color === 'w' ? 'white' : 'black') : undefined}
                lastMove={retry.solvedMove ?? (retry.ply > 1 ? [parsed.moves[retry.ply - 2].from, parsed.moves[retry.ply - 2].to] : undefined)}
                arrows={
                  retry.status === 'solved'
                    ? []
                    : retry.status === 'revealed' && bestBefore
                    ? [{ orig: bestBefore.slice(0, 2), dest: bestBefore.slice(2, 4), brush: 'green' }]
                    : retry.hint && bestBefore
                      ? [{ orig: bestBefore.slice(0, 2), brush: 'green' }]
                      : []
                }
                onMove={onRetryMove}
                resetKey={retry.resetKey}
              />
            ) : (
              <Board
                fen={boardFen ?? fen}
                orientation={orientation}
                movableColor={boardFen ? (boardFen.split(' ')[1] === 'w' ? 'white' : 'black') : undefined}
                lastMove={boardLastMove}
                arrows={boardArrows}
                onMove={onBoardMove}
                resetKey={boardKey}
              />
            )}
          </div>
          <PlayerLine player={bottom} />
        </div>
        <div className="controls">
          <div className="nav-controls">
            <button className="btn" onClick={() => nav('start')} title="Inicio" aria-label="Inicio">
              <IconFirst />
            </button>
            <button className="btn" onClick={() => nav('prev')} title="Anterior (flecha izquierda)" aria-label="Anterior">
              <IconPrev />
            </button>
            <button className="btn" onClick={() => nav('next')} title="Siguiente (flecha derecha)" aria-label="Siguiente">
              <IconNext />
            </button>
            <button className="btn" onClick={() => nav('end')} title="Final" aria-label="Final">
              <IconLast />
            </button>
          </div>
          <div className="desktop-only">{viewControls}</div>
        </div>
        {analysis && (
          <div className="desktop-only">
            <EvalChart analysis={analysis} ply={ply} onSelect={go} />
          </div>
        )}
      </div>

      <div className="analysis-side">
        {/* En el móvil, la jugada actual queda fija y solo se desplaza lo de debajo */}
        <div className="mobile-only">{variation ? variationCard('mobile') : moveCard('mobile')}</div>
        <div className="side-scroll">
          <div className="mobile-only m-order-6">{viewControls}</div>
          {analysis && (
            <div className="mobile-only m-order-4">
              <EvalChart analysis={analysis} ply={ply} onSelect={go} />
            </div>
          )}
          <section className="card m-order-5">
            <span className={`badge src-${game.source}`}>{SOURCE_BADGE[game.source]}</span>
            <h2>
              {game.white.name} contra {game.black.name}
            </h2>
            <p className="muted small">
              {new Date(game.date).toLocaleDateString('es-ES')}
              {game.opening ? `, ${game.opening}` : ''}{' '}
              {game.url && (
                <a href={game.url} target="_blank" rel="noreferrer">
                  Ver original
                </a>
              )}
            </p>
            {progress && (
              <div className="progress">
                <div className="progress-bar">
                  <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <span className="small">
                  Analizando con Stockfish: {progress.done} de {progress.total} posiciones
                </span>
                <button className="btn small" onClick={() => abortRef.current?.abort()}>
                  Cancelar
                </button>
              </div>
            )}
            {error && <p className="msg error">{error}</p>}
            {analysis && (
              <table className="summary">
                <thead>
                  <tr>
                    <th />
                    <th>Precisión</th>
                    <th title="Imprecisiones">?!</th>
                    <th title="Errores">?</th>
                    <th title="Errores graves">??</th>
                  </tr>
                </thead>
                <tbody>
                  {(['white', 'black'] as const).map((side) => (
                    <tr key={side} className={game.userColor === side ? 'me' : ''}>
                      <td>{side === 'white' ? game.white.name : game.black.name}</td>
                      <td>
                        <strong>{analysis.accuracy[side].toFixed(0)}%</strong>
                      </td>
                      <td className="c-imprecision">{analysis.counts[side].imprecision}</td>
                      <td className="c-error">{analysis.counts[side].error}</td>
                      <td className="c-grave">{analysis.counts[side].grave}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!progress && (
              <div className="toolbar small-gap">
                <select
                  value={settings.depth}
                  onChange={(e) => onSettings({ ...settings, depth: Number(e.target.value) })}
                  aria-label="Profundidad de análisis"
                >
                  {DEPTHS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label} (profundidad {d.value})
                    </option>
                  ))}
                </select>
                <button className="btn small" onClick={() => start(settings.depth)}>
                  {analysis ? 'Volver a analizar' : 'Analizar'}
                </button>
              </div>
            )}
          </section>

          {analysis && (
            <section className="card practice m-order-3">
              <h3>Practica lo que has fallado</h3>
              {practice.length ? (
                <>
                  <p className="muted small">
                    {game.userColor ? 'Tus errores en esta partida' : 'Los errores de esta partida'} tienen que ver con estos temas. Practícalos para
                    que no se repitan:
                  </p>
                  <button className="btn primary" onClick={() => onPractice(practice[0].theme)}>
                    Practicar: {themeName(practice[0].theme)}
                  </button>
                  {practice.length > 1 && (
                    <div className="chips">
                      {practice.map((t) => (
                        <button key={t.theme} className="chip" onClick={() => onPractice(t.theme)}>
                          {themeName(t.theme)} ({t.count})
                        </button>
                      ))}
                    </div>
                  )}
                  <ResourceLinks theme={practice[0].theme} />
                </>
              ) : (
                <p className="muted small">En esta partida no hay errores claros asociados a un tema de problemas.</p>
              )}
            </section>
          )}

          {variation ? variationCard('desktop-only') : moveCard('desktop-only')}

          {keyMoments && keyMoments.length > 0 && (
            <section className="card m-order-2">
              <h3>{userSide ? 'Tus momentos clave' : 'Momentos clave'}</h3>
              <div className="chips">
                {keyMoments.map((m) => (
                  <button key={m.ply} className={`chip cls-${m.classification}`} onClick={() => go(m.ply)}>
                    {moveNo(m.ply)}
                    {m.color === 'w' ? '.' : '...'} {toSpanishSan(m.san)} {CLASS_SYMBOL[m.classification]}
                  </button>
                ))}
              </div>
              {userSide && onGuidedReview && (
                <>
                  <p className="muted small">Antes de mirar las respuestas, prueba a encontrar tú la buena jugada en cada uno.</p>
                  <button className="btn small" onClick={() => onGuidedReview(game.id)}>
                    Repaso guiado
                  </button>
                </>
              )}
            </section>
          )}

          <section className="card m-order-1">
            <MoveList sans={parsed.moves.map((m) => m.san)} analysis={analysis?.moves} ply={ply} onSelect={go} startFen={parsed.fens[0]} />
          </section>

          <div className="m-order-9">
            <CoachPanel
              game={game}
              parsed={parsed}
              analysis={analysis}
              ply={ply}
              report={report}
              onReport={setReport}
              onSelectPly={go}
              onPractice={onPractice}
            />
          </div>
        </div>
      </div>
      {promo && boardFen && (
        <PromotionPicker
          color={boardFen.split(' ')[1] === 'w' ? 'white' : 'black'}
          onCancel={() => {
            setPromo(null)
            setBoardKey((k) => k + 1)
          }}
          onPick={(p) => {
            const { from, to } = promo
            setPromo(null)
            playMove(from, to, p)
          }}
        />
      )}
    </div>
  )
}

function PlayerLine({ player }: { player: { name: string; rating?: number } }) {
  return (
    <div className="player-line">
      <strong>{player.name}</strong>
      {player.rating ? <span className="muted"> ({player.rating})</span> : null}
    </div>
  )
}
