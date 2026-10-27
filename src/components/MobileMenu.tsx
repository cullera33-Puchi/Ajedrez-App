import { useEffect, useRef, useState } from 'react'
import { goBack, hasBackHandler, useBackHandler } from '../lib/nav'

export interface MenuItem<V extends string> {
  id: V
  label: string
  icon: React.ReactNode
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

/** Ancho de la franja del borde izquierdo donde empieza el gesto. */
const EDGE = 24
/** Recorrido del gesto atrás para que cuente. */
const BACK_TRIGGER = 70

/**
 * Menú del móvil: un panel lateral que se abre deslizando desde el borde izquierdo (el panel
 * sigue al dedo). Si hay algo abierto
 * encima de la pantalla (una variante, una lección, una apertura), ese mismo gesto lo cierra.
 * Sustituye a la barra de pestañas para ganar altura. En el ordenador y la tablet no se muestra.
 */
export function MobileMenu<V extends string>({ items, extra, isActive, onSelect }: Props<V>) {
  const [open, setOpen] = useState(false)
  const drawer = useRef<HTMLElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const closeStart = useRef<number | null>(null)
  const close = () => setOpen(false)
  // El gesto o botón atrás cierra primero el menú.
  useBackHandler(open, close)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Gesto desde el borde izquierdo: abre el menú siguiendo el dedo, o va atrás si hay algo abierto.
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 800px)')
    let start: { x: number; y: number } | null = null
    let mode: 'menu' | 'back' | null = null
    let horizontal = false
    let dx = 0
    let width = 300

    const paint = (offset: number | null) => {
      const d = drawer.current
      const b = backdrop.current
      if (!d || !b) return
      if (offset === null) {
        d.style.transform = ''
        d.style.transition = ''
        b.style.opacity = ''
        b.style.transition = ''
        return
      }
      d.style.transition = 'none'
      b.style.transition = 'none'
      d.style.transform = `translateX(${Math.min(0, offset - width)}px)`
      b.style.opacity = String(Math.max(0, Math.min(1, offset / width)))
    }
    const paintBack = (offset: number | null) => {
      const el = indicator.current
      if (!el) return
      const shown = offset === null ? 0 : Math.max(0, Math.min(BACK_TRIGGER, offset))
      el.style.opacity = String(shown / BACK_TRIGGER)
      el.style.transform = `translate(${shown}px, -50%)`
    }
    const reset = () => {
      if (mode === 'menu') paint(null)
      if (mode === 'back') paintBack(null)
      start = null
      mode = null
      horizontal = false
      dx = 0
    }

    const onStart = (e: TouchEvent) => {
      if (!mobile.matches || open || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE) return
      // Sobre el tablero o un campo de texto, el toque es para eso.
      if ((e.target as Element | null)?.closest?.('cg-board, .scan-editor, input, textarea, select')) return
      start = { x: t.clientX, y: t.clientY }
      mode = hasBackHandler() ? 'back' : 'menu'
      width = drawer.current?.offsetWidth || 300
    }
    const onMove = (e: TouchEvent) => {
      if (!start || !mode) return
      const t = e.touches[0]
      dx = t.clientX - start.x
      const dy = Math.abs(t.clientY - start.y)
      // Si el dedo va más en vertical que en horizontal, es un desplazamiento de la página.
      if (!horizontal) {
        if (dy > 12 && dy > Math.abs(dx)) return reset()
        if (Math.abs(dx) > 8) horizontal = true
        else return
      }
      e.preventDefault()
      if (mode === 'menu') paint(dx)
      else paintBack(dx)
    }
    const onEnd = () => {
      if (!start || !mode) return reset()
      if (mode === 'menu' && dx > width * 0.3) {
        // Termina de abrirse desde donde está el dedo, con la animación normal.
        const d = drawer.current
        const b = backdrop.current
        if (d && b) {
          d.style.transition = ''
          b.style.transition = ''
          d.style.transform = 'translateX(0)'
          b.style.opacity = '1'
          setTimeout(() => {
            d.style.transform = ''
            b.style.opacity = ''
          }, 300)
        }
        start = null
        mode = null
        horizontal = false
        dx = 0
        setOpen(true)
        return
      }
      const back = mode === 'back' && dx >= BACK_TRIGGER
      reset()
      if (back) goBack()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', reset)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }, [open])

  const pick = (id: V) => {
    close()
    onSelect(id)
  }
  const entry = (i: MenuItem<V>) => (
    <button key={i.id} className={`drawer-item ${isActive(i.id) ? 'active' : ''}`} onClick={() => pick(i.id)}>
      <span className="nav-icon">{i.icon}</span>
      {i.label}
      {i.dot && <span className="drawer-dot" aria-label="Aviso" />}
    </button>
  )

  return (
    <>
      <div ref={indicator} className="back-indicator" aria-hidden="true">
        ‹
      </div>
      <div ref={backdrop} className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={close} aria-hidden="true" />
      <nav
        ref={drawer}
        className={`drawer ${open ? 'open' : ''}`}
        aria-label="Menú"
        inert={!open}
        // Con el menú abierto, deslizar hacia la izquierda lo cierra.
        onTouchStart={(e) => (closeStart.current = e.touches[0].clientX)}
        onTouchMove={(e) => {
          if (closeStart.current !== null && e.touches[0].clientX - closeStart.current < -60) {
            closeStart.current = null
            close()
          }
        }}
        onTouchEnd={() => (closeStart.current = null)}
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
