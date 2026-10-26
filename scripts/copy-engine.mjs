// Copia Stockfish (versión lite de un solo hilo) a public/engine para servirlo como Web Worker.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']

mkdirSync(dest, { recursive: true })
for (const f of files) {
  if (!existsSync(join(src, f))) {
    console.error(`No se encuentra ${f}. Ejecuta npm install.`)
    process.exit(1)
  }
  copyFileSync(join(src, f), join(dest, f))
}
console.log('Motor Stockfish copiado a public/engine')
