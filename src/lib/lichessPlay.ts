import { type LiGame, normalizeLichessGame } from './lichess'
import { LICHESS, loadLichessToken } from './lichessAuth'
import { load, save } from './storage'
import type { Color, GameSummary } from './types'

/**
 * Juego online en Lichess con la Board API (https://lichess.org/api#tag/Board).
 * Las partidas llegan como flujos NDJSON (una línea JSON por evento). Si el flujo se corta (por
 * ejemplo, al bloquear el móvil), se vuelve a conectar y Lichess envía el estado completo.
 */

export interface LivePlayer {
  name: string
  rating?: number
  /** Nivel si el rival es Stockfish de Lichess. */
  aiLevel?: number
}

export interface LiveGame {
  id: string
  /** Tu color en la partida. */
  color: Color
  white: LivePlayer
  black: LivePlayer
  speed?: string
  rated: boolean
  clock?: { initial: number; increment: number }
  initialFen: string
  moves: string[]
  /** Tiempo restante en milisegundos y momento en que se recibió (para descontarlo en pantalla). */
  wtime?: number
  btime?: number
  receivedAt: number
  status: string
  winner?: Color
  /** Ofertas de tablas pendientes de cada bando. */
  wdraw: boolean
  bdraw: boolean
}

export const isFinished = (status: string) => !['created', 'started'].includes(status)

const STATUS_TEXT: Record<string, string> = {
  mate: 'Jaque mate',
  resign: 'Abandono',
  stalemate: 'Rey ahogado',
  timeout: 'Abandono por desconexión',
  draw: 'Tablas acordadas',
  outoftime: 'Sin tiempo',
  aborted: 'Partida anulada',
  noStart: 'La partida no llegó a empezar',
  cheat: 'Juego sucio detectado',
  variantEnd: 'Fin de la variante',
  unknownFinish: 'Partida terminada',
}
export const statusText = (s: string) => STATUS_TEXT[s] ?? 'Partida terminada'

const auth = (token = loadLichessToken()) => {
  if (!token) throw new Error('Falta conectar tu cuenta de Lichess.')
  return { Authorization: `Bearer ${token}` }
}

async function post(path: string, form?: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${LICHESS}${path}`, {
      method: 'POST',
      headers: { ...auth(), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])) : undefined,
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('No se ha podido conectar con Lichess. Revisa la conexión.')
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string | Record<string, string[]> }
    const detail = typeof data.error === 'string' ? data.error : data.error ? Object.values(data.error).flat().join(' ') : ''
    if (res.status === 401) throw new Error('El permiso de Lichess no es válido o ha caducado. Vuelve a conectar la cuenta.')
    if (res.status === 429) throw new Error('Lichess está limitando las peticiones. Espera un minuto.')
    throw new Error(`Lichess no lo ha aceptado (${res.status})${detail ? `: ${detail}` : ''}.`)
  }
  return res
}

/** Lee un flujo NDJSON y llama a `onLine` con cada objeto. Termina cuando Lichess cierra el flujo. */
export async function readNdjson(res: Response, onLine: (obj: Record<string, unknown>) => void) {
  const reader = res.body?.getReader()
  if (!reader) {
    for (const l of (await res.text()).split('\n')) if (l.trim()) onLine(JSON.parse(l))
    return
  }
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) onLine(JSON.parse(line))
    }
  }
  if (buf.trim()) onLine(JSON.parse(buf))
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

/** Mantiene abierto un flujo y lo reabre si se corta, hasta que `signal` se cancele o `stop()` devuelva true. */
async function keepStreaming(path: string, onLine: (obj: Record<string, unknown>) => void, signal: AbortSignal, stop: () => boolean, onError?: (msg: string) => void) {
  let headers: Record<string, string>
  try {
    headers = auth()
  } catch (e) {
    onError?.((e as Error).message)
    return
  }
  let delay = 1000
  while (!signal.aborted && !stop()) {
    try {
      const res = await fetch(`${LICHESS}${path}`, { headers, signal })
      if (res.status === 401) {
        onError?.('El permiso de Lichess no es válido o ha caducado. Vuelve a conectar la cuenta.')
        return
      }
      // Los errores de la petición (partida inexistente, sin permiso…) no se arreglan reintentando.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        onError?.(res.status === 404 ? 'Lichess no encuentra esa partida.' : `Lichess ha respondido con un error (${res.status}).`)
        return
      }
      if (res.ok) {
        delay = 1000
        await readNdjson(res, onLine)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    if (signal.aborted || stop()) return
    await sleep(delay, signal)
    delay = Math.min(delay * 2, 15000)
  }
}

const playerFrom = (p: Record<string, unknown> | undefined): LivePlayer => {
  if (!p) return { name: '?' }
  if (p.aiLevel) return { name: `Stockfish de Lichess (nivel ${p.aiLevel})`, aiLevel: Number(p.aiLevel) }
  return { name: String(p.name ?? p.id ?? 'Anónimo'), rating: p.rating as number | undefined }
}

/** Aplica un mensaje del flujo de la partida (gameFull o gameState) al estado. */
export function applyGameEvent(prev: LiveGame | null, msg: Record<string, unknown>, myId: string): LiveGame | null {
  if (msg.type === 'gameFull') {
    const white = msg.white as Record<string, unknown>
    const state = msg.state as Record<string, unknown>
    const base: LiveGame = {
      id: String(msg.id),
      color: String(white?.id ?? '').toLowerCase() === myId.toLowerCase() ? 'white' : 'black',
      white: playerFrom(white),
      black: playerFrom(msg.black as Record<string, unknown>),
      speed: msg.speed as string | undefined,
      rated: Boolean(msg.rated),
      clock: msg.clock as LiveGame['clock'],
      initialFen: msg.initialFen && msg.initialFen !== 'startpos' ? String(msg.initialFen) : 'startpos',
      moves: [],
      receivedAt: Date.now(),
      status: 'started',
      wdraw: false,
      bdraw: false,
    }
    return applyGameEvent(base, state, myId)
  }
  if (msg.type === 'gameState' && prev) {
    const moves = String(msg.moves ?? '').trim()
    return {
      ...prev,
      moves: moves ? moves.split(' ') : [],
      wtime: msg.wtime as number | undefined,
      btime: msg.btime as number | undefined,
      receivedAt: Date.now(),
      status: String(msg.status ?? prev.status),
      winner: msg.winner as Color | undefined,
      wdraw: Boolean(msg.wdraw),
      bdraw: Boolean(msg.bdraw),
    }
  }
  return prev
}

/** Sigue una partida en directo. Llama a `onGame` con cada cambio. */
export function watchGame(id: string, myId: string, onGame: (g: LiveGame) => void, signal: AbortSignal, onError?: (msg: string) => void) {
  let game: LiveGame | null = null
  return keepStreaming(
    `/api/board/game/stream/${id}`,
    (msg) => {
      const next = applyGameEvent(game, msg, myId)
      if (next && next !== game) {
        game = next
        onGame(next)
      }
    },
    signal,
    () => Boolean(game && isFinished(game.status)),
    onError,
  )
}

export interface LichessEvent {
  type: string
  game?: { gameId?: string; id?: string; color?: Color; source?: string }
  challenge?: { id: string; challenger?: { name?: string }; destUser?: { name?: string } }
}

/** Flujo de eventos de la cuenta: partidas que empiezan, retos recibidos, retos rechazados... */
export function watchEvents(onEvent: (e: LichessEvent) => void, signal: AbortSignal, onError?: (msg: string) => void) {
  return keepStreaming('/api/stream/event', (msg) => onEvent(msg as unknown as LichessEvent), signal, () => false, onError)
}

export interface ClockChoice {
  /** Minutos y segundos de incremento. */
  minutes: number
  increment: number
}

/**
 * Busca rival en el emparejamiento de Lichess. La petición sigue abierta mientras se busca; la
 * partida empieza con un evento gameStart. Cancelar `signal` retira la búsqueda.
 * Desde aplicaciones como esta, Lichess solo permite buscar partidas rápidas o clásicas.
 */
export async function seek(c: ClockChoice, rated: boolean, signal: AbortSignal) {
  await post('/api/board/seek', { time: c.minutes, increment: c.increment, rated, variant: 'standard', color: 'random' }, signal)
}

/** Partida contra Stockfish de Lichess (niveles 1 a 8). Devuelve el id de la partida. */
export async function challengeAi(level: number, c: ClockChoice, color: Color | 'random'): Promise<string> {
  const res = await post('/api/challenge/ai', { level, 'clock.limit': c.minutes * 60, 'clock.increment': c.increment, color, variant: 'standard' })
  const data = (await res.json()) as { id: string }
  return data.id
}

/** Reta a un amigo. La partida empieza cuando acepte (evento gameStart). Devuelve el id del reto. */
export async function challengeFriend(username: string, c: ClockChoice, rated: boolean, color: Color | 'random'): Promise<string> {
  const res = await post(`/api/challenge/${encodeURIComponent(username.trim())}`, { rated, 'clock.limit': c.minutes * 60, 'clock.increment': c.increment, color, variant: 'standard' })
  const data = (await res.json()) as { id?: string; challenge?: { id: string } }
  return data.challenge?.id ?? data.id ?? ''
}

export const cancelChallenge = (id: string) => post(`/api/challenge/${id}/cancel`).catch(() => undefined)
export const sendMove = (id: string, uci: string) => post(`/api/board/game/${id}/move/${uci}`)
export const resignGame = (id: string) => post(`/api/board/game/${id}/resign`)
export const abortGame = (id: string) => post(`/api/board/game/${id}/abort`)
export const answerDraw = (id: string, yes: boolean) => post(`/api/board/game/${id}/draw/${yes ? 'yes' : 'no'}`)

/** Partidas en curso de la cuenta (para retomarlas). */
export async function nowPlaying(): Promise<{ gameId: string; color: Color; opponent?: { username?: string; rating?: number; ai?: number } }[]> {
  const res = await fetch(`${LICHESS}/api/account/playing`, { headers: auth() })
  if (!res.ok) return []
  const data = (await res.json()) as { nowPlaying?: { gameId: string; color: Color; opponent?: { username?: string; rating?: number; ai?: number } }[] }
  return data.nowPlaying ?? []
}

/** Descarga la partida terminada para guardarla en Mis partidas. */
export async function exportFinishedGame(id: string, username: string): Promise<GameSummary | null> {
  const res = await fetch(`${LICHESS}/game/export/${id}?pgnInJson=true&opening=true&clocks=false&evals=false`, { headers: { Accept: 'application/json', ...auth() } })
  if (!res.ok) return null
  return normalizeLichessGame((await res.json()) as LiGame, username)
}

/** Tiempo que queda en el reloj de un bando, descontando lo transcurrido si le toca mover. */
export function clockLeft(g: LiveGame, side: Color, now = Date.now()): number | undefined {
  const base = side === 'white' ? g.wtime : g.btime
  if (base === undefined) return undefined
  const turn: Color = g.moves.length % 2 === (g.initialFen === 'startpos' || g.initialFen.split(' ')[1] === 'w' ? 0 : 1) ? 'white' : 'black'
  const running = !isFinished(g.status) && g.moves.length >= 2 && turn === side
  return Math.max(0, running ? base - (now - g.receivedAt) : base)
}

export function formatClock(ms?: number): string {
  if (ms === undefined) return ''
  // Con menos de 10 segundos se muestran las décimas (truncadas, para no mostrar «10,0»).
  if (ms < 10_000) return `0:0${(Math.floor(ms / 100) / 10).toFixed(1).replace('.', ',')}`
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Partida online en curso (para bloquear el análisis mientras se juega)

const LIVE_KEY = 'lichessLiveGame'

/** Id de la partida online en curso en este dispositivo, si la hay. */
/**
 * Id de la partida online sin terminar, o null. Es la única marca: se pone al empezar y se quita al
 * terminar (o si Lichess ya no la tiene en curso), así nunca queda el análisis bloqueado sin motivo.
 */
export const liveGameId = () => load<string | null>(LIVE_KEY, null)
export const setLiveGameId = (id: string | null) => save(LIVE_KEY, id)
/** ¿Hay una partida online sin terminar? Mientras la haya, el análisis y el escáner se bloquean. */
export const isLiveActive = () => Boolean(liveGameId())

/** Comprueba con Lichess que la partida marcada sigue en curso; si no, quita la marca. */
export async function verifyLiveGame(): Promise<boolean> {
  const id = liveGameId()
  if (!id) return false
  try {
    const playing = await nowPlaying()
    if (playing.some((p) => p.gameId === id)) return true
    setLiveGameId(null)
    return false
  } catch {
    return true
  }
}
