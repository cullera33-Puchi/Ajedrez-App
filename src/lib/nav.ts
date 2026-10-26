import { useEffect, useRef } from 'react'

/**
 * Navegación hacia atrás: el gesto de deslizar desde el borde izquierdo (en la app instalada en el
 * iPhone), el gesto o botón atrás del sistema (Android, Safari) y el botón atrás del navegador.
 *
 * Orden de prioridad al ir atrás:
 * 1. Si hay una partida en marcha (contra un bot o una lección empezada), no se sale: solo se avisa.
 * 2. Si una pantalla tiene algo abierto (una variante, una lección), se cierra eso.
 * 3. Si no, se vuelve a la pantalla anterior.
 */

type Entry = { id: number; fn: () => void }

const guards: { id: number; message: string }[] = []
const handlers: Entry[] = []
let viewBack: (() => boolean) | null = null
let toastListener: ((msg: string) => void) | null = null
let nextId = 1

export function showToast(msg: string) {
  toastListener?.(msg)
}

export function onToast(fn: ((msg: string) => void) | null) {
  toastListener = fn
}

/** La app registra aquí cómo volver a la pantalla anterior. Devuelve false si no hay a dónde volver. */
export function setViewBack(fn: (() => boolean) | null) {
  viewBack = fn
}

/** Va atrás según las prioridades descritas arriba. */
export function goBack() {
  const guard = guards[guards.length - 1]
  if (guard) {
    showToast(guard.message)
    return
  }
  const h = handlers[handlers.length - 1]
  if (h) {
    h.fn()
    return
  }
  viewBack?.()
}

/** Mientras `active`, ir atrás no sale de la pantalla: muestra `message`. */
export function useBackGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return
    const id = nextId++
    guards.push({ id, message })
    return () => {
      const i = guards.findIndex((g) => g.id === id)
      if (i >= 0) guards.splice(i, 1)
    }
  }, [active, message])
}

/** Mientras `active`, ir atrás llama a `fn` (por ejemplo, para cerrar una variante). */
export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!active) return
    const id = nextId++
    handlers.push({ id, fn: () => ref.current() })
    return () => {
      const i = handlers.findIndex((h) => h.id === id)
      if (i >= 0) handlers.splice(i, 1)
    }
  }, [active])
}

/** ¿Es la app instalada en un iPhone o iPad? Ahí el sistema no tiene gesto de volver atrás. */
const isIosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Conecta el botón y el gesto atrás del sistema (a través del historial del navegador) y, en la app
 * instalada en iOS, el gesto de deslizar desde el borde izquierdo. Devuelve la función para quitarlo.
 */
export function installBackNavigation(indicator: HTMLElement): () => void {
  // Una entrada de historial de reserva: cada «atrás» del sistema la consume y se vuelve a poner.
  history.replaceState({ ajedrez: 'base' }, '')
  history.pushState({ ajedrez: 'app' }, '')
  const onPop = () => {
    history.pushState({ ajedrez: 'app' }, '')
    goBack()
  }
  window.addEventListener('popstate', onPop)

  const EDGE = 22
  const TRIGGER = 70
  let start: { x: number; y: number } | null = null
  let dx = 0
  const reset = () => {
    start = null
    dx = 0
    indicator.style.transform = ''
    indicator.style.opacity = '0'
  }
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0]
    if (e.touches.length !== 1 || t.clientX > EDGE) return
    // Sobre el tablero, el toque es para mover piezas.
    if ((e.target as Element | null)?.closest?.('cg-board, .scan-editor, input, textarea')) return
    start = { x: t.clientX, y: t.clientY }
  }
  const onMove = (e: TouchEvent) => {
    if (!start) return
    const t = e.touches[0]
    dx = t.clientX - start.x
    if (Math.abs(t.clientY - start.y) > 60) return reset()
    const shown = Math.max(0, Math.min(TRIGGER, dx))
    indicator.style.opacity = String(shown / TRIGGER)
    indicator.style.transform = `translate(${shown}px, -50%)`
  }
  const onEnd = () => {
    const go = start && dx >= TRIGGER
    reset()
    if (go) goBack()
  }
  const touch = isIosStandalone()
  if (touch) {
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', reset)
  }
  return () => {
    window.removeEventListener('popstate', onPop)
    if (touch) {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }
}
