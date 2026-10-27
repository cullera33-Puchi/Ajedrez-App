import { useEffect, useRef, useState } from 'react'
import { useBackHandler } from '../lib/nav'

export interface MenuItem<V extends string> {
  id: V
  label: string
  icon: string
  /** Punto de aviso (por ejemplo, una partida a medias). */
  dot?: boolean
}

interface Props<V extends string> {
  items: MenuItem<V>[]
  /** Accesos de segundo nivel, debajo de los principales. */
  extra: MenuItem<V>[]
  isActive: (id: V) => boolean
  onSelect: (id: V) => void
}

/**
 * Menú del móvil: un botón abajo a la izquierda abre un panel lateral desde la izquierda. Sustituye a
 * la barra de pestañas para ganar altura en pantalla. En el ordenador y la tablet no se muestra.
 */
export function MobileMenu<V extends string>({ items, extra, isActive, onSelect }: Props<V>) {
  const [open, setOpen] = useState(false)
  const startX = useRef<number | null>(null)
  const close = () => setOpen(false)
  // El gesto o botón atrás cierra primero el menú.
  useBackHandler(open, close)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const pick = (id: V) => {
    close()
    onSelect(id)
  }
  const anyDot = items.some((i) => i.dot)
  const entry = (i: MenuItem<V>) => (
    <button key={i.id} className={`drawer-item ${isActive(i.id) ? 'active' : ''}`} onClick={() => pick(i.id)}>
      <span className="nav-icon">{i.icon}</span>
      {i.label}
      {i.dot && <span className="drawer-dot" aria-label="Aviso" />}
    </button>
  )

  return (
    <>
      <button className="menu-fab" onClick={() => setOpen(true)} aria-label="Abrir el menú" aria-expanded={open}>
        <span aria-hidden="true">☰</span>
        {anyDot && <span className="menu-fab-dot" />}
      </button>
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={close} aria-hidden="true" />
      <nav
        className={`drawer ${open ? 'open' : ''}`}
        aria-label="Menú"
        inert={!open}
        // Deslizar hacia la izquierda cierra el menú.
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchMove={(e) => {
          if (startX.current !== null && e.touches[0].clientX - startX.current < -60) {
            startX.current = null
            close()
          }
        }}
        onTouchEnd={() => (startX.current = null)}
      >
        <div className="drawer-head">
          <span className="brand-icon">♞</span>
          <div>
            <strong>Ajedrez App</strong>
            <small>Aprende jugando</small>
          </div>
        </div>
        <div className="drawer-list">{items.map(entry)}</div>
        <div className="drawer-list drawer-extra">{extra.map(entry)}</div>
      </nav>
    </>
  )
}
