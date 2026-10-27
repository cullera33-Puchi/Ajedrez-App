/// <reference types="vitest/config" />
import { pbkdf2Sync } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { coachPlugin } from './server/coach.ts'

/**
 * Código de acceso (src/lib/pin.ts): se toma de APP_PIN, que en GitHub es un secreto del repositorio,
 * y en la app solo se incluye su huella. Sin APP_PIN (por ejemplo, en el PC) no se pide código.
 */
function pinConfig(pin: string | undefined) {
  const salt = 'ajedrez-app-pin-v1'
  const iterations = 200_000
  if (!pin) return { hash: '', salt, iterations }
  if (!/^\d{4}$/.test(pin)) throw new Error('APP_PIN tiene que ser un código de 4 cifras.')
  return { hash: pbkdf2Sync(pin, salt, iterations, 32, 'sha256').toString('hex'), salt, iterations }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    define: { __PIN__: JSON.stringify(pinConfig(env.APP_PIN?.trim())) },
    // En GitHub Pages la app vive en /Ajedrez-App/ (el nombre del repositorio); en el PC, en la raíz.
    base: env.BASE_PATH || '/',
    plugins: [
      react(),
      coachPlugin(),
    ],
    server: { open: true },
    preview: { open: true },
    test: { environment: 'node' },
  }
})
