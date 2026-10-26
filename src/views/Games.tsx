import { useState } from 'react'
import type { View } from '../App'
import { importChesscomHistory, type ImportProgress, ImportError } from '../lib/chesscom'
import { fetchLichessGames } from '../lib/lichess'
import { gameFromPgn, gamesFromPgnFile } from '../lib/pgnImport'
import type { Settings } from '../lib/settings'
import { getSummary } from '../lib/games'
import { outcomeFor, type GameSummary } from '../lib/types'

interface Props {
  settings: Settings
  onSettings: (s: Settings) => void
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
  bot: 'Bot',
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

export function GamesView({ settings, onSettings, games, onAddGames, onOpenGame, onNavigate }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string; detail?: string } | null>(null)
  const [ccUser, setCcUser] = useState(settings.chesscomUser)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [limit, setLimit] = useState(50)
  const [filter, setFilter] = useState<Filter>('todas')
  const [showPgn, setShowPgn] = useState(false)
  const [pgn, setPgn] = useState('')

  const run = async (label: string, fn: () => Promise<GameSummary[]>) => {
    setBusy(label)
    setMsg(null)
    try {
      const g = await fn()
      onAddGames(g)
      setMsg({ kind: 'ok', text: g.length ? `Importadas ${g.length} partidas de ${label}.` : `No hay partidas recientes en ${label}.` })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message, detail: e instanceof ImportError ? e.detail : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const importChesscom = async () => {
    const user = ccUser.trim()
    if (!user || busy) return
    if (user !== settings.chesscomUser) onSettings({ ...settings, chesscomUser: user })
    setBusy('Chess.com')
    setMsg(null)
    try {
      const r = await importChesscomHistory(user, onAddGames, setProgress)
      setMsg({
        kind: 'ok',
        text: r.games
          ? `Importadas ${r.games} partidas de Chess.com (${r.months} ${r.months === 1 ? 'mes revisado' : 'meses revisados'}).`
          : 'No hay partidas nuevas en Chess.com.',
      })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message, detail: e instanceof ImportError ? e.detail : String(e) })
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const importLichess = () => {
    const user = settings.lichessUser.trim().toLowerCase()
    const mine = games.filter((g) => g.source === 'lichess' && (g.white.name.toLowerCase() === user || g.black.name.toLowerCase() === user))
    const since = mine.length ? Math.max(...mine.map((g) => g.date)) : undefined
    void run('Lichess', () => fetchLichessGames(settings.lichessUser, 300, since))
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    const { games: imported, failed } = gamesFromPgnFile(await file.text(), ccUser.trim() || settings.lichessUser)
    onAddGames(imported)
    setMsg(
      imported.length
        ? { kind: 'ok', text: `Importadas ${imported.length} partidas del archivo${failed ? ` (${failed} no se han podido leer)` : ''}.` }
        : { kind: 'error', text: 'El archivo no contiene partidas PGN válidas.' },
    )
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
        <div className="import-row">
          <input
            value={ccUser}
            onChange={(e) => setCcUser(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && importChesscom()}
            placeholder="Usuario de Chess.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Usuario de Chess.com"
          />
          <button className="btn primary" disabled={!ccUser.trim() || !!busy} onClick={importChesscom}>
            {busy === 'Chess.com' ? 'Importando…' : 'Importar de Chess.com'}
          </button>
        </div>
        <div className="toolbar">
          <button
            className="btn primary"
            disabled={!settings.lichessUser || !!busy}
            onClick={importLichess}
          >
            {busy === 'Lichess' ? 'Importando…' : 'Importar de Lichess'}
          </button>
          <button className="btn" onClick={() => setShowPgn((v) => !v)}>
            Pegar PGN
          </button>
          <label className="btn file-btn">
            Importar archivo PGN
            <input type="file" accept=".pgn,text/plain,application/x-chess-pgn" onChange={(e) => importFile(e.target.files?.[0])} hidden />
          </label>
        </div>
        {noAccounts && (
          <p className="muted small">
            Escribe tu usuario de Chess.com y pulsa Importar. Para Lichess, indica tu usuario en{' '}
            <button className="link" onClick={() => onNavigate('inicio')}>
              Inicio
            </button>
            .
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
        {progress && progress.total > 0 && (
          <div className="progress">
            <div className="progress-bar">
              <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <span className="small">
              Descargando de Chess.com: mes {Math.min(progress.done + 1, progress.total)} de {progress.total}
            </span>
          </div>
        )}
        {msg && (
          <div className={`msg ${msg.kind}`}>
            <p>{msg.text}</p>
            {msg.detail && (
              <details>
                <summary className="small">Detalle técnico</summary>
                <code className="detail">{msg.detail}</code>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="tabs">
          {(['todas', 'victoria', 'derrota', 'tablas'] as Filter[]).map((f) => (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setLimit(50) }}>
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
            {list.slice(0, limit).map((g) => {
              const o = outcomeFor(g)
              return (
                <tr key={g.id} onClick={() => onOpenGame(g.id)}>
                  <td className="date">{new Date(g.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                  <td>
                    <span className={`badge src-${g.source}`}>{SOURCE_LABEL[g.source]}</span>
                  </td>
                  <td className={g.userColor === 'white' ? 'me' : ''}>
                    <span className="pname">{g.white.name}</span> {g.white.rating ? <span className="muted rating">({g.white.rating})</span> : null}
                  </td>
                  <td className={g.userColor === 'black' ? 'me' : ''}>
                    <span className="pname">{g.black.name}</span> {g.black.rating ? <span className="muted rating">({g.black.rating})</span> : null}
                  </td>
                  <td>{o ? <span className={`badge out-${o}`}>{OUTCOME_LABEL[o]}</span> : g.result.replace('1/2-1/2', '½-½')}</td>
                  <td>{g.timeClass ? (TIME_LABEL[g.timeClass] ?? g.timeClass) : ''}</td>
                  <td className="opening">{g.opening ?? ''}</td>
                  <td>
                    <button className="btn small">{getSummary(g.id) ? 'Ver análisis' : 'Analizar'}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <p className="muted">No hay partidas con este filtro.</p>}
        {list.length > limit && (
          <button className="btn more-btn" onClick={() => setLimit((l) => l + 50)}>
            Ver más ({list.length - limit} restantes)
          </button>
        )}
        <p className="muted small">{list.length} partidas.</p>
      </section>
    </div>
  )
}
