import { cleanShape, decodeFeatures, encodeFeatures, featureDistance, GRID, normalizeSize, shapeFeatures } from './features'
import TEMPLATES from './templates.json'
import { load, save } from '../storage'

/**
 * Lectura de una posición a partir de una captura de pantalla, sin conexión y sin IA:
 * 1. Se localiza el tablero buscando las 7 líneas interiores que separan las casillas (bordes que
 *    cambian de signo a lo largo de la línea, propios de un tablero de cuadros).
 * 2. En cada casilla se separa la pieza del fondo por color y se compara su silueta con plantillas
 *    de 22 juegos de piezas y con las correcciones que haya hecho el usuario en capturas anteriores.
 */

export interface Img {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface BoardRect {
  x: number
  y: number
  size: number
}

/** Pieza en notación de una letra de color y otra de tipo: «wP», «bK»... */
export type PieceCode = `${'w' | 'b'}${'P' | 'N' | 'B' | 'R' | 'Q' | 'K'}`

export interface SquareRead {
  piece: PieceCode | null
  /** Seguridad de la lectura del tipo, de 0 a 1. */
  conf: number
  /** Rasgos de la silueta, para aprender si el usuario corrige la casilla. */
  feat?: number[]
}

export interface ScanResult {
  rect: BoardRect
  /** Seguridad de la detección del tablero, de 0 a 1. */
  boardConfidence: number
  /** 64 casillas en orden visual: de arriba abajo y de izquierda a derecha. */
  squares: SquareRead[]
  /** true si las blancas parecen estar arriba. */
  flipped: boolean
  /** Bando al que le toca, deducido de la última jugada resaltada (si se ve). */
  toMove: 'w' | 'b' | null
}

const TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'] as const
type PieceType = (typeof TYPES)[number]

interface Template {
  type: PieceType
  f: ArrayLike<number>
}

let templates: Template[] | null = null
function baseTemplates(): Template[] {
  templates ??= (TEMPLATES as { templates: { piece: string; f: string }[] }).templates.map((t) => ({
    type: t.piece[1] as PieceType,
    f: decodeFeatures(t.f),
  }))
  return templates
}

// ---------------------------------------------------------------------------
// Aprendizaje con las correcciones del usuario

const SAMPLES_KEY = 'scanSamples'
const MAX_SAMPLES = 800

interface Sample {
  p: PieceCode
  f: string
}

let learned: Template[] | null = null
function learnedTemplates(): Template[] {
  learned ??= load<Sample[]>(SAMPLES_KEY, []).map((s) => ({ type: s.p[1] as PieceType, f: decodeFeatures(s.f) }))
  return learned
}

/** Guarda las siluetas de una lectura con las piezas definitivas (tras las correcciones del usuario). */
export function learnFromCorrection(squares: SquareRead[], finalPieces: (PieceCode | null)[]) {
  const add: Sample[] = []
  squares.forEach((sq, i) => {
    const p = finalPieces[i]
    if (p && sq.feat) add.push({ p, f: encodeFeatures(sq.feat) })
  })
  if (!add.length) return
  save(SAMPLES_KEY, [...load<Sample[]>(SAMPLES_KEY, []), ...add].slice(-MAX_SAMPLES))
  learned = null
}

export const learnedCount = () => load<Sample[]>(SAMPLES_KEY, []).length

// ---------------------------------------------------------------------------
// Detección del tablero

function toGray(img: Img): Float32Array {
  const g = new Float32Array(img.width * img.height)
  const d = img.data
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
  return g
}

/**
 * Fuerza de cada posible línea vertical (eje x) u horizontal (eje y). En la frontera entre dos
 * columnas de casillas el borde cambia de signo casilla a casilla: el producto de la suma de bordes
 * positivos por la de negativos solo es alto ahí.
 */
function lineScores(g: Float32Array, w: number, h: number, axis: 'x' | 'y', from: number, to: number): Float64Array {
  const len = axis === 'x' ? w : h
  const pos = new Float64Array(len)
  const neg = new Float64Array(len)
  if (axis === 'x') {
    for (let y = from; y < to; y++) {
      const row = y * w
      for (let x = 0; x < w - 1; x++) {
        const d = g[row + x + 1] - g[row + x]
        if (d > 0) pos[x] += d
        else neg[x] -= d
      }
    }
  } else {
    for (let y = 0; y < h - 1; y++) {
      const row = y * w
      for (let x = from; x < to; x++) {
        const d = g[row + w + x] - g[row + x]
        if (d > 0) pos[y] += d
        else neg[y] -= d
      }
    }
  }
  const span = Math.max(1, to - from)
  const out = new Float64Array(len)
  for (let i = 0; i < len; i++) out[i] = (pos[i] * neg[i]) / (span * span)
  // Los bordes con antialias ocupan dos píxeles: se toma el máximo de cada vecindad.
  const sm = new Float64Array(len)
  for (let i = 0; i < len; i++) sm[i] = Math.max(out[i], out[i - 1] ?? 0, out[i + 1] ?? 0)
  return sm
}

/** Mejor serie de 7 líneas equidistantes: devuelve la primera línea, el paso y la fuerza media. */
function bestSeries(score: Float64Array, minStep: number, maxStep: number) {
  let best = { start: 0, step: 0, value: -1 }
  const len = score.length
  for (let step = minStep; step <= maxStep; step += 0.25) {
    for (let start = Math.max(1, step - 3); start + 6 * step < len - 1; start++) {
      let v = 0
      let weakest = Infinity
      for (let k = 0; k < 7; k++) {
        const s = score[Math.round(start + k * step)]
        v += s
        if (s < weakest) weakest = s
      }
      // Las siete líneas tienen que estar; una serie con huecos no es un tablero.
      v += 3 * weakest
      if (v > best.value) best = { start, step, value: v }
    }
  }
  return best
}

export function detectBoard(img: Img): { rect: BoardRect; confidence: number } | null {
  const { width: w, height: h } = img
  const g = toGray(img)
  const minSide = Math.min(w, h)
  const minStep = Math.max(6, (minSide * 0.18) / 8)
  const maxStep = minSide / 8 + 1

  let xs = bestSeries(lineScores(g, w, h, 'x', 0, h), minStep, maxStep)
  let ys = bestSeries(lineScores(g, w, h, 'y', 0, w), minStep, maxStep)
  // Segunda pasada: cada eje medido solo dentro de la franja del otro.
  for (let i = 0; i < 2; i++) {
    const x0 = Math.max(0, Math.round(xs.start - xs.step))
    const x1 = Math.min(w, Math.round(xs.start + 7 * xs.step))
    ys = bestSeries(lineScores(g, w, h, 'y', x0, x1), minStep, maxStep)
    const y0 = Math.max(0, Math.round(ys.start - ys.step))
    const y1 = Math.min(h, Math.round(ys.start + 7 * ys.step))
    xs = bestSeries(lineScores(g, w, h, 'x', y0, y1), minStep, maxStep)
  }
  if (xs.value <= 0 || ys.value <= 0) return null

  const step = (xs.step + ys.step) / 2
  const mismatch = Math.abs(xs.step - ys.step) / step
  const rect = { x: xs.start - xs.step, y: ys.start - ys.step, size: step * 8 }

  // Seguridad: las líneas del tablero tienen que destacar frente a lo que hay entre ellas.
  const xScore = lineScores(g, w, h, 'x', Math.max(0, Math.round(rect.y)), Math.min(h, Math.round(rect.y + rect.size)))
  let peaks = 0
  let mids = 0
  for (let k = 0; k < 7; k++) {
    peaks += xScore[Math.round(xs.start + k * xs.step)]
    mids += xScore[Math.round(xs.start + (k + 0.5) * xs.step)] ?? 0
  }
  const contrast = peaks / (peaks + mids + 1e-9)
  const confidence = Math.max(0, Math.min(1, (contrast - 0.5) * 2 - mismatch * 3))
  return { rect, confidence }
}

// ---------------------------------------------------------------------------
// Lectura de las casillas

interface RawSquare {
  feat?: number[]
  /** Luminosidad media de la pieza. */
  lum: number
  /** Color del fondo de la casilla. */
  bg: [number, number, number]
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)] ?? 0
}

function readSquare(img: Img, x0: number, y0: number, cell: number): RawSquare {
  const S = Math.max(16, Math.round(cell))
  const scale = cell / S
  const px = new Uint8ClampedArray(S * S * 3)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, Math.round(x0 + (x + 0.5) * scale)))
      const sy = Math.min(img.height - 1, Math.max(0, Math.round(y0 + (y + 0.5) * scale)))
      const j = (sy * img.width + sx) * 4
      const k = (y * S + x) * 3
      px[k] = img.data[j]
      px[k + 1] = img.data[j + 1]
      px[k + 2] = img.data[j + 2]
    }
  }
  // Fondo: mediana del anillo exterior de la casilla.
  const ring = Math.max(1, Math.round(S * 0.07))
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x >= ring && x < S - ring && y >= ring && y < S - ring) continue
      const k = (y * S + x) * 3
      rs.push(px[k])
      gs.push(px[k + 1])
      bs.push(px[k + 2])
    }
  }
  const bg: [number, number, number] = [median(rs), median(gs), median(bs)]
  const margin = Math.max(1, Math.round(S * 0.03))
  const raw = new Uint8Array(S * S)
  for (let y = margin; y < S - margin; y++) {
    for (let x = margin; x < S - margin; x++) {
      const k = (y * S + x) * 3
      const dr = px[k] - bg[0]
      const dg = px[k + 1] - bg[1]
      const db = px[k + 2] - bg[2]
      if (dr * dr + dg * dg + db * db > 38 * 38) raw[y * S + x] = 1
    }
  }
  const shape = cleanShape(raw, S, S)
  if (!shape || shape.area < 0.06 || shape.box.y1 - shape.box.y0 < S * 0.3) return { lum: 0, bg }
  let sum = 0
  let n = 0
  for (let i = 0; i < S * S; i++) {
    if (!shape.mask[i]) continue
    sum += 0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2]
    n++
  }
  return { feat: shapeFeatures(shape, S, S), lum: sum / n, bg }
}

/** Distancia mínima de una silueta a las plantillas de cada tipo de pieza. */
function typeDistances(feat: number[]): Record<PieceType, number> {
  const d = { P: Infinity, N: Infinity, B: Infinity, R: Infinity, Q: Infinity, K: Infinity }
  for (const t of baseTemplates()) d[t.type] = Math.min(d[t.type], featureDistance(feat, t.f))
  // Las correcciones del usuario corresponden a su estilo de piezas: pesan algo más.
  for (const t of learnedTemplates()) d[t.type] = Math.min(d[t.type], featureDistance(feat, t.f) * 0.8)
  return d
}

const sortedTypes = (d: Record<PieceType, number>) => [...TYPES].sort((a, b) => d[a] - d[b])

export function readBoard(img: Img, rect: BoardRect, boardConfidence = 1): ScanResult {
  const cell = rect.size / 8
  const raws: RawSquare[] = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) raws.push(readSquare(img, rect.x + c * cell, rect.y + r * cell, cell))

  // Color de las piezas: se separan en dos grupos por luminosidad.
  const lums = raws.filter((s) => s.feat).map((s) => s.lum)
  let lo = Math.min(...lums)
  let hi = Math.max(...lums)
  for (let it = 0; it < 10 && lums.length; it++) {
    const mid = (lo + hi) / 2
    const a = lums.filter((l) => l < mid)
    const b = lums.filter((l) => l >= mid)
    if (a.length) lo = a.reduce((s, v) => s + v, 0) / a.length
    if (b.length) hi = b.reduce((s, v) => s + v, 0) / b.length
  }
  const cut = hi - lo > 40 ? (lo + hi) / 2 : 128

  // Tamaños respecto a la pieza más alta del tablero (siempre hay un rey).
  const tallest = Math.max(1e-6, ...raws.map((s) => (s.feat ? s.feat[GRID * GRID] : 0)))
  for (const s of raws) if (s.feat) s.feat = normalizeSize(s.feat, tallest)
  const dists = raws.map((s) => (s.feat ? typeDistances(s.feat) : null))
  const squares: SquareRead[] = raws.map((s, i) => {
    const d = dists[i]
    if (!s.feat || !d) return { piece: null, conf: 1 }
    const [first, second] = sortedTypes(d)
    const color = s.lum >= cut ? 'w' : 'b'
    return { piece: `${color}${first}` as PieceCode, conf: Math.max(0, Math.min(1, (d[second] - d[first]) / (d[second] + 1e-9))), feat: s.feat }
  })

  // Orientación: normalmente las blancas están abajo.
  const rowsOf = (color: 'w' | 'b') => squares.flatMap((s, i) => (s.piece?.[0] === color ? [Math.floor(i / 8)] : []))
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 3.5)
  const flipped = avg(rowsOf('w')) < avg(rowsOf('b'))

  fixImpossible(squares, dists)

  return { rect, boardConfidence, squares, flipped, toMove: sideToMove(raws, squares) }
}

/** Corrige lecturas imposibles: peones en la primera o la última fila y reyes de más o de menos. */
function fixImpossible(squares: SquareRead[], dists: (Record<PieceType, number> | null)[]) {
  const nextBest = (i: number, exclude: PieceType[]) => sortedTypes(dists[i]!).find((t) => !exclude.includes(t))!
  squares.forEach((s, i) => {
    const row = Math.floor(i / 8)
    if (s.piece?.[1] === 'P' && (row === 0 || row === 7)) s.piece = `${s.piece[0]}${nextBest(i, ['P', 'K'])}` as PieceCode
  })
  for (const color of ['w', 'b'] as const) {
    const mine = squares.flatMap((s, i) => (s.piece?.[0] === color ? [i] : []))
    const kings = mine.filter((i) => squares[i].piece![1] === 'K')
    if (kings.length > 1) {
      kings.sort((a, b) => dists[a]!.K - dists[b]!.K)
      for (const i of kings.slice(1)) squares[i].piece = `${color}${nextBest(i, ['K'])}` as PieceCode
    } else if (!kings.length && mine.length) {
      // La pieza más parecida a un rey pasa a serlo.
      const i = [...mine].sort((a, b) => dists[a]!.K - dists[b]!.K)[0]
      squares[i].piece = `${color}K` as PieceCode
      squares[i].conf = 0
    }
  }
}

/** Si la última jugada está resaltada (dos casillas de otro color), le toca al bando contrario al de la pieza que movió. */
function sideToMove(raws: RawSquare[], squares: SquareRead[]): 'w' | 'b' | null {
  const typical: [number, number, number][] = [0, 1].map((parity) => {
    const bgs = raws.filter((_, i) => (Math.floor(i / 8) + (i % 8)) % 2 === parity).map((s) => s.bg)
    return [median(bgs.map((b) => b[0])), median(bgs.map((b) => b[1])), median(bgs.map((b) => b[2]))]
  })
  const marked = raws.flatMap((s, i) => {
    const t = typical[(Math.floor(i / 8) + (i % 8)) % 2]
    const d = Math.hypot(s.bg[0] - t[0], s.bg[1] - t[1], s.bg[2] - t[2])
    return d > 30 ? [i] : []
  })
  if (marked.length < 1 || marked.length > 2) return null
  const occupied = marked.filter((i) => squares[i].piece)
  if (occupied.length !== 1) return null
  return squares[occupied[0]].piece![0] === 'w' ? 'b' : 'w'
}

/** Detecta el tablero y lee las piezas. Devuelve null si no se encuentra un tablero. */
export function scanImage(img: Img): ScanResult | null {
  const found = detectBoard(img)
  if (!found) return null
  return readBoard(img, found.rect, found.confidence)
}

// ---------------------------------------------------------------------------
// Paso a FEN

/** Pasa las 64 casillas (orden visual) a la parte de piezas de una FEN, con las blancas abajo. */
export function piecesToBoard(pieces: (PieceCode | null)[], flipped: boolean): (PieceCode | null)[] {
  return flipped ? [...pieces].reverse() : pieces
}

export function boardToFen(board: (PieceCode | null)[], toMove: 'w' | 'b'): string {
  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < 8; c++) {
      const p = board[r * 8 + c]
      if (!p) {
        empty++
        continue
      }
      if (empty) row += empty
      empty = 0
      row += p[0] === 'w' ? p[1] : p[1].toLowerCase()
    }
    if (empty) row += empty
    rows.push(row)
  }
  const at = (sq: string) => board[(8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97)]
  let castling = ''
  if (at('e1') === 'wK') {
    if (at('h1') === 'wR') castling += 'K'
    if (at('a1') === 'wR') castling += 'Q'
  }
  if (at('e8') === 'bK') {
    if (at('h8') === 'bR') castling += 'k'
    if (at('a8') === 'bR') castling += 'q'
  }
  return `${rows.join('/')} ${toMove} ${castling || '-'} - 0 1`
}

export function fenToBoard(fen: string): (PieceCode | null)[] | null {
  const rows = fen.trim().split(/\s+/)[0]?.split('/')
  if (!rows || rows.length !== 8) return null
  const out: (PieceCode | null)[] = []
  for (const row of rows) {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null)
      else if (/[pnbrqkPNBRQK]/.test(ch)) out.push(`${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}` as PieceCode)
      else return null
    }
  }
  return out.length === 64 ? out : null
}
