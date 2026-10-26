import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { View } from '../App'
import { type Arrow, Board } from '../components/Board'
import { CoachPanel } from '../components/CoachPanel'
import { ResourceLinks } from '../components/ResourceLinks'
import { EvalBar } from '../components/EvalBar'
import { EvalChart } from '../components/EvalChart'
import { MoveList } from '../components/MoveList'
import { Chess } from 'chess.js'
import { analyzeGame, CLASS_LABEL, CLASS_SYMBOL, formatEval, type GameAnalysis, parsePgn, toSpanishSan, winPercent } from '../lib/analysis'
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

const DEPTHS = [
  { value: 10, label: 'Rápido' },
  { value: 12, label: 'Normal' },
  { value: 16, label: 'Profundo' },
]

export function AnalysisView({ game, settings, onSettings, onNavigate, onPractice }: Props) {
  if (!game) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Análisis</h1>
        </header>
        <section className="card empty">
          <p>Elige una partida para analizarla.</p>
          <button className="btn primary" onClick={() => onNavigate('partidas')}>
            Ir a mis partidas
          </button>
        </section>
      </div>
    )
  }
  return <GameAnalysisView game={game} settings={settings} onSettings={onSettings} onPractice={onPractice} />
}

function GameAnalysisView({ game, settings, onSettings, onPractice }: Omit<Props, 'game' | 'onNavigate'> & { game: GameSummary }) {
  const parsed = useMemo(() => {
    try {
      return parsePgn(game.pgn)
    } catch {
      return null
    }
  }, [game.pgn])
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<Color>(game.userColor ?? 'white')
  const [showBest, setShowBest] = useState(true)
  const [report, setReport] = useState<CoachReport | null>(() => loadReport(game.id))
  const [retry, setRetry] = useState<Retry | null>(null)
  // Se recalcula también al llegar un informe de Claude, porque sus temas se suman (se leen del almacenamiento).
  const practice = useMemo(() => (parsed && analysis ? themesForGame(game, parsed, analysis) : []), [game, parsed, analysis, report]) // eslint-disable-line react-hooks/exhaustive-deps
  const abortRef = useRef<AbortController | null>(null)

  const total = parsed ? parsed.fens.length - 1 : 0
  const go = useCallback(
    (p: number) => {
      setRetry(null)
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
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key === 'ArrowLeft') go(ply - 1)
      else if (e.key === 'ArrowRight') go(ply + 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(total)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ply, total, go])

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
  const move = ply > 0 ? parsed.moves[ply - 1] : undefined
  const moveAnalysis = analysis && ply > 0 ? analysis.moves[ply - 1] : undefined
  const evalNow = analysis?.positions[ply]
  const coachComment = report?.comentarios.find((c) => c.ply === ply)?.comentario ?? report?.momentos_clave.find((m) => m.ply === ply)?.explicacion
  const bestNow = evalNow?.best
  const arrows: Arrow[] = showBest && bestNow ? [{ orig: bestNow.slice(0, 2), dest: bestNow.slice(2, 4), brush: 'paleBlue' }] : []
  const top = orientation === 'white' ? game.black : game.white
  const bottom = orientation === 'white' ? game.white : game.black

  // Momentos clave: errores y errores graves del usuario (o de ambos si no se sabe quién es).
  const userSide = game.userColor === 'white' ? 'w' : game.userColor === 'black' ? 'b' : undefined
  const keyMoments = analysis?.moves.filter(
    (m) => (m.classification === 'grave' || m.classification === 'error') && (!userSide || m.color === userSide),
  )

  // «Inténtalo tú»: en un error del usuario, volver a la posición anterior y buscar la buena.
  const userSideColor = game.userColor === 'white' ? 'w' : game.userColor === 'black' ? 'b' : undefined
  const bestBefore = analysis && ply > 0 ? analysis.positions[ply - 1]?.best : undefined
  const canRetry = Boolean(
    moveAnalysis &&
      bestBefore &&
      ['imprecision', 'error', 'grave'].includes(moveAnalysis.classification) &&
      (!userSideColor || move?.color === userSideColor),
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
    const res = await getEngine('main').evaluate(chess.fen(), 10)
    const sign = played.color === 'w' ? 1 : -1
    const afterWhite = { cp: res.cp !== undefined ? -res.cp * (played.color === 'w' ? 1 : -1) : undefined, mate: res.mate !== undefined ? -res.mate * (played.color === 'w' ? 1 : -1) : undefined, pv: [] }
    const toMover = (w: number) => (sign === 1 ? w : 100 - w)
    const drop = toMover(winPercent(analysis.positions[retry.ply - 1])) - toMover(winPercent(afterWhite))
    if (drop < 5) {
      setRetry({ ...retry, status: 'solved', played: toSpanishSan(played.san), equal: true, checking: false, solvedFen: chess.fen(), solvedMove: [from, to] })
    } else {
      setRetry({
        ...retry,
        tries: retry.tries + 1,
        resetKey: retry.resetKey + 1,
        checking: false,
        lastWrong: `${toSpanishSan(played.san)} deja la evaluación en ${formatEval(afterWhite)}.`,
      })
    }
  }

  const viewControls = (
    <div className="view-controls">
      <button className="btn small" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
        Girar tablero
      </button>
      <label className="check">
        <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Mostrar mejor jugada
      </label>
    </div>
  )

  const moveCard = (variant: string) => (
<section className={`card move-card ${variant} ${moveAnalysis ? 'c-' + moveAnalysis.classification : ''}`}>
      {move ? (
        <>
          <div className="move-card-head">
            <strong>
              {Math.ceil(ply / 2)}
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
        </>
      ) : (
        <p className="muted">Posición inicial. Avanza con los botones de la barra (o con las flechas del teclado).</p>
      )}
    </section>
  )

  return (
    <div className="page analysis">
      <div className="analysis-board">
        <div className="board-block">
          <PlayerLine player={top} />
          <div className="board-row">
            <EvalBar evaluation={evalNow} orientation={orientation} />
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
              <Board fen={fen} orientation={orientation} lastMove={move ? [move.from, move.to] : undefined} arrows={arrows} />
            )}
          </div>
          <PlayerLine player={bottom} />
        </div>
        <div className="controls">
          <div className="nav-controls">
            <button className="btn" onClick={() => go(0)} title="Inicio" aria-label="Inicio">
              ⏮
            </button>
            <button className="btn" onClick={() => go(ply - 1)} title="Anterior (flecha izquierda)" aria-label="Anterior">
              ◀
            </button>
            <button className="btn" onClick={() => go(ply + 1)} title="Siguiente (flecha derecha)" aria-label="Siguiente">
              ▶
            </button>
            <button className="btn" onClick={() => go(total)} title="Final" aria-label="Final">
              ⏭
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
        <div className="mobile-only">{moveCard('mobile')}</div>
        <div className="side-scroll">
          <div className="mobile-only m-order-6">{viewControls}</div>
          {analysis && (
            <div className="mobile-only m-order-4">
              <EvalChart analysis={analysis} ply={ply} onSelect={go} />
            </div>
          )}
          <section className="card m-order-5">
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

          {moveCard('desktop-only')}

          {keyMoments && keyMoments.length > 0 && (
            <section className="card m-order-2">
              <h3>{userSide ? 'Tus momentos clave' : 'Momentos clave'}</h3>
              <div className="chips">
                {keyMoments.map((m) => (
                  <button key={m.ply} className={`chip cls-${m.classification}`} onClick={() => go(m.ply)}>
                    {Math.ceil(m.ply / 2)}
                    {m.color === 'w' ? '.' : '...'} {toSpanishSan(m.san)} {CLASS_SYMBOL[m.classification]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card m-order-1">
            <MoveList sans={parsed.moves.map((m) => m.san)} analysis={analysis?.moves} ply={ply} onSelect={go} />
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
