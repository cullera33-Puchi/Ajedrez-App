import { useEffect } from 'react'
import { logWarn } from './log'

/**
 * Mantiene la pantalla encendida mientras `active` (partida en marcha). El sistema suelta el bloqueo
 * al salir de la app, así que se vuelve a pedir al volver a ella. Sin soporte del navegador, no hace nada.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const l = await navigator.wakeLock.request('screen')
        if (stopped) void l.release()
        else lock = l
      } catch (e) {
        // Puede fallar sin interacción previa o con ahorro de batería: no es grave.
        logWarn('No se ha podido mantener la pantalla encendida', e)
      }
    }
    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [active])
}
