import { useEffect, useReducer, useState } from 'react'
import { activitySummary, formatMinutes, GOAL_CHOICES, loadActivityTime, loadGoal, onActivityChange, saveGoal } from '../lib/playTime'
import type { GameSummary } from '../lib/types'

const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** Tarjeta de Inicio y Progreso: meta del día, tiempo de la semana y del mes, y racha. */
export function PlayTimeCard({ games, className = '' }: { games: GameSummary[]; className?: string }) {
  const [now] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  const [, refresh] = useReducer((x: number) => x + 1, 0)
  useEffect(() => onActivityChange(refresh), [])

  const s = activitySummary(loadActivityTime(), games, loadGoal(), now)
  const goalSecs = s.goal * 60
  const done = s.today.total >= goalSecs
  const pct = Math.min(100, Math.round((s.today.total / goalSecs) * 100))
  const left = Math.max(60, goalSecs - s.today.total)

  return (
    <section className={`card play-time ${className}`}>
      <h2>Tu tiempo de juego</h2>
      <p className="play-time-today">
        Hoy llevas <strong>{formatMinutes(s.today.total)}</strong> de {s.goal} min.{' '}
        {done ? 'Meta cumplida.' : `Te faltan ${formatMinutes(left)} para la meta.`}
      </p>
      <div className={`goal-bar ${done ? 'done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Meta de hoy">
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{formatMinutes(s.week)}</span>
          <span className="kpi-label">Esta semana</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{formatMinutes(s.month)}</span>
          <span className="kpi-label">Este mes</span>
        </div>
        <div className="kpi good">
          <span className="kpi-value">{days(s.streak)}</span>
          <span className="kpi-label">Racha</span>
        </div>
      </div>

      <div className="week-strip" aria-label="Días de esta semana">
        {s.weekDays.map((d) => (
          <div key={d.day} className={`week-day ${d.met ? 'met' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}`} title={d.future ? '' : `${formatMinutes(d.total)}${d.met ? ', meta cumplida' : ''}`}>
            <span className="week-bar">
              <span style={{ height: `${Math.min(100, Math.round((d.total / goalSecs) * 100))}%` }} />
            </span>
            <span className="week-label">{d.label}</span>
          </div>
        ))}
      </div>

      <p className="muted small">
        {s.today.total > 0 && `Hoy: ${formatMinutes(s.today.app)} en la app y ${formatMinutes(s.today.games)} en partidas online. `}
        Tu mejor racha: {days(s.best)} con la meta cumplida.
      </p>

      {editing ? (
        <div className="goal-choices">
          <span className="small">Meta diaria:</span>
          <div className="chips">
            {GOAL_CHOICES.map((m) => (
              <button
                key={m}
                className={`chip ${m === s.goal ? 'active' : ''}`}
                aria-pressed={m === s.goal}
                onClick={() => {
                  saveGoal(m)
                  setEditing(false)
                }}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="link small" onClick={() => setEditing(true)}>
          Cambiar la meta diaria ({s.goal} min)
        </button>
      )}
      <p className="muted small">Cuenta el tiempo activo en Entrenar, Jugar, Problemas, Aprender y Análisis, y la duración de tus partidas de Chess.com y Lichess.</p>
    </section>
  )
}
