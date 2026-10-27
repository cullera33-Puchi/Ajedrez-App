import { exportBackup, importBackup, parseBackup, type Backup } from './backup'
import { load, save } from './storage'

/**
 * Sincronización entre dispositivos con Supabase (plan gratuito, con la cuenta del usuario).
 * Cada dispositivo descarga la copia de la nube, la fusiona con lo que tiene (sin borrar nada) y
 * vuelve a subir el resultado. La copia se guarda como archivo privado en Supabase Storage, en una
 * carpeta que solo puede leer y escribir su usuario. Guía de configuración: docs/SINCRONIZACION.md.
 */

export interface SyncConfig {
  url: string
  anonKey: string
}

interface Session {
  access_token: string
  refresh_token: string
  /** Caducidad en segundos desde 1970. */
  expires_at: number
  user: { id: string; email?: string }
}

export interface SyncState {
  configured: boolean
  email?: string
  lastSync?: number
  syncing: boolean
  error?: string
}

/**
 * Proyecto de Supabase del propietario, para que la tarjeta salga ya rellena en cada dispositivo.
 * La clave publishable es pública por diseño: la protección la dan las reglas de acceso del bucket
 * (cada usuario solo lee y escribe su carpeta) y tener desactivado el alta de usuarios nuevos.
 */
export const DEFAULT_SYNC: SyncConfig = {
  url: 'https://xkkyzmnzchdvahhvlxrq.supabase.co',
  anonKey: 'sb_publishable_TE0wJ0WlMkh55WSnyLULOQ_YxHUW5D8',
}

const CONFIG_KEY = 'syncConfig'
const SESSION_KEY = 'syncSession'
const LAST_KEY = 'syncLast'
const BUCKET = 'ajedrez'
const MIN_INTERVAL = 2 * 60 * 1000

export class SyncError extends Error {}

export const loadSyncConfig = () => load<SyncConfig | null>(CONFIG_KEY, null)
const loadSession = () => load<Session | null>(SESSION_KEY, null)

let syncing = false
let lastError: string | undefined
const listeners = new Set<(s: SyncState) => void>()
const merged = new Set<() => void>()

export function syncState(): SyncState {
  const cfg = loadSyncConfig()
  const session = loadSession()
  return { configured: Boolean(cfg), email: session?.user?.email, lastSync: load<number | undefined>(LAST_KEY, undefined), syncing, error: lastError }
}

const emit = () => {
  const s = syncState()
  for (const l of listeners) l(s)
}

/** Avisa de cambios de estado de la sincronización. */
export function onSyncState(fn: (s: SyncState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Avisa cuando la sincronización ha traído datos de otro dispositivo (para refrescar pantallas). */
export function onSyncMerged(fn: () => void): () => void {
  merged.add(fn)
  return () => merged.delete(fn)
}

export function saveSyncConfig(url: string, anonKey: string) {
  const clean = url.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[\w.-]+$/.test(clean)) throw new SyncError('La dirección del proyecto no es válida. Tiene que ser como https://abcd.supabase.co')
  if (anonKey.trim().length < 20) throw new SyncError('La clave pública no parece completa.')
  save(CONFIG_KEY, { url: clean, anonKey: anonKey.trim() })
  emit()
}

export function clearSync() {
  save(CONFIG_KEY, null)
  save(SESSION_KEY, null)
  lastError = undefined
  emit()
}

export function signOut() {
  save(SESSION_KEY, null)
  emit()
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const cfg = loadSyncConfig()
  if (!cfg) throw new SyncError('Falta configurar la sincronización.')
  const headers: Record<string, string> = { apikey: cfg.anonKey, ...(init.headers as Record<string, string>) }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  let res: Response
  try {
    res = await fetch(`${cfg.url}${path}`, { ...init, headers })
  } catch {
    throw new SyncError('No se ha podido conectar con Supabase. Revisa la conexión.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error_description?: string; msg?: string; message?: string; error?: string }
    const detail = body.error_description ?? body.msg ?? body.message ?? body.error ?? ''
    if (/bucket not found/i.test(detail)) throw new SyncError('Falta crear el espacio de las copias en Supabase: ejecuta el SQL del paso 3 de la guía y vuelve a intentarlo.')
    if (res.status === 404 || /not found/i.test(detail)) throw new SyncError('404')
    if (/invalid login|invalid_grant|invalid credentials/i.test(detail)) throw new SyncError('Correo o contraseña incorrectos.')
    if (/email not confirmed/i.test(detail)) throw new SyncError('Falta confirmar el correo: abre el enlace que te ha enviado Supabase y vuelve a entrar.')
    if (/already registered/i.test(detail)) throw new SyncError('Ese correo ya tiene cuenta: usa Entrar.')
    if (/password/i.test(detail) && /characters|short|weak/i.test(detail)) throw new SyncError('La contraseña es demasiado corta (mínimo 6 caracteres).')
    throw new SyncError(`Supabase ha respondido con un error (${res.status})${detail ? `: ${detail}` : ''}.`)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.blob()) as T
}

function storeSession(data: { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: { id: string; email?: string } }) {
  if (!data.access_token || !data.refresh_token || !data.user) return false
  const expires_at = data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600)
  save(SESSION_KEY, { access_token: data.access_token, refresh_token: data.refresh_token, expires_at, user: data.user })
  emit()
  return true
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Crea la cuenta. Devuelve false si hace falta confirmar el correo antes de entrar. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const data = await call<Parameters<typeof storeSession>[0] & { session?: Parameters<typeof storeSession>[0] }>('/auth/v1/signup', json({ email, password }))
  return storeSession(data.session ?? data)
}

export async function signIn(email: string, password: string): Promise<void> {
  const data = await call<Parameters<typeof storeSession>[0]>('/auth/v1/token?grant_type=password', json({ email, password }))
  if (!storeSession(data)) throw new SyncError('Supabase no ha devuelto una sesión válida.')
}

async function validToken(): Promise<Session> {
  const s = loadSession()
  if (!s) throw new SyncError('Entra con tu cuenta para sincronizar.')
  if (s.expires_at - 60 > Date.now() / 1000) return s
  try {
    const data = await call<Parameters<typeof storeSession>[0]>('/auth/v1/token?grant_type=refresh_token', json({ refresh_token: s.refresh_token }))
    storeSession(data)
  } catch (e) {
    // Sin conexión no se cierra la sesión: el permiso sigue valiendo para la próxima vez.
    if (e instanceof SyncError && /conectar/.test(e.message)) throw e
    signOut()
    throw new SyncError('La sesión ha caducado. Vuelve a entrar.')
  }
  return loadSession()!
}

// La copia se comprime con gzip si el navegador lo permite (todos los actuales).
const canGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function encode(b: Backup): Promise<{ body: Blob; type: string }> {
  const text = new Blob([JSON.stringify(b)], { type: 'application/json' })
  if (!canGzip) return { body: text, type: 'application/json' }
  const gz = await new Response(text.stream().pipeThrough(new CompressionStream('gzip'))).blob()
  return { body: gz, type: 'application/gzip' }
}

async function decode(blob: Blob): Promise<Backup> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const gz = head[0] === 0x1f && head[1] === 0x8b
  const text = gz && canGzip ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await blob.text()
  return parseBackup(text)
}

/** Descarga, fusiona y sube. `force` ignora el intervalo mínimo entre sincronizaciones automáticas. */
export async function syncNow(force = true): Promise<{ downloaded: boolean }> {
  if (syncing) return { downloaded: false }
  const last = load<number | undefined>(LAST_KEY, undefined)
  if (!force && last && Date.now() - last < MIN_INTERVAL) return { downloaded: false }
  syncing = true
  lastError = undefined
  emit()
  try {
    const s = await validToken()
    const path = `${BUCKET}/${s.user.id}/copia`
    let downloaded = false
    try {
      const blob = await call<Blob>(`/storage/v1/object/authenticated/${path}`, { token: s.access_token })
      await importBackup(await decode(blob))
      downloaded = true
    } catch (e) {
      // Si aún no hay copia en la nube (primer dispositivo), se sube la local.
      if (!(e instanceof SyncError && (e.message === '404' || /\(400\)/.test(e.message)))) throw e
    }
    const { body, type } = await encode(await exportBackup(true))
    await call(`/storage/v1/object/${path}`, { method: 'POST', token: s.access_token, headers: { 'Content-Type': type, 'x-upsert': 'true' }, body })
    save(LAST_KEY, Date.now())
    if (downloaded) for (const fn of merged) fn()
    return { downloaded }
  } catch (e) {
    lastError = e instanceof SyncError ? e.message : 'Error inesperado al sincronizar.'
    throw e
  } finally {
    syncing = false
    emit()
  }
}

/** Sincroniza sola al abrir la app y al volver a ella, si está configurada y con sesión. */
export function startAutoSync(): () => void {
  const run = () => {
    if (loadSyncConfig() && loadSession() && navigator.onLine) syncNow(false).catch(() => undefined)
  }
  const timer = setTimeout(run, 3000)
  const onVisible = () => document.visibilityState === 'visible' && run()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
