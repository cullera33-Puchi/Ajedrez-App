import { useEffect, useState } from 'react'
import { clearSync, DEFAULT_SYNC, onSyncState, saveSyncConfig, signIn, signOut, signUp, syncNow, syncState, type SyncState } from '../lib/sync'

const GUIDE = 'https://github.com/cullera33-Puchi/Ajedrez-App/blob/main/docs/SINCRONIZACION.md'

const ago = (t?: number) => {
  if (!t) return 'nunca'
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(t).toLocaleDateString('es-ES')
}

/** Tarjeta de Inicio para configurar y usar la sincronización entre dispositivos. */
export function SyncCard() {
  const [state, setState] = useState<SyncState>(syncState)
  const [url, setUrl] = useState(DEFAULT_SYNC.url)
  const [key, setKey] = useState(DEFAULT_SYNC.anonKey)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => onSyncState(setState), [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false)
      setState(syncState())
    }
  }

  const sync = () =>
    run(async () => {
      const r = await syncNow(true)
      setMsg({ kind: 'ok', text: r.downloaded ? 'Sincronizado: se han traído y fusionado los datos de tus otros dispositivos.' : 'Sincronizado: tus datos ya están en la nube.' })
    })

  return (
    <section className="card">
      <h2>Sincronización</h2>
      {!state.configured ? (
        <>
          <p className="muted small">
            Mantén iguales el móvil, el PC y la tablet de forma automática. Los datos de tu proyecto de Supabase ya están puestos: pulsa Guardar y entra con tu correo.{' '}
            <a href={GUIDE} target="_blank" rel="noreferrer">
              Guía paso a paso
            </a>
            .
          </p>
          <label className="field">
            <span>Dirección del proyecto (Project URL)</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcd.supabase.co" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field">
            <span>Clave pública (publishable)</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_..." autoCapitalize="none" spellCheck={false} />
          </label>
          <button className="btn primary small" disabled={!url || !key} onClick={() => run(async () => saveSyncConfig(url, key))}>
            Guardar
          </button>
        </>
      ) : !state.email ? (
        <>
          <p className="muted small">Entra con tu cuenta. En el primer dispositivo, créala; en los demás, usa el mismo correo y contraseña.</p>
          <label className="field">
            <span>Correo</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoComplete="email" />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <div className="toolbar">
            <button className="btn primary small" disabled={busy || !email || !password} onClick={() =>
                run(async () => {
                  await signIn(email, password)
                  const r = await syncNow(true)
                  setMsg({ kind: 'ok', text: r.downloaded ? 'Conectado. Se han traído los datos de tus otros dispositivos.' : 'Conectado. Tus datos ya están en la nube.' })
                })
              }>
              Entrar
            </button>
            <button
              className="btn small"
              disabled={busy || !email || !password}
              onClick={() =>
                run(async () => {
                  const ok = await signUp(email, password)
                  if (ok) {
                    await syncNow(true)
                    setMsg({ kind: 'ok', text: 'Cuenta creada y datos subidos a la nube.' })
                  } else setMsg({ kind: 'info', text: 'Cuenta creada. Supabase te ha enviado un correo: confírmalo y después pulsa Entrar.' })
                })
              }
            >
              Crear cuenta
            </button>
            <button className="btn small" onClick={clearSync}>
              Quitar configuración
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">
            Conectado como <strong>{state.email}</strong>. Última sincronización: {ago(state.lastSync)}.
          </p>
          <p className="muted small">Se sincroniza sola al abrir la app y al volver a ella. Las partidas, análisis, problemas y ajustes se fusionan sin borrar nada.</p>
          <div className="toolbar">
            <button className="btn primary small" disabled={busy || state.syncing} onClick={sync}>
              {state.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
            <button className="btn small" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
          {state.error && !msg && <p className="msg error small">{state.error}</p>}
        </>
      )}
      {msg && <p className={`msg ${msg.kind} small`}>{msg.text}</p>}
    </section>
  )
}
