import { parseClocks } from './clock'
import { dayKey } from './puzzleLog'
import { isOnlineGame, weekStart } from './progress'
import { load, save } from './storage'
import type { GameSummary } from './types'

/**
 * Tiempo jugado y meta diaria. Suma dos cosas:
 * - El tiempo activo en la app (Entrenar, Jugar contra bots, Problemas, Aprender y Análisis): solo con
 *   la pantalla a la vista y si has tocado algo en los últimos minutos. Cada dispositivo apunta el suyo
 *   y las copias suman los de todos.
 * - La duración de tus partidas de Chess.com y Lichess, sacada del reloj del PGN al importarlas. Las
 *   partidas online jugadas desde la app no cuentan como tiempo en la app para no contarlas dos veces.
 * La racha son los días seguidos con la meta cumplida.
 */

/** Segundos de cada día (AAAA-MM-DD) por dispositivo. */
export type ActivityTime = Record<string, Record<string, number>>

export interface DailyGoal {
  minutes: number
  /** Cuándo se cambió, para quedarse con la más reciente al fusionar copias. */
  t: number
}

const TIME_KEY = 'activityTime'
const GOAL_KEY = 'dailyGoal'
const DEVICE_KEY = 'deviceId'
export const DEFAULT_GOAL = 20
export const GOAL_CHOICES = [10, 15, 20, 30, 45, 60]
/** Sin tocar la pantalla durante este tiempo, deja de contar. */
const IDLE_MS = 3 * 60_000
const TICK_MS = 5_000
/** Días que se guardan por dispositivo. */
const KEEP_DAYS = 400

export const loadActivityTime = () => load<ActivityTime>(TIME_KEY, {})
export const loadGoal = (): number => load<DailyGoal | null>(GOAL_KEY, null)?.minutes ?? DEFAULT_GOAL
export function saveGoal(minutes: number) {
  save(GOAL_KEY, { minutes, t: Date.now() } satisfies DailyGoal)
  notify()
}

function deviceId(): string {
  let id = load<string | null>(DEVICE_KEY, null)
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    save(DEVICE_KEY, id)
  }
  return id
}

/** Suma segundos al día indicado en este dispositivo. */
export function addAppSeconds(seconds: number, now = Date.now()) {
  if (seconds <= 0) return
  const all = loadActivityTime()
  const id = deviceId()
  const mine = { ...all[id] }
  const day = dayKey(now)
  mine[day] = Math.round((mine[day] ?? 0) + seconds)
  const days = Object.keys(mine).sort()
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete mine[d]
  save(TIME_KEY, { ...all, [id]: mine })
  notify()
}

/** Fusión de copias: por dispositivo y día, el valor mayor (cada uno solo crece). */
export function mergeActivityTime(a: unknown, b: unknown): ActivityTime {
  const out: ActivityTime = {}
  for (const src of [a, b] as (ActivityTime | null | undefined)[]) {
    for (const [dev, days] of Object.entries(src ?? {})) {
      const cur = (out[dev] = { ...out[dev] })
      for (const [d, s] of Object.entries(days)) cur[d] = Math.max(cur[d] ?? 0, s)
    }
  }
  return out
}

export function mergeGoal(a: unknown, b: unknown): DailyGoal | null {
  const x = a as DailyGoal | null
  const y = b as DailyGoal | null
  if (!x) return y
  if (!y) return x
  return y.t > x.t ? y : x
}

// ---------------------------------------------------------------------------
// Contador del tiempo en la app

const listeners = new Set<() => void>()
function notify() {
  for (const fn of listeners) fn()
}
export function onActivityChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let pending = 0
let lastTick = Date.now()
let lastInput = Date.now()

/** Apunta el tiempo acumulado que aún no se ha guardado. */
export function flushActivity() {
  const s = Math.floor(pending / 1000)
  if (!s) return
  pending -= s * 1000
  addAppSeconds(s)
}

/**
 * Arranca el contador. `counting` dice si la pantalla actual cuenta como tiempo jugado. Devuelve la
 * función que lo para.
 */
export function startActivityTracker(counting: () => boolean): () => void {
  const input = () => {
    lastInput = Date.now()
  }
  const tick = () => {
    const now = Date.now()
    // Si el navegador ha dormido el temporizador, no se cuenta el hueco entero.
    const dt = Math.min(now - lastTick, TICK_MS * 2)
    lastTick = now
    if (document.visibilityState === 'visible' && now - lastInput < IDLE_MS && counting()) pending += dt
    if (pending >= 30_000) flushActivity()
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      tick()
      flushActivity()
    } else lastTick = Date.now()
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
  for (const e of events) window.addEventListener(e, input, { passive: true, capture: true })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flushActivity)
  lastTick = Date.now()
  const timer = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(timer)
    tick()
    flushActivity()
    for (const e of events) window.removeEventListener(e, input, { capture: true })
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flushActivity)
  }
}

// ---------------------------------------------------------------------------
// Resumen

const gameCache = new Map<string, number>()

/** Duración de una partida online según el reloj (suma de lo que pensaron los dos); 0 si no lo tiene. */
export function gameSeconds(g: GameSummary): number {
  const cached = gameCache.get(g.id)
  if (cached !== undefined) return cached
  const c = parseClocks(g.pgn)
  const s = c ? Math.round(c.spent.reduce((a, b) => a + b, 0)) : 0
  gameCache.set(g.id, s)
  return s
}

export interface DayActivity {
  day: string
  app: number
  games: number
  total: number
}

/** Segundos por día: tiempo en la app de todos los dispositivos más la duración de las partidas online. */
export function activityByDay(time: ActivityTime, games: GameSummary[]): Map<string, DayActivity> {
  const map = new Map<string, DayActivity>()
  const get = (day: string) => {
    let d = map.get(day)
    if (!d) map.set(day, (d = { day, app: 0, games: 0, total: 0 }))
    return d
  }
  for (const days of Object.values(time)) for (const [day, s] of Object.entries(days)) get(day).app += s
  for (const g of games) {
    if (!isOnlineGame(g)) continue
    const s = gameSeconds(g)
    if (s) get(dayKey(g.date)).games += s
  }
  for (const d of map.values()) d.total = d.app + d.games
  return map
}

export interface ActivitySummary {
  goal: number
  today: DayActivity
  week: number
  month: number
  /** Días de esta semana, de lunes a domingo (los que aún no han llegado, con `future`). */
  weekDays: { day: string; label: string; total: number; met: boolean; future: boolean; today: boolean }[]
  streak: number
  best: number
}

const LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function activitySummary(time: ActivityTime, games: GameSummary[], goalMinutes: number, now = Date.now()): ActivitySummary {
  const byDay = activityByDay(time, games)
  const goal = goalMinutes * 60
  const total = (day: string) => byDay.get(day)?.total ?? 0
  const met = (day: string) => total(day) >= goal
  const todayKey = dayKey(now)

  const weekDays: ActivitySummary['weekDays'] = []
  let week = 0
  const d = new Date(weekStart(now))
  for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) {
    const day = dayKey(d)
    const future = day > todayKey
    if (!future) week += total(day)
    weekDays.push({ day, label: LABELS[i], total: future ? 0 : total(day), met: !future && met(day), future, today: day === todayKey })
  }

  const monthPrefix = todayKey.slice(0, 8)
  let month = 0
  for (const [day, a] of byDay) if (day.startsWith(monthPrefix) && day <= todayKey) month += a.total

  // Racha actual: hoy cuenta si ya se ha cumplido; si no, se mira desde ayer (aún estás a tiempo).
  let streak = 0
  const c = new Date(now)
  if (!met(todayKey)) c.setDate(c.getDate() - 1)
  while (met(dayKey(c))) {
    streak++
    c.setDate(c.getDate() - 1)
  }

  // Mejor racha: recorrido de los días cumplidos en orden, con el calendario (no sumando 24 horas).
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const day of [...byDay.keys()].filter(met).sort()) {
    const expected = prev ? nextDay(prev) : null
    run = expected === day ? run + 1 : 1
    best = Math.max(best, run)
    prev = day
  }

  return { goal: goalMinutes, today: byDay.get(todayKey) ?? { day: todayKey, app: 0, games: 0, total: 0 }, week, month, weekDays, streak, best: Math.max(best, streak) }
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + 1))
}

/** «25 min», «1 h 5 min». */
export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
