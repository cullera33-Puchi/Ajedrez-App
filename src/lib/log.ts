import { load, save } from './storage'

/**
 * Registro de la app: errores, avisos y por qué pantallas se ha pasado, para compartirlo con Claude
 * cuando algo falla. Se guarda solo en este dispositivo (no viaja en las copias) y se limpian los
 * datos sensibles (permisos de Lichess, claves, correos) antes de guardarlos.
 */

export type LogLevel = 'error' | 'aviso' | 'info'

export interface LogEntry {
  t: number
  level: LogLevel
  /** Dónde: pantalla o parte de la app. */
  where: string
  msg: string
  detail?: string
}

const KEY = 'appLog'
const MAX = 300
const MAX_MSG = 500
const MAX_DETAIL = 1500


let view = 'Inicio'
const listeners = new Set<() => void>()

/** Quita permisos, claves y correos de un texto. */
export function redact(text: string): string {
  return text
    .replace(/lip_[A-Za-z0-9]+/g, 'lip_***')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer ***')
    .replace(/sb_(publishable|secret)_[\w-]+/g, 'sb_$1_***')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***')
}

export const loadAppLog = (): LogEntry[] => load<LogEntry[]>(KEY, [])

export function log(level: LogLevel, msg: string, detail?: string, where = view) {
  const entry: LogEntry = { t: Date.now(), level, where, msg: redact(msg).slice(0, MAX_MSG), ...(detail ? { detail: redact(detail).slice(0, MAX_DETAIL) } : {}) }
  const all = loadAppLog()
  // Un mismo error repetido seguido no llena el registro.
  const last = all[all.length - 1]
  if (last && last.level === entry.level && last.msg === entry.msg && entry.t - last.t < 5000) return
  save(KEY, [...all, entry].slice(-MAX))
  for (const fn of listeners) fn()
}

export const logError = (msg: string, e?: unknown, where?: string) => log('error', msg, errorDetail(e), where)
export const logWarn = (msg: string, e?: unknown, where?: string) => log('aviso', msg, errorDetail(e), where)

function errorDetail(e: unknown): string | undefined {
  if (!e) return undefined
  if (e instanceof Error) return e.stack || `${e.name}: ${e.message}`
  return String(e)
}

export function clearLog() {
  save(KEY, [])
  for (const fn of listeners) fn()
}

export function onLogChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** La app avisa de la pantalla actual: se apunta como contexto de los errores. */
export function setLogView(name: string) {
  if (name === view) return
  view = name
  log('info', `Pantalla: ${name}`)
}

/** Captura los errores no controlados (fallos de código y promesas rechazadas sin tratar). */
export function installLogCapture() {
  window.addEventListener('error', (e) => {
    // Aviso inofensivo del navegador cuando un cambio de tamaño se encadena con otro: no es un fallo.
    if (/ResizeObserver loop/.test(e.message)) return
    logError(e.message || 'Error sin mensaje', e.error ?? `${e.filename}:${e.lineno}:${e.colno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { name?: string; message?: string } | undefined
    // Las búsquedas canceladas a propósito no son errores.
    if (r?.name === 'AbortError') return
    logError(r?.message ?? 'Promesa rechazada sin tratar', e.reason)
  })
  log('info', 'App abierta')
}

const LEVEL_LABEL: Record<LogLevel, string> = { error: 'ERROR', aviso: 'AVISO', info: 'info' }

function fmt(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Datos del dispositivo que ayudan a entender un fallo. */
export function deviceInfo(): string {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
  const set = document.documentElement.dataset.theme
  const theme = set ? (document.documentElement.dataset.ink === 'dark' ? 'tinta noche' : ({ light: 'día', dark: 'noche', eink: 'tinta' }[set] ?? set)) : window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'día (sistema)' : 'noche (sistema)'
  return [
    `Versión: ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'desarrollo'}`,
    `Navegador: ${navigator.userAgent}`,
    `Pantalla: ${window.innerWidth}x${window.innerHeight}, app instalada: ${standalone ? 'sí' : 'no'}, tema: ${theme}, conexión: ${navigator.onLine ? 'sí' : 'no'}`,
  ].join('\n')
}

/** Texto para pegar a Claude: dispositivo y entradas, de la más antigua a la más reciente. */
export function logReport(entries = loadAppLog(), onlyProblems = false): string {
  const list = onlyProblems ? entries.filter((e) => e.level !== 'info') : entries
  const lines = list.map((e) => `${fmt(e.t)} [${LEVEL_LABEL[e.level]}] (${e.where}) ${e.msg}${e.detail ? `\n    ${e.detail.split('\n').slice(0, 6).join('\n    ')}` : ''}`)
  const errors = entries.filter((e) => e.level === 'error').length
  const warns = entries.filter((e) => e.level === 'aviso').length
  return [
    'Registro de Ajedrez App',
    deviceInfo(),
    `Entradas: ${list.length} (${errors} ${errors === 1 ? 'error' : 'errores'}, ${warns} ${warns === 1 ? 'aviso' : 'avisos'})`,
    '',
    ...(lines.length ? lines : ['Sin entradas.']),
  ].join('\n')
}
