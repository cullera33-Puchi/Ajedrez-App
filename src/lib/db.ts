/**
 * Capa mínima sobre IndexedDB (mucho más espacio que localStorage, que se queda en unos 5 MB).
 * Si IndexedDB no está disponible (pruebas o navegación privada), usa un almacén en memoria.
 */

export type StoreName = 'games' | 'analyses' | 'summaries' | 'puzzles'

const DB_NAME = 'ajedrez-app'
const VERSION = 1
const STORES: StoreName[] = ['games', 'analyses', 'summaries', 'puzzles']

interface Backend {
  getAll<T>(store: StoreName): Promise<T[]>
  get<T>(store: StoreName, key: string): Promise<T | undefined>
  putMany(store: StoreName, entries: [string, unknown][]): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

function idbBackend(db: IDBDatabase): Backend {
  return {
    getAll: (store) => req(db.transaction(store).objectStore(store).getAll()),
    get: (store, key) => req(db.transaction(store).objectStore(store).get(key)),
    putMany: (store, entries) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const os = tx.objectStore(store)
        for (const [k, v] of entries) os.put(v, k)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
    delete: (store, key) => req(db.transaction(store, 'readwrite').objectStore(store).delete(key)).then(() => undefined),
  }
}

function memoryBackend(): Backend {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]))
  return {
    getAll: async <T,>(store: StoreName) => [...data.get(store)!.values()] as T[],
    get: async <T,>(store: StoreName, key: string) => data.get(store)!.get(key) as T | undefined,
    putMany: async (store, entries) => {
      for (const [k, v] of entries) data.get(store)!.set(k, structuredClone(v))
    },
    delete: async (store, key) => {
      data.get(store)!.delete(key)
    },
  }
}

let backend: Promise<Backend> | null = null

function open(): Promise<Backend> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(memoryBackend())
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB_NAME, VERSION)
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s)
      }
      r.onsuccess = () => resolve(idbBackend(r.result))
      r.onerror = () => resolve(memoryBackend())
      r.onblocked = () => resolve(memoryBackend())
    } catch {
      resolve(memoryBackend())
    }
  })
}

export const db = (): Promise<Backend> => (backend ??= open())

/** Solo para pruebas: empieza con un almacén vacío. */
export function resetDbForTests() {
  backend = Promise.resolve(memoryBackend())
}
