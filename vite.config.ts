/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { coachPlugin } from './server/coach.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      coachPlugin({ root: process.cwd(), apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined }),
    ],
    server: { open: true },
    preview: { open: true },
    test: { environment: 'node' },
  }
})
