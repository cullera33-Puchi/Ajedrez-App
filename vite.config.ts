/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { coachPlugin } from './server/coach.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // En GitHub Pages la app vive en /ajedrez-app/; en el PC, en la raíz.
    base: env.BASE_PATH || '/',
    plugins: [
      react(),
      coachPlugin({
        root: process.cwd(),
        provider: env.COACH_PROVIDER,
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.ANTHROPIC_BASE_URL || undefined,
      }),
    ],
    server: { open: true },
    preview: { open: true },
    test: { environment: 'node' },
  }
})
