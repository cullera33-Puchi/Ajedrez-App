/**
 * Genera src/lib/scan/templates.json: los rasgos de forma de cada pieza en varios juegos de piezas
 * libres de Lichess (github.com/lichess-org/lila, carpeta public/piece). Solo se guardan los rasgos,
 * no las imágenes.
 *
 * Uso: node --experimental-strip-types scripts/build-piece-templates.ts <carpeta-con-juegos>
 * La carpeta tiene una subcarpeta por juego con wP.svg, wN.svg... bK.svg.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { cleanShape, encodeFeatures, GRID, normalizeSize, shapeFeatures } from '../src/lib/scan/features.ts'

// Playwright se carga con require para usar la instalación global del sistema si no está en el proyecto.
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')

const SIZE = 64
const PIECES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']

const dir = process.argv[2]
if (!dir) throw new Error('Falta la carpeta con los juegos de piezas.')
const sets = fs.readdirSync(dir).filter((s) => PIECES.every((p) => fs.existsSync(path.join(dir, s, `${p}.svg`))))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const templates: { set: string; piece: string; f: string }[] = []
for (const set of sets) {
  const feats: { piece: string; f: number[] }[] = []
  for (const piece of PIECES) {
    const svg = fs.readFileSync(path.join(dir, set, `${piece}.svg`), 'utf8')
    const alpha: number[] = await page.evaluate(
      async ({ svg, size }) => {
        const img = new Image()
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
        await img.decode()
        const c = document.getElementById('c') as HTMLCanvasElement
        c.width = size
        c.height = size
        const ctx = c.getContext('2d')!
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(img, 0, 0, size, size)
        const d = ctx.getImageData(0, 0, size, size).data
        const out: number[] = []
        for (let i = 3; i < d.length; i += 4) out.push(d[i])
        return out
      },
      { svg, size: SIZE },
    )
    const raw = Uint8Array.from(alpha, (a) => (a > 128 ? 1 : 0))
    const shape = cleanShape(raw, SIZE, SIZE)
    if (!shape) continue
    feats.push({ piece, f: shapeFeatures(shape, SIZE, SIZE) })
    // El caballo puede mirar a cualquier lado según el juego de piezas.
    if (piece[1] === 'N') feats.push({ piece, f: shapeFeatures(shape, SIZE, SIZE, true) })
  }
  const tallest = Math.max(...feats.map((x) => x.f[GRID * GRID]))
  for (const x of feats) templates.push({ set, piece: x.piece, f: encodeFeatures(normalizeSize(x.f, tallest)) })
}
await browser.close()

const out = path.join(import.meta.dirname, '..', 'src', 'lib', 'scan', 'templates.json')
fs.writeFileSync(out, JSON.stringify({ sets, templates }))
console.log(`${templates.length} plantillas de ${sets.length} juegos en ${out}`)
