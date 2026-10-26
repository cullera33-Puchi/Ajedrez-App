import { useEffect, useState } from 'react'
import type { View } from '../App'
import { fetchChesscomStats, type RatingInfo } from '../lib/chesscom'
import { type CoachStatus, fetchCoachStatus, saveCoachKey } from '../lib/coach'
import { fetchLichessStats } from '../lib/lichess'
import { INITIAL_PUZZLE_STATS, type PuzzleStats } from '../lib/puzzles'
import type { Settings } from '../lib/settings'
import { listKeys, load, save } from '../lib/storage'
import type { GameAnalysis } from '../lib/analysis'
import { outcomeFor, type GameSummary } from '../lib/types'

interface Props {
  settings: Settings
  onSettings: (s: Settings) => void
  games: GameSummary[]
  onOpenGame: (id: string) => void
  onNavigate: (v: View) => void
}

interface StatsCache {
  chesscom?: RatingInfo[]
  lichess?: RatingInfo[]
}

export function HomeView({ settings, onSettings, games, onOpenGame, onNavigate }: Props) {
  const [cc, setCc] = useState(settings.chesscomUser)
  const [li, setLi] = useState(settings.lichessUser)
  const [stats, setStats] = useState<StatsCache>(() => load('stats', {}))
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const puzzleStats = load<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS)

  const refresh = async (s: Settings) => {
    setLoading(true)
    const errs: string[] = []
    const next: StatsCache = {}
    if (s.chesscomUser) {
      try {
        next.chesscom = await fetchChesscomStats(s.chesscomUser)
      } catch (e) {
        errs.push((e as Error).message)
      }
    }
    if (s.lichessUser) {
      try {
        next.lichess = await fetchLichessStats(s.lichessUser)
      } catch (e) {
        errs.push((e as Error).message)
      }
    }
    setStats(next)
    save('stats', next)
    setErrors(errs)
    setLoading(false)
  }

  useEffect(() => {
    if (settings.chesscomUser || settings.lichessUser) void refresh(settings)
    // Solo al entrar en la pantalla.
  }, [])

  const saveAccounts = () => {
    const s = { ...settings, chesscomUser: cc.trim(), lichessUser: li.trim() }
    onSettings(s)
    void refresh(s)
  }

  const mine = games.filter((g) => g.userColor)
  const recent = mine.slice(0, 20)
  const tally = { victoria: 0, derrota: 0, tablas: 0 }
  for (const g of recent) {
    const o = outcomeFor(g)
    if (o) tally[o]++
  }
  const lastLoss = mine.find((g) => outcomeFor(g) === 'derrota')

  // Errores graves del usuario en las partidas ya analizadas.
  const analysed = listKeys('analysis:')
    .map((k) => ({ id: k.slice('analysis:'.length), a: load<GameAnalysis | null>(k, null) }))
    .filter((x) => x.a)
  const userBlunders = analysed
    .map(({ id, a }) => {
      const g = games.find((x) => x.id === id)
      return g?.userColor ? a!.counts[g.userColor].grave : undefined
    })
    .filter((n): n is number => n !== undefined)
  const avgBlunders = userBlunders.length ? userBlunders.reduce((s, n) => s + n, 0) / userBlunders.length : undefined

  return (
    <div className="page">
      <header className="page-head">
        <h1>Inicio</h1>
        <p className="muted">Conecta tus cuentas, revisa tus partidas y entrena con problemas a tu nivel.</p>
      </header>

      <div className="grid-2">
        <section className="card">
          <h2>Tus cuentas</h2>
          <label className="field">
            <span>Usuario de Chess.com</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="por ejemplo, hikaru" />
          </label>
          <label className="field">
            <span>Usuario de Lichess (opcional)</span>
            <input value={li} onChange={(e) => setLi(e.target.value)} placeholder="por ejemplo, DrNykterstein" />
          </label>
          <button className="btn primary" onClick={saveAccounts} disabled={loading}>
            {loading ? 'Actualizando…' : 'Guardar y actualizar'}
          </button>
          {errors.map((e) => (
            <p key={e} className="msg error">
              {e}
            </p>
          ))}
          <RatingRow title="Chess.com" items={stats.chesscom} />
          <RatingRow title="Lichess" items={stats.lichess} />
        </section>

        <section className="card">
          <h2>Tu próximo paso</h2>
          <ul className="steps">
            {!mine.length && (
              <li>
                <div>
                  <strong>Importa tus partidas</strong>
                  <p className="muted">Trae tus partidas de Chess.com o Lichess para analizarlas.</p>
                </div>
                <button className="btn" onClick={() => onNavigate('partidas')}>
                  Importar
                </button>
              </li>
            )}
            {lastLoss && (
              <li>
                <div>
                  <strong>Revisa tu última derrota</strong>
                  <p className="muted">
                    Contra {lastLoss.userColor === 'white' ? lastLoss.black.name : lastLoss.white.name}. Busca el momento en que se torció la partida.
                  </p>
                </div>
                <button className="btn" onClick={() => onOpenGame(lastLoss.id)}>
                  Analizar
                </button>
              </li>
            )}
            <li>
              <div>
                <strong>Resuelve 5 problemas</strong>
                <p className="muted">
                  Tu nivel en problemas: {puzzleStats.rating}. Racha actual: {puzzleStats.streak}.
                </p>
              </div>
              <button className="btn" onClick={() => onNavigate('problemas')}>
                Entrenar
              </button>
            </li>
            <li>
              <div>
                <strong>Repasa los principios básicos</strong>
                <p className="muted">Valor de las piezas, cómo empezar la partida y la revisión antes de mover.</p>
              </div>
              <button className="btn" onClick={() => onNavigate('aprender')}>
                Aprender
              </button>
            </li>
          </ul>
        </section>

        <CoachKeyCard />

        <section className="card">
          <h2>Resumen de tus partidas</h2>
          {recent.length ? (
            <>
              <div className="kpis">
                <Kpi label="Victorias" value={tally.victoria} tone="good" />
                <Kpi label="Derrotas" value={tally.derrota} tone="bad" />
                <Kpi label="Tablas" value={tally.tablas} />
              </div>
              <p className="muted small">Últimas {recent.length} partidas importadas.</p>
              {avgBlunders !== undefined && (
                <p>
                  Errores graves por partida (media de {userBlunders.length} analizadas): <strong>{avgBlunders.toFixed(1).replace('.', ',')}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="muted">Todavía no hay partidas tuyas importadas.</p>
          )}
        </section>

        <section className="card checklist">
          <h2>Antes de cada jugada</h2>
          <p className="muted">A tu nivel, la mayoría de partidas se deciden por piezas que se quedan sin defender. Hazte estas tres preguntas:</p>
          <ol>
            <li>
              <strong>¿Qué amenaza mi rival</strong> con su última jugada?
            </li>
            <li>
              <strong>¿Dejo alguna pieza sin defender</strong> si muevo esto?
            </li>
            <li>
              <strong>¿Tengo algún jaque, captura o amenaza</strong> mejor?
            </li>
          </ol>
        </section>
      </div>
    </div>
  )
}

function RatingRow({ title, items }: { title: string; items?: RatingInfo[] }) {
  if (!items?.length) return null
  return (
    <div className="ratings">
      <h3>{title}</h3>
      <div className="kpis">
        {items.map((r) => (
          <Kpi key={r.label} label={r.label} value={r.rating} />
        ))}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  )
}

function CoachKeyCard() {
  const [status, setStatus] = useState<CoachStatus | null | undefined>(undefined)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchCoachStatus().then(setStatus)
  }, [])

  const saveKey = async () => {
    try {
      setStatus(await saveCoachKey(key))
      setKey('')
      setEditing(false)
      setMsg({ kind: 'ok', text: 'Clave guardada en este PC (archivo .env.local).' })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  return (
    <section className="card">
      <h2>Entrenador IA (Claude)</h2>
      {status === undefined && <p className="muted">Comprobando…</p>}
      {status === null && (
        <p className="muted">El entrenador necesita el servidor local. Arranca la app con npm run dev o con iniciar.bat.</p>
      )}
      {status && status.configured && !editing && (
        <>
          <p>
            <span className="badge out-victoria">Activo</span> Claude comentará tus partidas desde la pantalla de análisis.
          </p>
          <button className="btn small" onClick={() => setEditing(true)}>
            Cambiar la clave
          </button>
        </>
      )}
      {status && (!status.configured || editing) && (
        <>
          <p className="muted">
            Pega tu clave de la API de Anthropic. Se consigue en{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>{' '}
            y se guarda solo en este PC.
          </p>
          <label className="field">
            <span>Clave de la API</span>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
          </label>
          <button className="btn primary" onClick={saveKey} disabled={!key.trim()}>
            Guardar clave
          </button>
        </>
      )}
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
    </section>
  )
}
