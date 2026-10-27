import { load, save } from './storage'

/**
 * Código de acceso de 4 cifras al abrir la app. El código no está en el repositorio: se guarda como
 * secreto de GitHub (APP_PIN) y al publicar solo se incluye su huella (PBKDF2, en vite.config.ts).
 * Una vez acertado, el dispositivo lo recuerda. Es una barrera sencilla para quien tenga la URL,
 * no una protección fuerte: con 4 cifras, quien descargue la app puede probar las combinaciones.
 */

const OK_KEY = 'pinOk'

/** ¿Hay que pedir el código en este dispositivo? Si el código cambia, se vuelve a pedir. */
export const pinRequired = () => Boolean(__PIN__.hash) && load<string>(OK_KEY, '') !== __PIN__.hash

/** Comprueba el código y, si es correcto, lo recuerda en este dispositivo. */
export async function checkPin(pin: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(__PIN__.salt), iterations: __PIN__.iterations }, key, 256)
  const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex !== __PIN__.hash) return false
  save(OK_KEY, hex)
  return true
}
