import { useState } from 'react'
import type { View } from '../App'
import { importChesscomHistory, type ImportProgress, ImportError } from '../lib/chesscom'
import { fetchLichessGames } from '../lib/lichess'
import { gameFromPgn, gamesFromPgnFile } from '../lib/pgnImport'
import type { Settings } from '../lib/settings'
import { getSummary } from '../lib/games'
import { setBackgroundEnabled, useBackgroundState } from '../lib/background'
import { load, save, usePersistentState } from '../lib/storage'
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

/** Las partidas reales (Chess.com y Lichess) y las jugadas contra bots se muestran por separado. */
type GameGroup = 'online' | 'bots' | 'otras'

const GROUP_LABEL: Record<GameGroup, string> = { online: 'Chess.com y Lichess', bots: 'Contra bots', otras: 'Otras' }

const groupOf = (g: GameSummary): GameGroup => (g.source === 'bot' ? 'bots' : g.source === 'chesscom' || g.source === 'lichess' ? 'online' : 'otras')

const SOURCE_LABEL: Record<GameSummary['source'], string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
  pgn: 'PGN',
  demo: 'Ejemplo',
  posicion: 'Posición',
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
  const bg = useBackgroundState()
  const [filter, setFilter] = useState<Filter>('todas')
  const [group, setGroup] = usePersistentState<GameGroup>('gamesGroup', 'online')
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
    // Se guarda hasta dónde se importó (no la fecha de la última partida guardada: las jugadas
    // desde la app también son de Lichess y harían saltarse el historial anterior).
    const until = load<Record<string, number>>('lichessImportedUntil', {})
    void run('Lichess', async () => {
      const g = await fetchLichessGames(settings.lichessUser, 300, until[user])
      const newest = Math.max(until[user] ?? 0, ...g.map((x) => x.date))
      if (newest) save('lichessImportedUntil', { ...until, [user]: newest })
      return g
    })
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

  const counts = { online: 0, bots: 0, otras: 0 }
  for (const g of games) counts[groupOf(g)]++
  const list = games.filter((g) => groupOf(g) === group && (filter === 'todas' || outcomeFor(g) === filter))
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
          <button className="btn" onClick={() => onNavigate('escanear')}>
            Escanear captura
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

      {(bg.pending > 0 || bg.current) && (
        <section className="card bg-card">
          <div className="bg-head">
            <strong>Análisis automático</strong>
            <button className="btn small" onClick={() => setBackgroundEnabled(!bg.enabled)}>
              {bg.enabled ? 'Pausar' : 'Reanudar'}
            </button>
          </div>
          <p className="muted small">
            {bg.analyzed} de {bg.analyzed + bg.pending} partidas tuyas analizadas.{' '}
            {!bg.enabled
              ? 'En pausa.'
              : bg.current
                ? `Analizando la partida contra ${bg.current.userColor === 'white' ? bg.current.black.name : bg.current.white.name}…`
                : bg.paused === 'ocupado'
                  ? 'En espera mientras usas el motor.'
                  : 'Sigue mientras la app esté abierta.'}
          </p>
          {bg.progress && (
            <div className="progress-bar">
              <div style={{ width: `${(bg.progress.done / bg.progress.total) * 100}%` }} />
            </div>
          )}
        </section>
      )}

      <section className="card">
        <div className="segmented groups" role="tablist" aria-label="Tipo de partidas">
          {(['online', 'bots', 'otras'] as GameGroup[])
            .filter((g) => g !== 'otras' || counts.otras > 0)
            .map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={group === g}
                className={group === g ? 'active' : ''}
                onClick={() => {
                  setGroup(g)
                  setLimit(50)
                }}
              >
                {GROUP_LABEL[g]} ({counts[g]})
              </button>
            ))}
        </div>
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
        {!list.length && (
          <p className="muted">
            {group === 'bots' && !counts.bots ? (
              <>
                Aún no has jugado contra bots.{' '}
                <button className="link" onClick={() => onNavigate('jugar')}>
                  Ir a Jugar
                </button>
              </>
            ) : group === 'online' && !counts.online ? (
              'Aún no has importado partidas de Chess.com o Lichess.'
            ) : (
              'No hay partidas con este filtro.'
            )}
          </p>
        )}
        {list.length > limit && (
          <button className="btn more-btn" onClick={() => setLimit((l) => l + 50)}>
            Ver más ({list.length - limit} restantes)
          </button>
        )}
        <p className="muted small">
          {list.length} {list.length === 1 ? 'partida' : 'partidas'}.{' '}
          {group === 'online' && counts.online >= 3 && (
            <button className="link" onClick={() => onNavigate('progreso')}>
              Ver tu progreso
            </button>
          )}
        </p>
      </section>
    </div>
  )
}
