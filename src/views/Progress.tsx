import { useEffect, useMemo, useState } from 'react'
import type { View } from '../App'
import { TrendChart } from '../components/TrendChart'
import { WeeklyCard } from '../components/WeeklyCard'
import { formatSeconds, timingAdvice, type TimingSummary, totalTiming } from '../lib/clock'
import { allSummaries, backfillTiming } from '../lib/games'
import { isOnlineGame, openingStats, ratingSeries, results, score, themeTotals, timeClasses, weeklyAccuracy } from '../lib/progress'
import { themeName } from '../lib/puzzles'
import { usePersistentState } from '../lib/storage'
import { opponentOf, outcomeFor, type GameSummary } from '../lib/types'

interface Props {
  games: GameSummary[]
  onNavigate: (v: View) => void
  onOpenGame: (id: string) => void
  onPractice: (theme: string) => void
}

const TIME_LABEL: Record<string, string> = {
  bullet: 'Bala',
  blitz: 'Blitz',
  rapid: 'Rápida',
  classical: 'Clásica',
  daily: 'Diaria',
  correspondence: 'Correspondencia',
  ultraBullet: 'Ultrabala',
}
const PERIODS = [
  { days: 90, label: '3 meses' },
  { days: 365, label: '12 meses' },
  { days: 0, label: 'Todo' },
]
const OUTCOME_TEXT = { victoria: 'victoria', derrota: 'derrota', tablas: 'tablas' }

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })

export function ProgressView({ games, onNavigate, onOpenGame, onPractice }: Props) {
  const online = useMemo(() => games.filter(isOnlineGame), [games])
  const tcs = timeClasses(online)
  const [days, setDays] = usePersistentState('progressPeriod', 90)
  const [storedTc, setTc] = usePersistentState('progressTimeClass', '')
  const tc = tcs.some((t) => t.tc === storedTc) ? storedTc : (tcs[0]?.tc ?? '')

  const [summaries, setSummaries] = useState(() => new Map(allSummaries().map((s) => [s.id, s])))
  // Los análisis guardados antes de medir el tiempo se completan al abrir la pantalla.
  useEffect(() => {
    let cancelled = false
    void backfillTiming().then((n) => {
      if (n && !cancelled) setSummaries(new Map(allSummaries().map((s) => [s.id, s])))
    })
    return () => {
      cancelled = true
    }
  }, [])
  const [now] = useState(() => Date.now())
  const since = days ? now - days * 86_400_000 : 0
  const inPeriod = online.filter((g) => g.date >= since)
  const ofTc = inPeriod.filter((g) => g.timeClass === tc)

  if (!online.length) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Tu progreso</h1>
        </header>
        <section className="card empty">
          <p>Importa tus partidas de Chess.com o Lichess para ver tu evolución.</p>
          <button className="btn primary" onClick={() => onNavigate('partidas')}>
            Ir a mis partidas
          </button>
        </section>
      </div>
    )
  }

  const res = results(inPeriod)
  const series = ratingSeries(ofTc)
  const last = series[series.length - 1]
  const first = series[0]
  const weekly = weeklyAccuracy(inPeriod, summaries)
  const analyzed = inPeriod.filter((g) => summaries.has(g.id))
  const avgAcc = analyzed.length ? analyzed.reduce((s, g) => s + summaries.get(g.id)!.accuracy[g.userColor!], 0) / analyzed.length : null
  const themes = themeTotals(inPeriod, summaries).slice(0, 6)
  const timing = totalTiming(inPeriod.map((g) => summaries.get(g.id)?.timing).filter((x): x is TimingSummary => Boolean(x)))
  const advice = timingAdvice(timing)
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '-')
  const openings = openingStats(inPeriod)
  const worst = openings.filter((o) => o.score < 50).slice(0, 5)
  const best = [...openings].sort((a, b) => b.score - a.score || b.n - a.n).filter((o) => o.score >= 50).slice(0, 3)

  return (
    <div className="page progress-page">
      <header className="page-head">
        <h1>Tu progreso</h1>
        <p className="muted">Solo con tus partidas de Chess.com y Lichess. Las partidas contra bots no cuentan.</p>
      </header>

      <section className="card">
        <div className="segmented" role="tablist" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p.days} className={days === p.days ? 'active' : ''} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="kpi-value">{res.n}</span>
            <span className="kpi-label">Partidas</span>
          </div>
          <div className="kpi">
            <span className="kpi-value">{res.n ? `${Math.round((res.w / res.n) * 100)} %` : '-'}</span>
            <span className="kpi-label">Victorias</span>
          </div>
          <div className="kpi">
            <span className="kpi-value">{avgAcc !== null ? `${Math.round(avgAcc)} %` : '-'}</span>
            <span className="kpi-label">Precisión</span>
          </div>
        </div>
        <p className="muted small">
          {res.w} victorias, {res.d} tablas y {res.l} derrotas.{' '}
          {analyzed.length < inPeriod.length && `Precisión de las ${analyzed.length} partidas ya analizadas.`}
        </p>
      </section>

      <WeeklyCard games={games} />

      <section className="card">
        <h2>Rating</h2>
        {tcs.length > 1 && (
          <div className="chips">
            {tcs.map((t) => (
              <button key={t.tc} className={`chip ${t.tc === tc ? 'active' : ''}`} onClick={() => setTc(t.tc)}>
                {TIME_LABEL[t.tc] ?? t.tc} ({t.count})
              </button>
            ))}
          </div>
        )}
        {last && first && (
          <p>
            <strong className="big-number">{last.rating}</strong>{' '}
            <span className={last.rating - first.rating >= 0 ? 'good-text' : 'bad-text'}>
              {last.rating - first.rating >= 0 ? '+' : ''}
              {last.rating - first.rating}
            </span>{' '}
            <span className="muted small">en el periodo ({TIME_LABEL[tc] ?? tc})</span>
          </p>
        )}
        <TrendChart
          name="Evolución del rating"
          points={series.map((p) => ({
            x: p.date,
            y: p.rating,
            label: `${fmtDate(p.date)}: ${p.rating}, ${OUTCOME_TEXT[outcomeFor(p.game) ?? 'tablas']} contra ${opponentOf(p.game)}.`,
          }))}
        />
      </section>

      <section className="card">
        <h2>Precisión por semana</h2>
        {weekly.length >= 2 ? (
          <>
            <TrendChart
              name="Precisión media por semana"
              format={(v) => `${Math.round(v)} %`}
              points={weekly.map((w) => ({
                x: w.week,
                y: w.accuracy,
                label: `Semana del ${fmtDate(w.week)}: ${Math.round(w.accuracy)} % de precisión en ${w.n} ${w.n === 1 ? 'partida' : 'partidas'}, ${w.graves.toFixed(1).replace('.', ',')} errores graves por partida.`,
              }))}
            />
            <p className="muted small">Cuanto más alta, mejor. Para principiantes, pasar de 60 a 70 % ya es un gran salto.</p>
          </>
        ) : (
          <p className="muted small">Hacen falta partidas analizadas de al menos dos semanas. El análisis automático las va procesando con la app abierta.</p>
        )}
      </section>

      <section className="card">
        <h2>Lo que más fallas</h2>
        {themes.length ? (
          <div className="reco">
            {themes.map((t) => (
              <button key={t.theme} className="reco-item" onClick={() => onPractice(t.theme)}>
                <span>{themeName(t.theme)}</span>
                <span className="muted small">
                  {t.count} {t.count === 1 ? 'error' : 'errores'}, practicar
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Aún no hay partidas analizadas en este periodo.</p>
        )}
      </section>

      <section className="card">
        <h2>Gestión del tiempo</h2>
        {timing.games ? (
          <>
            <div className="kpis">
              <div className="kpi">
                <span className="kpi-value">{pct(timing.quickErrors, timing.errors)}</span>
                <span className="kpi-label">Errores con prisa</span>
              </div>
              <div className="kpi">
                <span className="kpi-value">{timing.moves ? formatSeconds(timing.spent / timing.moves) : '-'}</span>
                <span className="kpi-label">Por jugada</span>
              </div>
              <div className="kpi">
                <span className="kpi-value">{timing.lostOnTimeGames}</span>
                <span className="kpi-label">Derrotas por tiempo</span>
              </div>
            </div>
            <p className="muted small">
              En {timing.games} {timing.games === 1 ? 'partida analizada' : 'partidas analizadas'} con reloj. Con prisa es menos del 1 % del tiempo inicial (6 segundos en una partida
              de 10 minutos): así jugaste el {pct(timing.quick, timing.moves)} de tus jugadas, y con poco tiempo en el reloj, el {pct(timing.low, timing.moves)}.
            </p>
            {advice && <p className="msg info">{advice}</p>}
          </>
        ) : (
          <p className="muted small">Aún no hay partidas analizadas con reloj en este periodo. Las de Chess.com lo traen; las de Lichess, desde las que se importen a partir de ahora.</p>
        )}
      </section>

      <section className="card">
        <h2>Aperturas</h2>
        {openings.length ? (
          <>
            {worst.length > 0 && <OpeningTable title="Con peor resultado" rows={worst} />}
            {best.length > 0 && <OpeningTable title="Con mejor resultado" rows={best} />}
            <p className="muted small">Agrupadas por familia y color, con al menos 3 partidas. La puntuación cuenta 1 por victoria y 0,5 por tablas.</p>
            {worst[0] && (
              <button
                className="btn small"
                onClick={() => {
                  const g = [...inPeriod]
                    .filter((x) => x.userColor === worst[0].color && x.opening?.startsWith(worst[0].opening) && outcomeFor(x) === 'derrota')
                    .sort((a, b) => b.date - a.date)[0]
                  if (g) onOpenGame(g.id)
                }}
              >
                Revisar la última derrota con {worst[0].opening}
              </button>
            )}
          </>
        ) : (
          <p className="muted small">Hacen falta al menos 3 partidas con la misma apertura y color.</p>
        )}
      </section>
    </div>
  )
}

function OpeningTable({ title, rows }: { title: string; rows: ReturnType<typeof openingStats> }) {
  return (
    <>
      <p className="chart-title">{title}</p>
      <table className="evo-table openings-table">
        <thead>
          <tr>
            <th>Apertura</th>
            <th>Color</th>
            <th>Partidas</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={`${o.color}${o.opening}`}>
              <td className="opening-name">{o.opening}</td>
              <td>{o.color === 'white' ? 'Blancas' : 'Negras'}</td>
              <td>{o.n}</td>
              <td>{score(o)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
