import { load, save } from './storage'

/**
 * Conexión con la cuenta de Lichess para jugar online. Dos formas:
 * - OAuth con PKCE (lo recomendado en el PC): Lichess no exige registrar la app.
 * - Token personal (lo recomendado en la app instalada en el iPhone, donde la vuelta desde Lichess
 *   no llega a la app): se abre la página de Lichess con los permisos ya marcados y se pega el token.
 * El token se queda solo en este dispositivo: no viaja en las copias ni en la sincronización.
 */

export const LICHESS = 'https://lichess.org'
const TOKEN_KEY = 'lichessToken'
const PKCE_KEY = 'lichessPkce'
const CLIENT_ID = 'ajedrez-app'
/** Permisos: jugar con la Board API, crear retos (también contra Stockfish) y leer los recibidos. */
export const SCOPES = ['board:play', 'challenge:read', 'challenge:write']

export interface LichessAccount {
  id: string
  username: string
  perfs?: Record<string, { rating?: number }>
}

export const loadLichessToken = () => load<string | null>(TOKEN_KEY, null)

export function saveLichessToken(token: string | null) {
  save(TOKEN_KEY, token ? token.trim() : null)
}

/** Página de Lichess para crear un token personal con los permisos ya marcados. */
export function tokenCreateUrl(): string {
  const p = new URLSearchParams({ description: 'Ajedrez App' })
  for (const s of SCOPES) p.append('scopes[]', s)
  return `${LICHESS}/account/oauth/token/create?${p}`
}

const appUrl = () => `${location.origin}${import.meta.env.BASE_URL}`

function randomString(len = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'[b % 66]).join('')
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Abre la autorización de Lichess. Al volver, `finishLichessLogin` canjea el código por el token. */
export async function startLichessLogin() {
  const verifier = randomString()
  const state = randomString(16)
  save(PKCE_KEY, { verifier, state })
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: appUrl(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES.join(' '),
    state,
  })
  location.assign(`${LICHESS}/oauth?${p}`)
}

/** Si la página se abre al volver de Lichess (con ?code=...), obtiene el token. Devuelve un mensaje para mostrar o null. */
export async function finishLichessLogin(): Promise<string | null> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return null
  const pkce = load<{ verifier: string; state: string } | null>(PKCE_KEY, null)
  history.replaceState(history.state, '', appUrl())
  save(PKCE_KEY, null)
  if (error) return 'Has cancelado la conexión con Lichess.'
  if (!pkce || params.get('state') !== pkce.state) return 'La respuesta de Lichess no corresponde a esta sesión. Vuelve a intentarlo.'
  try {
    const res = await fetch(`${LICHESS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, code_verifier: pkce.verifier, redirect_uri: appUrl(), client_id: CLIENT_ID }),
    })
    const data = (await res.json()) as { access_token?: string }
    if (!res.ok || !data.access_token) return 'Lichess no ha devuelto el permiso. Vuelve a intentarlo o usa un token.'
    saveLichessToken(data.access_token)
    return 'Conectado con Lichess.'
  } catch {
    return 'No se ha podido conectar con Lichess.'
  }
}

export async function fetchAccount(token = loadLichessToken()): Promise<LichessAccount> {
  if (!token) throw new Error('Falta conectar tu cuenta de Lichess.')
  let res: Response
  try {
    res = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new Error('No se ha podido conectar con Lichess. Revisa la conexión.')
  }
  if (res.status === 401) throw new Error('El permiso de Lichess no es válido o ha caducado. Vuelve a conectar la cuenta.')
  if (!res.ok) throw new Error(`Lichess ha respondido con un error (${res.status}).`)
  return (await res.json()) as LichessAccount
}

export async function revokeLichess() {
  const token = loadLichessToken()
  saveLichessToken(null)
  if (token) await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
}
