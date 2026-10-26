import { useState } from 'react'
import type { View } from '../App'
import { fetchChesscomGames } from '../lib/chesscom'
import { fetchLichessGames } from '../lib/lichess'
import { gameFromPgn } from '../lib/pgnImport'
import type { Settings } from '../lib/settings'
import { listKeys } from '../lib/storage'
import { outcomeFor, type GameSummary } from '../lib/types'

interface Props {
  settings: Settings
  games: GameSummary[]
  onAddGames: (g: GameSummary[]) => void
  onOpenGame: (id: string) => void
  onNavigate: (v: View) => void
}

type Filter = 'todas' | 'victoria' | 'derrota' | 'tablas'

const SOURCE_LABEL: Record<GameSummary['source'], string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
  pgn: 'PGN',
  demo: 'Ejemplo',
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

const OUTCOME_LABEL = { victoria: 'Victoria', derrota: 'Derrota', tablas: 'Tablas' }

export function GamesView({ settings, games, onAddGames, onOpenGame, onNavigate }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [filter, setFilter] = useState<Filter>('todas')
  const [showPgn, setShowPgn] = useState(false)
  const [pgn, setPgn] = useState('')
  const analysed = new Set(listKeys('analysis:').map((k) => k.slice('analysis:'.length)))

  const run = async (label: string, fn: () => Promise<GameSummary[]>) => {
    setBusy(label)
    setMsg(null)
    try {
      const g = await fn()
      onAddGames(g)
      setMsg({ kind: 'ok', text: g.length ? `Importadas ${g.length} partidas de ${label}.` : `No hay partidas recientes en ${label}.` })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const importPgn = () => {
    try {
      const g = gameFromPgn(pgn, settings.chesscomUser || settings.lichessUser)
      onAddGames([g])
      setPgn('')
      setShowPgn(false)
      onOpenGame(g.id)
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  const list = games.filter((g) => filter === 'todas' || outcomeFor(g) === filter)
  const noAccounts = !settings.chesscomUser && !settings.lichessUser

  return (
    <div className="page">
      <header className="page-head">
        <h1>Mis partidas</h1>
        <p className="muted">Importa tus partidas y elige una para analizarla con Stockfish.</p>
      </header>

      <section className="card">
        <div className="toolbar">
          <button
            className="btn primary"
            disabled={!settings.chesscomUser || !!busy}
            onClick={() => run('Chess.com', () => fetchChesscomGames(settings.chesscomUser))}
          >
            {busy === 'Chess.com' ? 'Importando…' : 'Importar de Chess.com'}
          </button>
          <button
            className="btn primary"
            disabled={!settings.lichessUser || !!busy}
            onClick={() => run('Lichess', () => fetchLichessGames(settings.lichessUser))}
          >
            {busy === 'Lichess' ? 'Importando…' : 'Importar de Lichess'}
          </button>
          <button className="btn" onClick={() => setShowPgn((v) => !v)}>
            Pegar PGN
          </button>
        </div>
        {noAccounts && (
          <p className="muted small">
            Para importar, indica antes tu usuario en{' '}
            <button className="link" onClick={() => onNavigate('inicio')}>
              Inicio
            </button>
            . Mientras tanto puedes probar con las partidas de ejemplo.
          </p>
        )}
        {showPgn && (
          <div className="pgn-box">
            <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} rows={6} placeholder="Pega aquí el PGN de una partida" />
            <button className="btn primary" onClick={importPgn} disabled={!pgn.trim()}>
              Analizar este PGN
            </button>
          </div>
        )}
        {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      </section>

      <section className="card">
        <div className="tabs">
          {(['todas', 'victoria', 'derrota', 'tablas'] as Filter[]).map((f) => (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'todas' ? 'Todas' : f === 'victoria' ? 'Victorias' : f === 'derrota' ? 'Derrotas' : 'Tablas'}
            </button>
          ))}
        </div>
        <table className="games">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th>Blancas</th>
              <th>Negras</th>
              <th>Resultado</th>
              <th>Ritmo</th>
              <th>Apertura</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((g) => {
              const o = outcomeFor(g)
              return (
                <tr key={g.id} onClick={() => onOpenGame(g.id)}>
                  <td>{new Date(g.date).toLocaleDateString('es-ES')}</td>
                  <td>
                    <span className={`badge src-${g.source}`}>{SOURCE_LABEL[g.source]}</span>
                  </td>
                  <td className={g.userColor === 'white' ? 'me' : ''}>
                    {g.white.name} {g.white.rating ? <span className="muted">({g.white.rating})</span> : null}
                  </td>
                  <td className={g.userColor === 'black' ? 'me' : ''}>
                    {g.black.name} {g.black.rating ? <span className="muted">({g.black.rating})</span> : null}
                  </td>
                  <td>{o ? <span className={`badge out-${o}`}>{OUTCOME_LABEL[o]}</span> : g.result.replace('1/2-1/2', '½-½')}</td>
                  <td>{g.timeClass ? (TIME_LABEL[g.timeClass] ?? g.timeClass) : ''}</td>
                  <td className="opening">{g.opening ?? ''}</td>
                  <td>
                    <button className="btn small">{analysed.has(g.id) ? 'Ver análisis' : 'Analizar'}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <p className="muted">No hay partidas con este filtro.</p>}
      </section>
    </div>
  )
}
