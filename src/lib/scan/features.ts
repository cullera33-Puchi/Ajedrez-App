/**
 * Rasgos de forma de una pieza a partir de su máscara (1 = pieza, 0 = fondo) dentro de una casilla.
 * Se usan igual para las plantillas (generadas con scripts/build-piece-templates.ts) y para las capturas.
 * Sin dependencias, para poder ejecutarlo también en Node.
 */

/** Lado de la rejilla en la que se resume la silueta. */
export const GRID = 16
/** Número de valores del vector de rasgos: la rejilla, el alto y el ancho relativos a la casilla. */
export const FEATURE_LEN = GRID * GRID + 2

/** Se queda con la mancha más grande (vecindad de 4) y descarta el resto: coordenadas, restos de bordes... */
export function largestComponent(mask: Uint8Array, w: number, h: number): { mask: Uint8Array; size: number } {
  const label = new Int32Array(w * h)
  let best = 0
  let bestSize = 0
  let next = 1
  const stack: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue
    let size = 0
    stack.push(i)
    label[i] = next
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % w
      const y = (p - x) / w
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of nb) {
        if (q >= 0 && mask[q] && !label[q]) {
          label[q] = next
          stack.push(q)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
    next++
  }
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (label[i] === best && best) out[i] = 1
  return { mask: out, size: bestSize }
}

/** Rellena los huecos interiores: todo lo que no se alcanza desde el borde sin cruzar la pieza. */
export function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (p: number) => {
    if (!mask[p] && !outside[p]) {
      outside[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
  }
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1
  return out
}

export interface Shape {
  /** Silueta limpia (mancha principal con los huecos rellenos). */
  mask: Uint8Array
  /** Proporción de la casilla que ocupa. */
  area: number
  box: { x0: number; y0: number; x1: number; y1: number }
}

export function cleanShape(raw: Uint8Array, w: number, h: number): Shape | null {
  const { mask, size } = largestComponent(raw, w, h)
  if (!size) return null
  const filled = fillHoles(mask, w, h)
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  let area = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled[y * w + x]) continue
      area++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return { mask: filled, area: area / (w * h), box: { x0, y0, x1, y1 } }
}

/**
 * Vector de rasgos: la silueta recortada a su caja, centrada y escalada a una rejilla GRID x GRID
 * conservando la proporción, más el alto y el ancho de la caja respecto a la casilla.
 */
export function shapeFeatures(shape: Shape, w: number, h: number, mirror = false): number[] {
  const { x0, y0, x1, y1 } = shape.box
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const side = Math.max(bw, bh)
  const ox = x0 - (side - bw) / 2
  const oy = y0 - (side - bh) / 2
  const grid = new Array<number>(GRID * GRID).fill(0)
  const count = new Array<number>(GRID * GRID).fill(0)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let gx = Math.min(GRID - 1, Math.floor(((x - ox) / side) * GRID))
      const gy = Math.min(GRID - 1, Math.floor(((y - oy) / side) * GRID))
      if (mirror) gx = GRID - 1 - gx
      const k = gy * GRID + gx
      grid[k] += shape.mask[y * w + x]
      count[k]++
    }
  }
  const out = grid.map((v, i) => (count[i] ? v / count[i] : 0))
  out.push(bh / h, bw / w)
  return out
}

/**
 * Expresa el alto y el ancho respecto a la pieza más alta del mismo juego (normalmente el rey), para
 * que no importe cuánto ocupan las piezas en la casilla en cada aplicación.
 */
export function normalizeSize(f: number[], tallest: number): number[] {
  const n = GRID * GRID
  const out = [...f]
  out[n] = f[n] / tallest
  out[n + 1] = f[n + 1] / tallest
  return out
}

/** Distancia entre dos vectores de rasgos. El tamaño relativo pesa como varias celdas de la rejilla. */
export function featureDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0
  const n = GRID * GRID
  for (let i = 0; i < n; i++) {
    const t = a[i] - b[i]
    d += t * t
  }
  const dh = (a[n] - b[n]) * 20
  const dw = (a[n + 1] - b[n + 1]) * 10
  return d + dh * dh + dw * dw
}

/** Codifica un vector en texto compacto (un carácter por valor, de 0 a 35) para guardarlo. Admite valores de 0 a 1. */
export function encodeFeatures(f: number[]): string {
  return f.map((v) => Math.max(0, Math.min(35, Math.round(v * 35))).toString(36)).join('')
}

export function decodeFeatures(s: string): Float32Array {
  const out = new Float32Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = parseInt(s[i], 36) / 35
  return out
}
