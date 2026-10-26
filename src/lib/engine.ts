/** Una línea candidata del motor (con MultiPV hay varias), desde el punto de vista del bando que mueve. */
export interface EngineLine {
  move: string
  cp?: number
  mate?: number
  pv: string[]
}

/** Evaluación devuelta por el motor, desde el punto de vista del bando que mueve. */
export interface EngineResult {
  cp?: number
  mate?: number
  best?: string
  pv: string[]
  depth: number
  /** Líneas candidatas ordenadas de mejor a peor (una sola si multipv = 1). */
  lines: EngineLine[]
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

/** Envoltorio UCI sobre Stockfish en un Web Worker. Las búsquedas se encolan y se ejecutan de una en una. */
export class Engine {
  private worker: Worker
  private listener: ((line: string) => void) | null = null
  private queue: Promise<unknown>
  private failed: Error | null = null

  constructor() {
    this.worker = new Worker(ENGINE_URL)
    this.worker.onmessage = (e) => this.listener?.(String(e.data))
    this.worker.onerror = () => {
      this.failed = new Error('No se ha podido cargar el motor de análisis.')
      this.listener?.('__error__')
    }
    this.queue = this.init()
  }

  private waitFor(send: string[], done: (line: string) => boolean, onLine?: (line: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.failed) return reject(this.failed)
      this.listener = (line) => {
        if (line === '__error__') return reject(this.failed)
        onLine?.(line)
        if (done(line)) {
          this.listener = null
          resolve()
        }
      }
      for (const cmd of send) this.worker.postMessage(cmd)
    })
  }

  private async init() {
    await this.waitFor(['uci'], (l) => l === 'uciok')
    await this.waitFor(['setoption name Hash value 32', 'isready'], (l) => l === 'readyok')
  }

  evaluate(fen: string, depth: number, multipv = 1): Promise<EngineResult> {
    const run = async (): Promise<EngineResult> => {
      const result: EngineResult = { pv: [], depth: 0, lines: [] }
      await this.waitFor(
        [`setoption name MultiPV value ${multipv}`, `position fen ${fen}`, `go depth ${depth}`],
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (l.startsWith('bestmove')) {
            const best = l.split(' ')[1]
            if (best && best !== '(none)') result.best = best
            return
          }
          const m = l.match(/^info .*?depth (\d+) .*?score (cp|mate) (-?\d+)(?:.* pv (.+))?/)
          if (!m || !m[4]) return
          const k = Number(l.match(/ multipv (\d+)/)?.[1] ?? 1)
          const pv = m[4].split(' ')
          const line: EngineLine = { move: pv[0], pv, ...(m[2] === 'cp' ? { cp: Number(m[3]) } : { mate: Number(m[3]) }) }
          result.lines[k - 1] = line
          if (k === 1) {
            result.depth = Number(m[1])
            result.cp = line.cp
            result.mate = line.mate
            result.pv = pv
          }
        },
      )
      result.lines = result.lines.filter(Boolean)
      return result
    }
    const job = this.queue.then(run)
    this.queue = job.catch(() => undefined)
    return job
  }

  terminate() {
    this.worker.terminate()
  }
}

const instances = new Map<string, Engine>()

/**
 * Motor por nombre: «main» para el análisis (interactivo y en segundo plano) y «play» para los bots,
 * así jugar no espera a que termine un análisis.
 */
export function getEngine(name = 'main'): Engine {
  let e = instances.get(name)
  if (!e) {
    e = new Engine()
    instances.set(name, e)
  }
  return e
}

/** Libera un motor que ya no se usa (en el móvil, cada motor ocupa memoria). */
export function releaseEngine(name: string) {
  instances.get(name)?.terminate()
  instances.delete(name)
}
