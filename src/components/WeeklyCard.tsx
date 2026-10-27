import { useState } from 'react'
import { allSummaries } from '../lib/games'
import { loadLog } from '../lib/puzzleLog'
import { themeName } from '../lib/puzzles'
import { loadDays } from '../lib/training'
import type { GameSummary } from '../lib/types'
import { type WeekStats, weeklySummary } from '../lib/weekly'

const TIME_LABEL: Record<string, string> = { bullet: 'bala', blitz: 'blitz', rapid: 'rápidas', classical: 'clásicas', daily: 'diarias' }

/** «1 victoria», «2 victorias»; las tablas no cambian. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/** Comparación con la semana pasada, en palabras cortas. */
function versus(cur: number | null, prev: number | null, unit = '') {
  if (cur === null || prev === null) return null
  const diff = Math.round(cur - prev)
  if (!diff) return 'igual que la semana pasada'
  return `${signed(diff)}${unit} frente a la semana pasada`
}

/** Tarjeta «Tu semana» de Inicio y Progreso. */
export function WeeklyCard({ games, className = '' }: { games: GameSummary[]; className?: string }) {
  const [now] = useState(() => Date.now())
  const summaries = new Map(allSummaries().map((s) => [s.id, s]))
  const { current: c, previous: p, days } = weeklySummary(now, games, summaries, loadLog(), loadDays())
  const empty = (s: WeekStats) => !s.games && !s.puzzles && !s.trainingDays
  if (empty(c) && empty(p)) return null

  const lines: string[] = []
  if (c.rating !== undefined && c.timeClass)
    lines.push(`Rating en ${TIME_LABEL[c.timeClass] ?? c.timeClass}: ${c.rating}${c.ratingDelta ? ` (${signed(c.ratingDelta)} esta semana)` : ''}.`)
  if (c.puzzleRating !== undefined) lines.push(`Nivel de problemas: ${c.puzzleRating}${c.puzzleDelta ? ` (${signed(c.puzzleDelta)})` : ''}.`)
  if (c.topTheme) lines.push(`Lo que más se repite en tus errores: ${themeName(c.topTheme).toLowerCase()}.`)
  const acc = versus(c.accuracy, p.accuracy, ' puntos')

  return (
    <section className={`card weekly-card ${className}`}>
      <h2>Tu semana</h2>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{c.games}</span>
          <span className="kpi-label">{c.games === 1 ? 'Partida' : 'Partidas'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{c.accuracy !== null ? `${Math.round(c.accuracy)} %` : '-'}</span>
          <span className="kpi-label">Precisión</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{c.puzzles}</span>
          <span className="kpi-label">Problemas</span>
        </div>
        <div className="kpi good">
          <span className="kpi-value">
            {c.trainingDays}/{days}
          </span>
          <span className="kpi-label">Días entrenados</span>
        </div>
      </div>
      <p className="small">
        {c.games ? `${count(c.w, 'victoria')}, ${count(c.d, 'tablas', 'tablas')} y ${count(c.l, 'derrota')}.` : 'Aún no has jugado partidas esta semana.'}
        {c.puzzles ? ` Problemas acertados: ${c.puzzleWins} de ${c.puzzles}.` : ''}
      </p>
      {lines.map((l) => (
        <p key={l} className="small">
          {l}
        </p>
      ))}
      <p className="muted small">
        La semana pasada: {p.games} {p.games === 1 ? 'partida' : 'partidas'}, {p.puzzles} problemas y {p.trainingDays} {p.trainingDays === 1 ? 'día' : 'días'} de entrenamiento
        {acc ? `. Precisión: ${acc}` : ''}.
      </p>
    </section>
  )
}
