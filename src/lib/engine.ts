/** Evaluación devuelta por el motor, desde el punto de vista del bando que mueve. */
export interface EngineResult {
  cp?: number
  mate?: number
  best?: string
  pv: string[]
  depth: number
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

/** Envoltorio UCI sobre Stockfish en un Web Worker. Las búsquedas se encolan y se ejecutan de una en una. */
class Engine {
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

  evaluate(fen: string, depth: number): Promise<EngineResult> {
    const run = async (): Promise<EngineResult> => {
      const result: EngineResult = { pv: [], depth: 0 }
      await this.waitFor(
        [`position fen ${fen}`, `go depth ${depth}`],
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (l.startsWith('bestmove')) {
            const best = l.split(' ')[1]
            if (best && best !== '(none)') result.best = best
            return
          }
          const m = l.match(/^info .*?depth (\d+) .*?score (cp|mate) (-?\d+)(?:.* pv (.+))?/)
          if (!m || l.includes('multipv 2')) return
          result.depth = Number(m[1])
          if (m[2] === 'cp') {
            result.cp = Number(m[3])
            result.mate = undefined
          } else {
            result.mate = Number(m[3])
            result.cp = undefined
          }
          if (m[4]) result.pv = m[4].split(' ')
        },
      )
      return result
    }
    const job = this.queue.then(run)
    this.queue = job.catch(() => undefined)
    return job
  }
}

let instance: Engine | null = null

export function getEngine(): Engine {
  instance ??= new Engine()
  return instance
}
