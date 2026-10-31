import { logWarn } from '../lib/log'
import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { MoveList } from '../components/MoveList'
import { Captured, PlayNav } from '../components/PlayExtras'
import { materialInfo, positionAt, useMoveBrowser } from '../lib/playView'
import { needsPromotion, PromotionPicker } from '../components/PromotionPicker'
import { IconCheck, IconClose, IconFlag } from '../components/GameIcons'
import { useWakeLock } from '../lib/wakeLock'
import { toSpanishSan } from '../lib/analysis'
import { setBusy } from '../lib/activity'
import { fetchAccount, type LichessAccount, loadLichessToken, revokeLichess, saveLichessToken, startLichessLogin, tokenCreateUrl } from '../lib/lichessAuth'
import {
  abortGame,
  answerDraw,
  cancelChallenge,
  challengeAi,
  challengeFriend,
  type ClockChoice,
  clockLeft,
  clockRunning,
  turnOf,
  exportFinishedGame,
  formatClock,
  isFinished,
  type LiveGame,
  nowPlaying,
  resignGame,
  seek,
  liveGameId,
  setLiveGameId,
  verifyLiveGame,
  sendMove,
  statusText,
  watchEvents,
  watchGame,
} from '../lib/lichessPlay'
import { useBackGuard } from '../lib/nav'
import { usePersistentState } from '../lib/storage'
import type { Color, GameSummary } from '../lib/types'

interface Props {
  onSaveGame: (g: GameSummary) => void
  onAnalyze: (id: string) => void
  /** Selector de modo de la pantalla Jugar. */
  header?: React.ReactNode
}

/** Ritmos que Lichess permite buscar desde aplicaciones (rápidas y clásicas). */
const CLOCKS: ClockChoice[] = [
  { minutes: 10, increment: 0 },
  { minutes: 10, increment: 5 },
  { minutes: 15, increment: 10 },
  { minutes: 30, increment: 0 },
]
const clockLabel = (c: ClockChoice) => `${c.minutes}+${c.increment}`

/** Lo que se está esperando: búsqueda de rival o reto a un amigo, y qué partida lo cumple. */
type Waiting = { text: string; since: number; cancel: () => void; accepts: (gameId: string) => boolean } | null

/** Tiempo que lleva la búsqueda, para ver que sigue viva. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return <>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</>
}

/** Partidas que terminan sin jugarse: no se guardan. */
const NO_GAME = new Set(['aborted', 'noStart'])

export function PlayOnline({ onSaveGame, onAnalyze, header }: Props) {
  const [token, setToken] = useState(loadLichessToken)
  const [account, setAccount] = useState<LichessAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Partida que se muestra: al abrir, la que esté en curso (si la hay).
  const [gameId, setGameId] = useState<string | null>(liveGameId)
  const [waiting, setWaitingState] = useState<Waiting>(null)
  const waitingRef = useRef<Waiting>(null)
  const setWaiting = (w: Waiting) => {
    waitingRef.current = w
    setWaitingState(w)
  }
  const [playing, setPlaying] = useState<Awaited<ReturnType<typeof nowPlaying>>>([])
  const [clock, setClock] = usePersistentState('lichessClock', 0)
  const [rated, setRated] = usePersistentState('lichessRated', false)
  const [aiLevel, setAiLevel] = usePersistentState('lichessAiLevel', 2)
  const [color, setColor] = usePersistentState<Color | 'random'>('lichessColor', 'random')
  const [confirmMove, setConfirmMove] = usePersistentState('confirmMove', true)
  const [premove, setPremove] = usePersistentState('premove', true)
  const [autoQueen, setAutoQueen] = usePersistentState('autoQueen', true)
  const [friend, setFriend] = useState('')
  const [pasted, setPasted] = useState('')

  // Los errores de Lichess quedan en el registro.
  useEffect(() => {
    if (error) logWarn(`Lichess: ${error}`)
  }, [error])

  // Cuenta conectada.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchAccount(token)
      .then((a) => !cancelled && setAccount(a))
      .catch((e) => !cancelled && setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [token])

  // Eventos de la cuenta: partidas que empiezan y retos rechazados.
  useEffect(() => {
    if (!account) return
    const ctrl = new AbortController()
    void watchEvents(
      (e) => {
        // Lichess repite gameStart de todas las partidas en curso al reconectar (también las de
        // correspondencia o las jugadas en su web): solo cuenta la que se está esperando.
        const id = e.game?.gameId ?? e.game?.id ?? null
        if (e.type === 'gameStart' && id && waitingRef.current?.accepts(id)) {
          setWaiting(null)
          setGameId(id)
          setLiveGameId(id)
        } else if (e.type === 'challengeDeclined') {
          setWaiting(null)
          setInfo('Tu amigo ha rechazado el reto.')
        }
      },
      ctrl.signal,
      setError,
    )
    nowPlaying()
      .then(setPlaying)
      .catch(() => undefined)
    // Si la partida marcada como en curso ya no lo está en Lichess, se quita la marca.
    void verifyLiveGame()
    return () => ctrl.abort()
  }, [account]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al salir de la pantalla se retira la búsqueda o el reto pendiente: si no, la partida empezaría sin nadie mirando.
  useEffect(() => () => waitingRef.current?.cancel(), [])

  const savePasted = async () => {
    setError(null)
    try {
      await fetchAccount(pasted.trim())
      saveLichessToken(pasted)
      setToken(pasted.trim())
      setPasted('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const disconnect = async () => {
    setLiveGameId(null)
    setGameId(null)
    await revokeLichess()
    setToken(null)
    setAccount(null)
  }

  const c = CLOCKS[clock] ?? CLOCKS[0]

  const doSeek = async () => {
    setError(null)
    const ctrl = new AbortController()
    // Las partidas que ya estaban en curso no son la que se busca (Lichess las repite al reconectar).
    const before = new Set((await nowPlaying().catch(() => playing)).map((p) => p.gameId))
    const w: Waiting = {
      text: `Buscando rival (${clockLabel(c)}${rated ? ', con puntuación' : ', amistosa'})`,
      since: Date.now(),
      cancel: () => ctrl.abort(),
      accepts: (gameId) => !before.has(gameId),
    }
    setWaiting(w)
    const stillWaiting = () => !ctrl.signal.aborted && waitingRef.current === w
    try {
      // Lichess cierra la conexión al encontrar rival o al retirar la búsqueda (también se corta si
      // el móvil se bloquea). Si al cerrarse no ha llegado la partida, se mira si ya existe y, si
      // no, se vuelve a buscar.
      while (stillWaiting()) {
        await seek(c, rated, ctrl.signal)
        if (!stillWaiting()) return
        const fresh = (await nowPlaying().catch(() => [])).find((p) => !before.has(p.gameId))
        if (fresh && stillWaiting()) {
          setWaiting(null)
          setGameId(fresh.gameId)
          setLiveGameId(fresh.gameId)
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError' || !stillWaiting()) return
      setWaiting(null)
      setError((e as Error).message)
    }
  }

  const doAi = async () => {
    setError(null)
    try {
      const id = await challengeAi(aiLevel, c, color)
      setGameId(id)
      setLiveGameId(id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const doFriend = async () => {
    setError(null)
    try {
      const id = await challengeFriend(friend, c, rated, color)
      setWaiting({
        text: `Reto enviado a ${friend.trim()}. Esperando a que lo acepte`,
        since: Date.now(),
        cancel: () => {
          if (id) void cancelChallenge(id)
        },
        // Al aceptar un reto, la partida tiene el mismo id que el reto.
        accepts: (gameId) => gameId === id,
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const page = (children: React.ReactNode) => (
    <div className="page play-setup">
      <header className="page-head">
        <h1>Jugar</h1>
      </header>
      {header}
      {children}
    </div>
  )

  if (!token) {
    return page(
      <section className="card">
        <h2>Jugar online en Lichess</h2>
        <p className="muted">
          Partidas reales contra personas de tu nivel, contra Stockfish de Lichess o contra un amigo. Necesitas una cuenta de Lichess (gratuita) y dar
          permiso a la app para jugar con ella.
        </p>
        <h3>En el ordenador</h3>
        <button className="btn primary" onClick={() => void startLichessLogin()}>
          Conectar con Lichess
        </button>
        <h3>En el iPhone (app instalada)</h3>
        <ol className="rules small">
          <li>
            <a href={tokenCreateUrl()} target="_blank" rel="noreferrer">
              Abre esta página de Lichess
            </a>{' '}
            (entra con tu cuenta si te lo pide). Los permisos ya están marcados.
          </li>
          <li>Baja hasta el final y pulsa el botón de crear. Copia el código que te muestra (empieza por lip_).</li>
          <li>Vuelve aquí, pégalo y pulsa Guardar.</li>
        </ol>
        <label className="field">
          <span>Código de Lichess</span>
          <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="lip_..." autoCapitalize="none" spellCheck={false} />
        </label>
        <button className="btn small" onClick={() => void savePasted()} disabled={!pasted.trim()}>
          Guardar
        </button>
        {error && <p className="msg error">{error}</p>}
      </section>,
    )
  }

  if (gameId && account) {
    return (
      <LiveGameView
        key={gameId}
        id={gameId}
        account={account}
        onSaveGame={onSaveGame}
        onAnalyze={onAnalyze}
        onExit={() => {
          setGameId(null)
          nowPlaying()
            .then(setPlaying)
            .catch(() => undefined)
        }}
      />
    )
  }

  return page(
    <>
      <section className="card">
        <div className="online-head">
          <h2>Jugar online en Lichess</h2>
          {account && (
            <span className="small muted">
              Conectado como <strong>{account.username}</strong>
              {account.perfs?.rapid?.rating ? ` (${account.perfs.rapid.rating} en rápidas)` : ''}
            </span>
          )}
        </div>
        {!account && !error && <p className="muted">Conectando con Lichess…</p>}
        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg info">{info}</p>}
        {waiting ? (
          <div className="msg info">
            <p>
              <span className="spinner" /> {waiting.text}… <Elapsed since={waiting.since} />
            </p>
            <button
              className="btn small"
              onClick={() => {
                waiting.cancel()
                setWaiting(null)
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          account && (
            <>
              <h3>Ritmo</h3>
              <div className="chips">
                {CLOCKS.map((x, i) => (
                  <button key={i} className={`chip ${clock === i ? 'active' : ''}`} onClick={() => setClock(i)}>
                    {clockLabel(x)}
                  </button>
                ))}
              </div>
              <p className="muted small">Minutos por jugador y segundos que se suman en cada jugada. Desde apps como esta, Lichess permite partidas rápidas y clásicas.</p>

              <h3>Durante la partida</h3>
              <label className="check">
                <input type="checkbox" checked={confirmMove} onChange={(e) => setConfirmMove(e.target.checked)} /> Confirmar cada jugada antes de enviarla
              </label>
              <label className="check">
                <input type="checkbox" checked={premove} onChange={(e) => setPremove(e.target.checked)} /> Permitir premovimientos (preparar tu jugada mientras piensa el rival)
              </label>
              <label className="check">
                <input type="checkbox" checked={autoQueen} onChange={(e) => setAutoQueen(e.target.checked)} /> Coronar siempre a dama, sin preguntar
              </label>

              <h3>Contra una persona</h3>
              <label className="check">
                <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} /> Con puntuación (cambia tu rating de Lichess)
              </label>
              <p className="muted small">Con puntuación hay muchos más jugadores buscando y el rival llega antes. Las amistosas pueden tardar varios minutos.</p>
              <div className="toolbar">
                <button className="btn primary" onClick={() => void doSeek()}>
                  Buscar rival
                </button>
              </div>

              <h3>Contra Stockfish de Lichess</h3>
              <div className="toolbar">
                <label className="field inline">
                  <span>Nivel</span>
                  <select value={aiLevel} onChange={(e) => setAiLevel(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="segmented" role="radiogroup" aria-label="Color">
                  {(['white', 'random', 'black'] as const).map((x) => (
                    <button key={x} className={color === x ? 'active' : ''} onClick={() => setColor(x)}>
                      {x === 'white' ? 'Blancas' : x === 'black' ? 'Negras' : 'Al azar'}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={() => void doAi()}>
                  Jugar
                </button>
              </div>
              <p className="muted small">El nivel 1 es muy flojo; el 3 o el 4 suelen ser un buen reto para empezar.</p>

              <h3>Retar a un amigo</h3>
              <div className="toolbar">
                <input className="grow" value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="Usuario de Lichess" autoCapitalize="none" spellCheck={false} />
                <button className="btn" onClick={() => void doFriend()} disabled={!friend.trim()}>
                  Retar
                </button>
              </div>
            </>
          )
        )}
      </section>

      {playing.length > 0 && !waiting && (
        <section className="card">
          <h3>Partidas en curso</h3>
          {playing.map((p) => (
            <div key={p.gameId} className="toolbar">
              <span className="grow small">
                Contra {p.opponent?.ai ? `Stockfish nivel ${p.opponent.ai}` : (p.opponent?.username ?? 'rival')} con {p.color === 'white' ? 'blancas' : 'negras'}
              </span>
              <button
              className="btn small primary"
              onClick={() => {
                setGameId(p.gameId)
                setLiveGameId(p.gameId)
              }}
            >
                Continuar
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <p className="small muted">
          Durante una partida online el análisis y el escáner quedan bloqueados, como exige el juego limpio de Lichess. Al terminar, la partida se
          guarda en Mis partidas para analizarla.
        </p>
        <button className="btn small" onClick={() => void disconnect()}>
          Desconectar la cuenta de Lichess
        </button>
      </section>
    </>,
  )
}

function LiveGameView({
  id,
  account,
  onSaveGame,
  onAnalyze,
  onExit,
}: {
  id: string
  account: LichessAccount
  onSaveGame: (g: GameSummary) => void
  onAnalyze: (id: string) => void
  onExit: () => void
}) {
  const [game, setGame] = useState<LiveGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Jugada enviada y aún sin confirmar, con la posición en la lista de jugadas que ocupará. */
  const [pending, setPending] = useState<{ uci: string; at: number } | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  /** Jugada hecha en el tablero y pendiente de confirmar (con la opción de confirmar activada). */
  const [candidate, setCandidate] = useState<{ from: string; to: string; promotion?: string; san: string; fen: string } | null>(null)
  const [confirmMove] = usePersistentState('confirmMove', true)
  const [premove] = usePersistentState('premove', true)
  const [autoQueen] = usePersistentState('autoQueen', true)
  const [resetKey, setResetKey] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [flipped, setFlipped] = useState(false)
  const savedOnce = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    void watchGame(id, account.id, setGame, ctrl.signal, setError)
    return () => ctrl.abort()
  }, [id, account.id])

  const finished = game ? isFinished(game.status) : false
  useWakeLock(Boolean(game && !finished))
  useBackGuard(Boolean(game && !finished), 'Partida online en curso. Para salir, termínala (o ríndete).')
  useEffect(() => {
    setBusy('play', Boolean(game && !finished))
    // La marca de partida en curso se quita al terminar (y con ella el bloqueo del análisis).
    if (game) setLiveGameId(finished ? null : id)
    return () => setBusy('play', false)
  }, [game, finished, id])

  // Al terminar, se guarda en Mis partidas. No depende de que la pantalla siga abierta, y se
  // reintenta unas veces porque Lichess puede tardar un momento en tener la partida lista.
  useEffect(() => {
    if (!game || !finished || savedOnce.current || NO_GAME.has(game.status)) return
    savedOnce.current = true
    void (async () => {
      for (const wait of [1500, 4000, 10000]) {
        await new Promise((r) => setTimeout(r, wait))
        const g = await exportFinishedGame(id, account.username).catch(() => null)
        if (g) {
          onSaveGame(g)
          if (mounted.current) setSaved(g.id)
          return
        }
      }
      if (mounted.current) setError('No se ha podido guardar la partida. Puedes importarla después desde Mis partidas, con tu usuario de Lichess.')
    })()
  }, [game, finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const chess = useMemo(() => {
    const c = new Chess(game && game.initialFen !== 'startpos' ? game.initialFen : undefined)
    for (const uci of [...(game?.moves ?? []), ...(pending ? [pending.uci] : [])]) {
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      } catch {
        break
      }
    }
    return c
  }, [game, pending])
  const sans = useMemo(() => chess.history(), [chess])
  const browse = useMoveBrowser(sans.length)
  // Si la partida cambia mientras se decide (fin por tiempo, rival que abandona), se olvida la jugada.
  const [movesSeen, setMovesSeen] = useState({ n: sans.length, finished })
  if (movesSeen.n !== sans.length || movesSeen.finished !== finished) {
    setMovesSeen({ n: sans.length, finished })
    if (candidate) setCandidate(null)
  }

  // Cuando Lichess confirma la jugada, deja de ser «pendiente».
  useEffect(() => {
    if (pending && game && game.moves.length > pending.at) setPending(null)
  }, [game, pending])

  if (!game) {
    return (
      <section className="card">
        <p>
          <span className="spinner" /> Conectando con la partida…
        </p>
        {error && <p className="msg error">{error}</p>}
        <button className="btn small" onClick={onExit}>
          Volver
        </button>
      </section>
    )
  }

  const myTurn = !finished && !pending && chess.turn() === game.color[0]
  const opponent: Color = game.color === 'white' ? 'black' : 'white'
  const oppOffersDraw = opponent === 'white' ? game.wdraw : game.bdraw
  const iOfferDraw = game.color === 'white' ? game.wdraw : game.bdraw
  const myMoves = Math.floor((game.moves.length + (game.color === 'white' ? 1 : 0)) / 2)
  const canAbort = !finished && myMoves < 1
  const orientation: Color = flipped ? opponent : game.color
  const last = chess.history({ verbose: true }).pop()
  const startFen = game.initialFen !== 'startpos' ? game.initialFen : undefined
  // Al repasar jugadas, el tablero enseña esa posición y no deja mover (el reloj sigue corriendo).
  const shown = browse.viewing ? positionAt([...game.moves, ...(pending ? [pending.uci] : [])], browse.ply, startFen) : null
  const material = materialInfo(shown?.fen ?? chess.fen(), startFen)

  const play = async (from: string, to: string, promotion?: string) => {
    let uci: string
    try {
      uci = new Chess(chess.fen()).move({ from, to, promotion }).lan
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    setPending({ uci, at: game.moves.length })
    setError(null)
    try {
      await sendMove(game.id, uci)
    } catch (e) {
      setPending(null)
      setResetKey((k) => k + 1)
      setError((e as Error).message)
    }
  }

  /** Envía la jugada o, con la confirmación activada, la deja a la espera. Los premovimientos no esperan. */
  const decide = (from: string, to: string, promotion?: string, wasPremove = false) => {
    if (!confirmMove || wasPremove) return void play(from, to, promotion)
    try {
      const c = new Chess(chess.fen())
      const m = c.move({ from, to, promotion })
      setCandidate({ from, to, promotion, san: m.san, fen: c.fen() })
    } catch {
      setResetKey((k) => k + 1)
    }
  }
  const onMove = (from: string, to: string, wasPremove?: boolean) => {
    const piece = chess.get(from as Parameters<Chess['get']>[0])
    if (!needsPromotion(chess.fen(), from, to, piece?.type)) decide(from, to, undefined, wasPremove)
    else if (autoQueen || wasPremove) decide(from, to, 'q', wasPremove)
    else setPromo({ from, to })
  }
  const confirmCandidate = () => {
    if (!candidate) return
    setCandidate(null)
    void play(candidate.from, candidate.to, candidate.promotion)
  }
  const cancelCandidate = () => {
    setCandidate(null)
    setResetKey((k) => k + 1)
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const playerLine = (side: Color) => {
    const p = side === 'white' ? game.white : game.black
    // El turno sale del estado confirmado por Lichess, igual que el reloj que corre.
    const active = !finished && turnOf(game) === side
    return (
      <div className={`player-line live ${active ? 'active' : ''}`}>
        <span>
          <strong>{p.name}</strong>
          {p.rating ? <span className="muted"> ({p.rating})</span> : null} <Captured side={side} material={material} />
        </span>
        <LiveClock game={game} side={side} />
      </div>
    )
  }

  const noGame = NO_GAME.has(game.status)
  const result = game.winner ? (game.winner === game.color ? '¡Has ganado!' : 'Has perdido') : noGame ? 'Partida anulada' : 'Tablas'

  return (
    <div className="page play online" data-fen={chess.fen()}>
      <div className="play-board">
        {playerLine(orientation === 'white' ? 'black' : 'white')}
        <Board
          fen={candidate?.fen ?? shown?.fen ?? chess.fen()}
          orientation={orientation}
          movableColor={!finished && !browse.viewing && !candidate && (myTurn || premove) ? game.color : undefined}
          premove={premove}
          lastMove={candidate ? [candidate.from, candidate.to] : shown ? shown.lastMove : last ? [last.from, last.to] : undefined}
          onMove={onMove}
          resetKey={resetKey}
        />
        {playerLine(orientation)}
      </div>
      <div className="play-side">
        <PlayNav ply={browse.ply} total={sans.length} viewing={browse.viewing} onGo={browse.go} />
        {finished ? (
          <section className={`card play-result ${game.winner === game.color ? 'win' : game.winner ? 'loss' : 'draw'}`}>
            <h2>{result}</h2>
            <p className="muted">
              {statusText(game.status)}. {saved ? 'La partida está guardada en Mis partidas.' : noGame ? 'No se guarda porque no llegó a jugarse.' : 'Guardando en Mis partidas…'}
            </p>
            <div className="toolbar">
              {saved && (
                <button className="btn primary" onClick={() => onAnalyze(saved)}>
                  Analizar la partida
                </button>
              )}
              <a className="btn" href={`https://lichess.org/${game.id}`} target="_blank" rel="noreferrer">
                Ver en Lichess
              </a>
              <button className="btn" onClick={onExit}>
                Nueva partida
              </button>
            </div>
          </section>
        ) : (
          <section className="card play-status">
            <p>
              <strong>{candidate ? `¿Confirmas ${toSpanishSan(candidate.san)}?` : myTurn ? 'Te toca mover.' : pending ? 'Enviando tu jugada…' : 'Juega tu rival…'}</strong>{' '}
              {candidate ? 'Pulsa Confirmar abajo, o Cancelar para pensar otra.' : game.rated ? 'Partida con puntuación.' : 'Partida amistosa.'}
            </p>
            {oppOffersDraw && (
              <div className="msg info">
                <p>Tu rival ofrece tablas.</p>
                <div className="toolbar">
                  <button className="btn small primary" onClick={() => void act(() => answerDraw(game.id, true))}>
                    Aceptar
                  </button>
                  <button className="btn small" onClick={() => void act(() => answerDraw(game.id, false))}>
                    Rechazar
                  </button>
                </div>
              </div>
            )}
            {iOfferDraw && <p className="muted small">Has ofrecido tablas. Esperando respuesta.</p>}
          </section>
        )}
        {error && <p className="msg error">{error}</p>}
        <section className="card">
          <MoveList sans={sans} ply={browse.ply} onSelect={browse.go} startFen={startFen} />
        </section>
        <div className="view-controls">
          <button className="btn small" onClick={() => setFlipped((f) => !f)}>
            Girar tablero
          </button>
        </div>
      </div>

      {!finished && candidate && (
        <div className="play-actions confirm-actions">
          <button className="btn" onClick={cancelCandidate}>
            <IconClose /> Cancelar
          </button>
          <button className="btn primary" onClick={confirmCandidate}>
            <IconCheck /> Confirmar
          </button>
        </div>
      )}
      {!finished && !candidate && (
        <div className="play-actions">
          {canAbort ? (
            <button className="btn" onClick={() => void act(() => abortGame(game.id))}>
              <IconClose /> Anular
            </button>
          ) : (
            <button className="btn" onClick={() => void act(() => answerDraw(game.id, true))} disabled={iOfferDraw || Boolean(game.black.aiLevel || game.white.aiLevel)}>
              ½ Tablas
            </button>
          )}
          <button className="btn" onClick={() => window.confirm('¿Seguro que quieres rendirte?') && void act(() => resignGame(game.id))}>
            <IconFlag /> Rendirse
          </button>
        </div>
      )}

      {promo && (
        <PromotionPicker
          color={game.color}
          onCancel={() => {
            setPromo(null)
            setResetKey((k) => k + 1)
          }}
          onPick={(p) => {
            const { from, to } = promo
            setPromo(null)
            decide(from, to, p)
          }}
        />
      )}
    </div>
  )
}

/**
 * Reloj de un jugador. Va en su propio componente para que solo él se redibuje cada 200 ms, y solo
 * mientras corre (no toda la pantalla de la partida).
 */
function LiveClock({ game, side }: { game: LiveGame; side: Color }) {
  const running = clockRunning(game, side)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [running])
  // Hasta el primer tic, `now` puede ser anterior al último estado recibido.
  const left = clockLeft(game, side, Math.max(now, game.receivedAt))
  if (left === undefined) return null
  return <span className={`clock ${running ? 'running' : ''} ${left < 30000 ? 'low' : ''}`}>{formatClock(left)}</span>
}
