import { useState } from 'react'
import { dailyStats, type DayStats, type PuzzleAttempt, ratingChange } from '../lib/puzzleLog'
import { usePersistentState } from '../lib/storage'

interface Props {
  log: PuzzleAttempt[]
  rating: number
}

const PERIODS = [7, 30, 90]
const W = 600
const H_LINE = 120
const H_BARS = 90
const PAD = 6

const shortDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number)
  return `${d}/${m}`
}
const longDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

const pct = (wins: number, total: number) => (total ? `${Math.round((wins / total) * 100)} %` : 'sin datos')

/** Evolución de los problemas: nivel al final de cada día y problemas hechos por día. */
export function PuzzleProgress({ log, rating }: Props) {
  const [days, setDays] = usePersistentState('progressDays', 30)
  const [sel, setSel] = useState<number | null>(null)
  const [allRows, setAllRows] = useState(false)
  const stats = dailyStats(log, days)
  const today = stats[stats.length - 1]
  const total = stats.reduce((s, d) => s + d.total, 0)
  const wins = stats.reduce((s, d) => s + d.wins, 0)
  const delta = ratingChange(log, stats)

  const n = stats.length
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD))
  const ratings = stats.map((d) => d.rating).filter((r): r is number => r !== null)
  const lo = ratings.length ? Math.min(...ratings) - 20 : 0
  const hi = ratings.length ? Math.max(...ratings) + 20 : 1
  const y = (r: number) => PAD + (1 - (r - lo) / (hi - lo)) * (H_LINE - 2 * PAD)
  const line = stats
    .map((d, i) => (d.rating === null ? null : `${x(i).toFixed(1)},${y(d.rating).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')
  const maxCount = Math.max(1, ...stats.map((d) => d.total))
  const barW = Math.max(2, (W - 2 * PAD) / n - 2)
  const bh = (c: number) => (c / maxCount) * (H_BARS - PAD)

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round((((e.clientX - r.left) / r.width) * W - PAD) / ((W - 2 * PAD) / Math.max(1, n - 1)))
    setSel(Math.min(n - 1, Math.max(0, i)))
  }
  const shown: DayStats | null = sel !== null && sel < n ? stats[sel] : null
  const active = stats.filter((d) => d.total > 0).reverse()

  return (
    <section className="card evolution" id="evolucion">
      <h3>Tu evolución</h3>
      <div className="segmented" role="tablist" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={days === p} className={days === p ? 'active' : ''} onClick={() => (setDays(p), setSel(null))}>
            {p} días
          </button>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{today.total}</span>
          <span className="kpi-label">Hoy</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{total}</span>
          <span className="kpi-label">En {days} días</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{total ? pct(wins, total) : '-'}</span>
          <span className="kpi-label">Acierto</span>
        </div>
        <div className={`kpi ${delta === null ? '' : delta >= 0 ? 'good' : 'bad'}`}>
          <span className="kpi-value">{delta === null ? '-' : `${delta >= 0 ? '+' : ''}${delta}`}</span>
          <span className="kpi-label">Nivel</span>
        </div>
      </div>

      {!log.length ? (
        <p className="muted small">Aún no hay datos. A partir de ahora, cada problema que hagas queda registrado con su fecha.</p>
      ) : (
        <>
          <p className="chart-title">Nivel al final de cada día</p>
          <svg className="evo-chart" viewBox={`0 0 ${W} ${H_LINE}`} preserveAspectRatio="none" onPointerDown={pick} role="img" aria-label="Evolución del nivel">
            {ratings.length > 0 && (
              <>
                <line x1={0} x2={W} y1={y(rating)} y2={y(rating)} className="evo-grid" />
                <polyline points={line} className="evo-line" vectorEffect="non-scaling-stroke" />
              </>
            )}
            {shown && <line x1={x(sel!)} x2={x(sel!)} y1={0} y2={H_LINE} className="evo-cursor" vectorEffect="non-scaling-stroke" />}
          </svg>
          {ratings.length > 0 && (
            <p className="small muted chart-note">
              Entre {Math.round(lo + 20)} y {Math.round(hi - 20)}. La línea discontinua es tu nivel actual.
            </p>
          )}

          <p className="chart-title">Problemas por día</p>
          <svg className="evo-chart" viewBox={`0 0 ${W} ${H_BARS}`} preserveAspectRatio="none" onPointerDown={pick} role="img" aria-label="Problemas por día">
            {stats.map((d, i) =>
              d.total ? (
                <g key={d.day}>
                  <rect x={x(i) - barW / 2} y={H_BARS - bh(d.total)} width={barW} height={Math.max(0, bh(d.total - d.wins) - (d.wins ? 2 : 0))} className="bar-fail" />
                  <rect x={x(i) - barW / 2} y={H_BARS - bh(d.wins)} width={barW} height={bh(d.wins)} className="bar-win" />
                </g>
              ) : null,
            )}
            {shown && <line x1={x(sel!)} x2={x(sel!)} y1={0} y2={H_BARS} className="evo-cursor" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="chart-axis small muted">
            <span>{shortDay(stats[0].day)}</span>
            <span className="legend">
              <i className="sw win" /> Acertados <i className="sw fail" /> Fallados
            </span>
            <span>{shortDay(today.day)}</span>
          </div>

          <p className="small evo-readout">
            {shown ? (
              <>
                <strong>{longDay(shown.day)}:</strong>{' '}
                {shown.total
                  ? `${shown.total} problemas, ${shown.wins} acertados${shown.avgDifficulty ? `, dificultad media ${shown.avgDifficulty}` : ''}${shown.rating ? `, nivel ${shown.rating}` : ''}.`
                  : 'sin problemas.'}
              </>
            ) : (
              <span className="muted">Toca un gráfico para ver el detalle de un día.</span>
            )}
          </p>

          {active.length > 0 && (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Hechos</th>
                  <th>Acierto</th>
                  <th>Dificultad</th>
                  <th>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {(allRows ? active : active.slice(0, 7)).map((d) => (
                  <tr key={d.day}>
                    <td>{shortDay(d.day)}</td>
                    <td>{d.total}</td>
                    <td>{pct(d.wins, d.total)}</td>
                    <td>{d.avgDifficulty ?? '-'}</td>
                    <td>{d.rating ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {active.length > 7 && (
            <button className="link small" onClick={() => setAllRows((v) => !v)}>
              {allRows ? 'Ver menos días' : `Ver los ${active.length} días`}
            </button>
          )}
        </>
      )}

      <details className="small">
        <summary>¿De dónde sale tu nivel?</summary>
        <p className="muted">
          Empieza en 600 y se ajusta con cada problema, como el Elo: sube más si aciertas uno difícil y baja más si fallas uno fácil. La dificultad
          de cada problema viene de su origen (el set de iniciación o la puntuación de Lichess). En los 20 primeros cambia más rápido, para
          encontrar antes tu nivel real. Si usas la pista o ves la solución, cuenta como fallo. Los problemas de <em>Mis errores</em> no cambian
          tu nivel, pero sí cuentan en los problemas por día.
        </p>
      </details>
    </section>
  )
}

