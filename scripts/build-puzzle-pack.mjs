/**
 * Genera el paquete de problemas sin conexión a partir de la base de problemas de Lichess
 * (https://database.lichess.org/#puzzles, licencia CC0). Se ejecuta al publicar en GitHub Pages:
 *
 *   zstdcat lichess_db_puzzle.csv.zst | node scripts/build-puzzle-pack.mjs public/puzzles/pack.json
 *
 * Elige problemas populares y fiables de 400 a 1500 de dificultad, repartidos por tramos de 100
 * puntos y por temas de principiante. La selección es estable: depende solo del identificador.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Chess } from 'chess.js'

const out = process.argv[2]
if (!out) throw new Error('Falta la ruta de salida.')

const MIN = 400
const MAX = 1500
const PER_BUCKET = Number(process.env.PER_BUCKET ?? 45)
/** Temas por orden de prioridad para repartir; el resto va a «otros». */
const THEMES = ['mateIn1', 'hangingPiece', 'fork', 'mateIn2', 'backRankMate', 'pin', 'skewer', 'promotion', 'defensiveMove', 'discoveredAttack', 'endgame']

/** Hash estable de 32 bits (FNV-1a) para muestrear siempre los mismos problemas. */
function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const buckets = new Map()
let read = 0
let kept = 0
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of rl) {
  read++
  if (read === 1 && line.startsWith('PuzzleId')) continue
  const [id, fen, moves, rating, deviation, popularity, plays, themes] = line.split(',')
  const r = Number(rating)
  if (!(r >= MIN && r < MAX) || Number(deviation) > 100 || Number(popularity) < 80 || Number(plays) < 100) continue
  const ts = themes.split(' ')
  const theme = THEMES.find((t) => ts.includes(t)) ?? 'otros'
  const key = `${Math.floor(r / 100)}|${theme}`
  const h = hash(id)
  let b = buckets.get(key)
  if (!b) buckets.set(key, (b = []))
  const cap = theme === 'otros' ? Math.floor(PER_BUCKET / 2) : PER_BUCKET
  if (b.length < cap) {
    b.push({ h, row: [id, fen, moves, r, themes] })
    kept++
  } else {
    let maxI = 0
    for (let i = 1; i < b.length; i++) if (b[i].h > b[maxI].h) maxI = i
    if (h < b[maxI].h) b[maxI] = { h, row: [id, fen, moves, r, themes] }
  }
}

// En la base, la FEN es la posición antes de la jugada del rival; la primera jugada es la suya.
const puzzles = []
for (const b of buckets.values()) {
  for (const { row } of b) {
    const [id, fen, moves, rating, themes] = row
    const uci = moves.split(' ')
    try {
      const c = new Chess(fen)
      c.move({ from: uci[0].slice(0, 2), to: uci[0].slice(2, 4), promotion: uci[0][4] })
      puzzles.push([id, c.fen(), uci.slice(1).join(' '), rating, themes, uci[0].slice(0, 4)])
    } catch {
      // Fila con una jugada ilegal: se descarta.
    }
  }
}
puzzles.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : 1))
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ source: 'Lichess (CC0)', generated: new Date().toISOString().slice(0, 10), puzzles }))
console.log(`Leídas ${read} filas; ${puzzles.length} problemas en ${out} (${kept} candidatos guardados).`)
