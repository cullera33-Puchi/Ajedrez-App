import { useEffect, useState } from 'react'
import { isBusy } from './activity'
import { analyzeGame, type GameAnalysis, type ParsedGame, parsePgn } from './analysis'
import { getGames, getSummary, saveAnalysis } from './games'
import { buildSummary } from './recommend'
import { load, save } from './storage'
import type { GameSummary } from './types'

/**
 * Análisis en segundo plano: mientras la app está abierta, analiza una a una las partidas del usuario
 * que aún no tienen análisis, de la más reciente a la más antigua. Se pausa si la app no está en
 * pantalla o si el motor se está usando para otra cosa (analizar una partida a mano, jugar).
 */

export const BACKGROUND_DEPTH = 10

export interface BackgroundState {
  enabled: boolean
  /** Partida que se está analizando ahora. */
  current?: GameSummary
  progress?: { done: number; total: number }
  pending: number
  analyzed: number
  paused?: 'ocupado' | 'oculta'
}

type AfterAnalysis = (game: GameSummary, parsed: ParsedGame, analysis: GameAnalysis) => Promise<void>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const listeners = new Set<(s: BackgroundState) => void>()
const failed = new Set<string>()
const afterHooks: AfterAnalysis[] = []
let state: BackgroundState = { enabled: load('bgAnalysis', true), pending: 0, analyzed: 0 }
let started = false

function emit(patch: Partial<BackgroundState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l(state)
}

const userGames = () => getGames().filter((g) => g.userColor)

function counts() {
  const mine = userGames()
  const analyzed = mine.filter((g) => getSummary(g.id)).length
  return { analyzed, pending: mine.length - analyzed - mine.filter((g) => failed.has(g.id) && !getSummary(g.id)).length }
}

/** Tareas que se ejecutan tras analizar cada partida (por ejemplo, generar problemas con los errores). */
export function onAnalyzed(hook: AfterAnalysis) {
  afterHooks.push(hook)
}

export function setBackgroundEnabled(enabled: boolean) {
  save('bgAnalysis', enabled)
  emit({ enabled })
}

const blocked = () => isBusy() || (typeof document !== 'undefined' && document.hidden)

async function analyzeOne(game: GameSummary) {
  let parsed: ParsedGame
  try {
    parsed = parsePgn(game.pgn)
  } catch {
    failed.add(game.id)
    return
  }
  const ctrl = new AbortController()
  emit({ current: game, progress: { done: 0, total: parsed.fens.length } })
  try {
    const analysis = await analyzeGame(
      parsed,
      BACKGROUND_DEPTH,
      (done, total) => {
        emit({ progress: { done, total } })
        // Si el usuario empieza a usar el motor, se deja para más tarde.
        if (blocked()) ctrl.abort()
      },
      ctrl.signal,
    )
    await saveAnalysis(game.id, analysis, buildSummary(game, parsed, analysis))
    for (const hook of afterHooks) await hook(game, parsed, analysis).catch(() => undefined)
  } catch (e) {
    if ((e as Error).name !== 'AbortError') failed.add(game.id)
  } finally {
    emit({ current: undefined, progress: undefined, ...counts() })
  }
}

/** Arranca el bucle (una sola vez por sesión). */
export function startBackgroundAnalysis() {
  if (started) return
  started = true
  void (async () => {
    for (;;) {
      emit(counts())
      if (!state.enabled) {
        await sleep(2000)
        continue
      }
      if (blocked()) {
        emit({ paused: isBusy() ? 'ocupado' : 'oculta' })
        await sleep(1500)
        continue
      }
      if (state.paused) emit({ paused: undefined })
      const next = userGames().find((g) => !getSummary(g.id) && !failed.has(g.id))
      if (!next) {
        await sleep(4000)
        continue
      }
      await analyzeOne(next)
      await sleep(300)
    }
  })()
}

export function useBackgroundState(): BackgroundState {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}
