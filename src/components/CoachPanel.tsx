import { useEffect, useState } from 'react'
import { type GameAnalysis, type ParsedGame, toSpanishSan } from '../lib/analysis'
import {
  askCoach,
  buildGameContext,
  type CoachChat,
  type CoachReport,
  type CoachStatus,
  describePosition,
  fetchCoachStatus,
  loadChat,
  requestReport,
  saveChat,
  saveReport,
} from '../lib/coach'
import { themeName } from '../lib/puzzles'
import type { GameSummary } from '../lib/types'
import { RichText } from './RichText'

interface Props {
  game: GameSummary
  parsed: ParsedGame
  analysis: GameAnalysis | null
  ply: number
  report: CoachReport | null
  onReport: (r: CoachReport) => void
  onSelectPly: (ply: number) => void
  onPractice: (theme: string) => void
}

export function CoachPanel({ game, parsed, analysis, ply, report, onReport, onSelectPly, onPractice }: Props) {
  const [status, setStatus] = useState<CoachStatus | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chat, setChat] = useState<CoachChat | null>(() => loadChat(game.id))
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    fetchCoachStatus().then(setStatus)
  }, [])

  const generate = async () => {
    if (!analysis) return
    setLoading(true)
    setError(null)
    try {
      const r = await requestReport(buildGameContext(game, parsed, analysis))
      saveReport(game.id, r)
      onReport(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const ask = async () => {
    if (!analysis || !question.trim()) return
    const context = buildGameContext(game, parsed, analysis)
    // Si el análisis ha cambiado, la conversación anterior ya no corresponde a este contexto.
    const base: CoachChat = chat && chat.context === context ? chat : { context, turns: [] }
    const text = `${describePosition(parsed, analysis, ply)}\n\nPregunta del alumno: ${question.trim()}`
    const pending: CoachChat = { ...base, turns: [...base.turns, { role: 'user', text, ply }] }
    setChat(pending)
    setQuestion('')
    setAsking(true)
    setError(null)
    try {
      const answer = await askCoach(pending)
      const done = { ...pending, turns: [...pending.turns, answer] }
      setChat(done)
      saveChat(game.id, done)
    } catch (e) {
      setError((e as Error).message)
      setChat(base.turns.length ? base : null)
      setQuestion(question)
    } finally {
      setAsking(false)
    }
  }

  const resetChat = () => {
    setChat(null)
    saveChat(game.id, null)
  }

  if (status === undefined) return null
  if (status === null) {
    return (
      <section className="card coach">
        <h2>Entrenador IA</h2>
        <p className="muted">El entrenador necesita el servidor local. Arranca la app con npm run dev (o con iniciar.bat en Windows).</p>
      </section>
    )
  }
  if (!status.configured) {
    return (
      <section className="card coach">
        <h2>Entrenador IA</h2>
        <p className="muted">Para que Claude comente tus partidas, guarda tu clave de Anthropic en la pantalla de Inicio.</p>
      </section>
    )
  }

  return (
    <section className="card coach">
      <div className="coach-head">
        <h2>Entrenador IA</h2>
        <span className="badge">Claude</span>
      </div>

      {!report && !loading && (
        <>
          <p className="muted">Claude revisa la partida con los datos de Stockfish y te explica qué pasó, en qué fallaste y qué practicar.</p>
          <button className="btn primary" onClick={generate} disabled={!analysis}>
            {analysis ? 'Analizar la partida con Claude' : 'Espera a que termine Stockfish'}
          </button>
        </>
      )}
      {loading && (
        <div className="coach-loading">
          <span className="spinner" /> Claude está revisando tu partida. Puede tardar uno o dos minutos.
        </div>
      )}
      {error && <p className="msg error">{error}</p>}

      {report && (
        <div className="coach-report">
          <RichText text={report.resumen} />

          {report.momentos_clave.length > 0 && (
            <>
              <h3>Momentos clave</h3>
              <ul className="moments">
                {report.momentos_clave.map((m) => (
                  <li key={m.ply} className={m.ply === ply ? 'active' : ''}>
                    <button className="link" onClick={() => onSelectPly(m.ply)}>
                      {plyLabel(parsed, m.ply)}: {m.titulo}
                    </button>
                    <p>{m.explicacion}</p>
                    <p className="idea">
                      <strong>Antes de mover:</strong> {m.idea}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <details>
            <summary>Fases de la partida</summary>
            <h4>Apertura</h4>
            <p>{report.apertura}</p>
            <h4>Medio juego</h4>
            <p>{report.medio_juego}</p>
            <h4>Final</h4>
            <p>{report.final}</p>
          </details>

          <h3>Lecciones para tu próxima partida</h3>
          <ol className="lessons">
            {report.lecciones.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>

          {report.temas.length > 0 && (
            <div className="toolbar">
              {report.temas.map((t) => (
                <button key={t} className="btn small" onClick={() => onPractice(t)}>
                  Practicar: {themeName(t)}
                </button>
              ))}
            </div>
          )}
          <p className="coach-tip">{report.consejo}</p>
          <button className="btn small" onClick={generate} disabled={loading || !analysis}>
            Volver a pedir el informe
          </button>
        </div>
      )}

      <div className="coach-chat">
        <h3>Pregunta al entrenador</h3>
        {chat?.turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="bubble user">
              <button className="link small" onClick={() => onSelectPly(t.ply)}>
                {t.ply ? plyLabel(parsed, t.ply) : 'Posición inicial'}
              </button>
              <p>{t.text.split('Pregunta del alumno: ').pop()}</p>
            </div>
          ) : (
            <div key={i} className="bubble coach-answer">
              <RichText text={t.text} />
            </div>
          ),
        )}
        {asking && (
          <div className="coach-loading">
            <span className="spinner" /> Pensando…
          </div>
        )}
        <textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask()
            }
          }}
          placeholder={`Sobre la posición tras ${ply ? plyLabel(parsed, ply) : 'el inicio'}. Por ejemplo: ¿por qué es mala esta jugada?`}
          disabled={!analysis || asking}
        />
        <div className="toolbar">
          <button className="btn primary small" onClick={ask} disabled={!analysis || asking || !question.trim()}>
            Preguntar
          </button>
          {chat && chat.turns.length > 0 && (
            <button className="btn small" onClick={resetChat}>
              Nueva conversación
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function plyLabel(parsed: ParsedGame, ply: number): string {
  const m = parsed.moves[ply - 1]
  if (!m) return `jugada ${ply}`
  return `${Math.ceil(ply / 2)}${m.color === 'w' ? '.' : '...'} ${toSpanishSan(m.san)}`
}
