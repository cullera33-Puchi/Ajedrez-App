import { useEffect, useRef, useState } from 'react'
import { checkPin, pinRequired } from '../lib/pin'

const MAX_FAILS = 5
const WAIT_MS = 30_000

/** Pide el código de acceso antes de mostrar la app (solo la primera vez en cada dispositivo). */
export function PinGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(pinRequired)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const fails = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!blocked) return
    const t = setTimeout(() => {
      setBlocked(false)
      setError('')
      input.current?.focus()
    }, WAIT_MS)
    return () => clearTimeout(t)
  }, [blocked])

  if (!locked) return <>{children}</>

  const submit = async (value: string) => {
    setChecking(true)
    const ok = await checkPin(value).catch(() => false)
    setChecking(false)
    if (ok) return setLocked(false)
    setPin('')
    fails.current++
    if (fails.current >= MAX_FAILS) {
      fails.current = 0
      setBlocked(true)
      setError('Demasiados intentos. Espera 30 segundos.')
    } else {
      setError('Código incorrecto.')
      input.current?.focus()
    }
  }

  return (
    <main className="pin-gate">
      <form
        className="card pin-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (pin.length === 4) void submit(pin)
        }}
      >
        <span className="brand-icon">♞</span>
        <h1>Ajedrez App</h1>
        <label htmlFor="pin" className="muted">
          Introduce tu código de acceso
        </label>
        <input
          ref={input}
          id="pin"
          className="pin-input"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          autoFocus
          maxLength={4}
          value={pin}
          disabled={checking || blocked}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4)
            setPin(v)
            setError('')
            if (v.length === 4) void submit(v)
          }}
        />
        {error && <p className="msg error">{error}</p>}
        <p className="muted small">Solo se pide la primera vez en cada dispositivo.</p>
      </form>
    </main>
  )
}
