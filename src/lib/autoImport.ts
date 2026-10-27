import { importChesscomHistory } from './chesscom'
import { getGames, mergeGames } from './games'
import { importLichessNew, lichessImported } from './lichess'
import type { Settings } from './settings'
import { load, save } from './storage'
import type { GameSummary } from './types'

/**
 * Importación automática: al abrir la app (y al volver a ella tras un rato) trae tus partidas nuevas
 * de Chess.com y Lichess, sin pulsar nada. Solo si ya importaste alguna vez a mano: la primera
 * importación, que puede traer años de partidas, se hace desde Partidas con su barra de progreso.
 * El análisis en segundo plano se encarga después de las partidas nuevas.
 */

const LAST_KEY = 'autoImportLast'
/** Tiempo mínimo entre dos importaciones automáticas. */
const MIN_INTERVAL = 30 * 60 * 1000

let running = false

const chesscomImported = (user: string) => Boolean(load<Record<string, string[]>>('chesscomSync', {})[`chesscomSync:${user.trim().toLowerCase()}`]?.length)

/** Importa lo nuevo y devuelve cuántas partidas son de verdad nuevas. Sin conexión o con errores, no hace nada. */
export async function autoImport(settings: Settings, onGames: (games: GameSummary[]) => void, now = Date.now()): Promise<number> {
  if (running || !navigator.onLine) return 0
  if (now - load<number>(LAST_KEY, 0) < MIN_INTERVAL) return 0
  const cc = settings.chesscomUser.trim()
  const li = settings.lichessUser.trim()
  const doCc = cc && chesscomImported(cc)
  const doLi = li && lichessImported(li)
  if (!doCc && !doLi) return 0
  running = true
  save(LAST_KEY, now)
  const before = new Set(getGames().map((g) => g.id))
  const add = (games: GameSummary[]) => {
    if (!games.length) return
    mergeGames(games)
    onGames(games)
  }
  try {
    // Cada fuente por separado: si una falla (sin conexión, servicio caído), la otra sigue.
    if (doCc) await importChesscomHistory(cc, add).catch(() => undefined)
    if (doLi) add(await importLichessNew(li).catch(() => []))
  } finally {
    running = false
  }
  return getGames().filter((g) => !before.has(g.id)).length
}
