import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { View } from '../App'
import { type Arrow, Board } from '../components/Board'
import { CoachPanel } from '../components/CoachPanel'
import { EvalBar } from '../components/EvalBar'
import { EvalChart } from '../components/EvalChart'
import { MoveList } from '../components/MoveList'
import { analyzeGame, CLASS_LABEL, CLASS_SYMBOL, formatEval, type GameAnalysis, parsePgn, toSpanishSan } from '../lib/analysis'
import { type CoachReport, loadReport } from '../lib/coach'
import { loadAnalysis, saveAnalysis } from '../lib/games'
import type { Settings } from '../lib/settings'
import type { Color, GameSummary } from '../lib/types'

interface Props {
  game: GameSummary | null
  settings: Settings
  onSettings: (s: Settings) => void
  onNavigate: (v: View) => void
  onPractice: (theme: string) => void
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
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(() => loadAnalysis(game.id))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<Color>(game.userColor ?? 'white')
  const [showBest, setShowBest] = useState(true)
  const [report, setReport] = useState<CoachReport | null>(() => loadReport(game.id))
  const abortRef = useRef<AbortController | null>(null)

  const total = parsed ? parsed.fens.length - 1 : 0
  const go = useCallback((p: number) => setPly(Math.max(0, Math.min(total, p))), [total])

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
        saveAnalysis(game.id, a)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      } finally {
        if (abortRef.current === ctrl) setProgress(null)
      }
    },
    [parsed, game.id],
  )

  useEffect(() => {
    if (!analysis && parsed) void start(settings.depth)
    return () => abortRef.current?.abort()
    // Solo al abrir la partida.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="page analysis">
      <div className="analysis-board">
        <PlayerLine player={top} />
        <div className="board-row">
          <EvalBar evaluation={evalNow} orientation={orientation} />
          <Board fen={fen} orientation={orientation} lastMove={move ? [move.from, move.to] : undefined} arrows={arrows} />
        </div>
        <PlayerLine player={bottom} />
        <div className="controls">
          <button className="btn" onClick={() => go(0)} title="Inicio">
            ⏮
          </button>
          <button className="btn" onClick={() => go(ply - 1)} title="Anterior (flecha izquierda)">
            ◀
          </button>
          <button className="btn" onClick={() => go(ply + 1)} title="Siguiente (flecha derecha)">
            ▶
          </button>
          <button className="btn" onClick={() => go(total)} title="Final">
            ⏭
          </button>
          <button className="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
            Girar tablero
          </button>
          <label className="check">
            <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Mostrar mejor jugada
          </label>
        </div>
        {analysis && <EvalChart analysis={analysis} ply={ply} onSelect={go} />}
      </div>

      <div className="analysis-side">
        <section className="card">
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

        <section className={`card move-card ${moveAnalysis ? 'c-' + moveAnalysis.classification : ''}`}>
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
              <p>{moveAnalysis ? moveAnalysis.comment : 'Esperando al análisis…'}</p>
              {coachComment && (
                <p className="coach-comment">
                  <strong>Entrenador:</strong> {coachComment}
                </p>
              )}
            </>
          ) : (
            <p className="muted">Posición inicial. Avanza por la partida con los botones de debajo del tablero (o con las flechas del teclado).</p>
          )}
        </section>

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

        {keyMoments && keyMoments.length > 0 && (
          <section className="card">
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

        <section className="card">
          <MoveList sans={parsed.moves.map((m) => m.san)} analysis={analysis?.moves} ply={ply} onSelect={go} />
        </section>
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
