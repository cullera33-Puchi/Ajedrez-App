import type { GameAnalysis } from './analysis'
import type { BotRecord } from './bots'
import { type BotFeedback, mergeFeedback } from './botFeedback'
import { db } from './db'
import { mergeGames } from './games'
import type { MyPuzzle } from './myPuzzles'
import { mergeLogs, type PuzzleAttempt } from './puzzleLog'
import type { PuzzleStats } from './puzzles'
import type { AnalysisSummary } from './recommend'
import { dumpAll, load, save } from './storage'
import type { GameSummary } from './types'

/**
 * Copia de seguridad para pasar los datos entre dispositivos (móvil, PC, tablet) en un archivo.
 * Al importar se fusiona con lo que ya hay: no se borra nada.
 */

export interface Backup {
  app: 'ajedrez-app'
  version: 1
  exportedAt: number
  local: Record<string, unknown>
  games: GameSummary[]
  analyses: [string, GameAnalysis][]
  summaries: AnalysisSummary[]
  puzzles: MyPuzzle[]
}

export interface ImportResult {
  games: number
  analyses: number
  puzzles: number
}

/** Datos propios de cada dispositivo que no viajan en la copia (la sesión de sincronización, entre otros). */
const DEVICE_ONLY = new Set(['syncConfig', 'syncSession', 'syncLast', 'botGame'])

export async function exportBackup(includeAnalyses = true): Promise<Backup> {
  const store = await db()
  return {
    app: 'ajedrez-app',
    version: 1,
    exportedAt: Date.now(),
    local: Object.fromEntries(Object.entries(dumpAll()).filter(([k]) => !DEVICE_ONLY.has(k))),
    games: await store.getAll<GameSummary>('games'),
    analyses: includeAnalyses ? await store.entries<GameAnalysis>('analyses') : [],
    summaries: includeAnalyses ? await store.getAll<AnalysisSummary>('summaries') : [],
    puzzles: await store.getAll<MyPuzzle>('puzzles'),
  }
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `ajedrez-copia-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

export function parseBackup(text: string): Backup {
  let b: Backup
  try {
    b = JSON.parse(text) as Backup
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida.')
  }
  if (b?.app !== 'ajedrez-app' || !Array.isArray(b.games)) throw new Error('El archivo no es una copia de seguridad de Ajedrez App.')
  return b
}

const played = (s?: PuzzleStats | null) => (s ? s.solved + s.failed : 0)

/** Fusiona los ajustes y datos pequeños: se queda con lo más completo de cada lado. */
function mergeLocal(incoming: Record<string, unknown>) {
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || DEVICE_ONLY.has(key)) continue
    const current = load<unknown>(key, null)
    if (key === 'puzzleStats') {
      if (played(value as PuzzleStats) > played(current as PuzzleStats | null)) save(key, value)
    } else if (key === 'botFeedback') {
      save(key, mergeFeedback((current ?? []) as BotFeedback[], value as BotFeedback[]))
    } else if (key === 'puzzleLog') {
      save(key, mergeLogs((current ?? []) as PuzzleAttempt[], value as PuzzleAttempt[]))
    } else if (key === 'botRecord') {
      const a = (current ?? {}) as BotRecord
      const b = value as BotRecord
      const merged: BotRecord = { ...a }
      for (const [bot, r] of Object.entries(b)) {
        const c = a[bot]
        merged[bot] = !c || r.w + r.l + r.d > c.w + c.l + c.d ? r : c
      }
      save(key, merged)
    } else if (key === 'settings') {
      const a = (current ?? {}) as Record<string, unknown>
      const b = value as Record<string, unknown>
      const merged = { ...b, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== '' && v !== null && v !== undefined)) }
      save(key, merged)
    } else if (key === 'chesscomSync') {
      const a = (current ?? {}) as Record<string, string[]>
      const b = value as Record<string, string[]>
      const merged = { ...a }
      for (const [user, months] of Object.entries(b)) merged[user] = [...new Set([...(a[user] ?? []), ...months])]
      save(key, merged)
    } else if (current === null) {
      save(key, value)
    }
  }
}

export async function importBackup(b: Backup): Promise<ImportResult> {
  const store = await db()
  mergeLocal(b.local ?? {})
  mergeGames(b.games)

  // Análisis: se añade el que falte o el que sea más profundo.
  const existing = new Map((await store.getAll<AnalysisSummary>('summaries')).map((s) => [s.id, s]))
  const incomingSummaries = new Map((b.summaries ?? []).map((s) => [s.id, s]))
  const analyses: [string, unknown][] = []
  const summaries: [string, unknown][] = []
  for (const [id, a] of b.analyses ?? []) {
    const cur = existing.get(id)
    if (!cur || a.depth > cur.depth) {
      analyses.push([id, a])
      const s = incomingSummaries.get(id)
      if (s) summaries.push([id, { ...s, puzzlesDone: cur?.puzzlesDone ?? s.puzzlesDone }])
    }
  }
  if (analyses.length) await store.putMany('analyses', analyses)
  if (summaries.length) await store.putMany('summaries', summaries)

  // Problemas propios: se queda con el que tenga más repasos.
  const mine = new Map((await store.getAll<MyPuzzle>('puzzles')).map((p) => [p.id, p]))
  const puzzles: [string, unknown][] = []
  for (const p of b.puzzles ?? []) {
    const cur = mine.get(p.id)
    if (!cur || p.srs.reps + p.srs.lapses > cur.srs.reps + cur.srs.lapses) puzzles.push([p.id, p])
  }
  if (puzzles.length) await store.putMany('puzzles', puzzles)

  return { games: b.games.length, analyses: analyses.length, puzzles: puzzles.length }
}
