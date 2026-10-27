import { useEffect, useRef } from 'react'

/**
 * Navegación hacia atrás: el gesto o botón atrás del sistema (Android, Safari), el botón atrás del
 * navegador y, en el móvil, el gesto del borde izquierdo cuando hay algo abierto que cerrar.
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

/** ¿Hay algo abierto que el gesto atrás deba cerrar (una variante, una lección, una apertura…)? */
export const hasBackHandler = () => handlers.length > 0

/** ¿Es la app instalada en un iPhone o iPad? */
const isIosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Conecta el botón y el gesto atrás del sistema (Android, Safari, navegador del PC) con `goBack`,
 * a través del historial. En la app instalada en iOS no hay botón atrás y el gesto del borde
 * izquierdo abre el menú (src/components/MobileMenu.tsx): ahí no se toca el historial, porque el
 * sistema mostraría al deslizar una página anterior vacía (gris).
 */
export function installBackNavigation(): () => void {
  if (isIosStandalone()) return () => undefined
  // Una entrada de historial de reserva: cada «atrás» del sistema la consume y se vuelve a poner.
  history.replaceState({ ajedrez: 'base' }, '')
  history.pushState({ ajedrez: 'app' }, '')
  const onPop = () => {
    history.pushState({ ajedrez: 'app' }, '')
    goBack()
  }
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}
