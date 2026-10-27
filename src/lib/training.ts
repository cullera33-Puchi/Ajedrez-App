import type { GameAnalysis, MoveAnalysis } from './analysis'
import { winPercent } from './analysis'
import type { Lesson, LessonProgress } from './lessons'
import type { MyPuzzle } from './myPuzzles'
import type { OpeningGroup, OpeningSrs } from './openings'
import { isOnlineGame } from './progress'
import { dayKey } from './puzzleLog'
import type { AnalysisSummary } from './recommend'
import { load, save } from './storage'
import type { GameSummary } from './types'

/**
 * Tu entrenamiento de hoy: una sesión corta que junta el repaso guiado de la última partida, tus
 * errores pendientes, problemas del tema que más fallas, el repaso de una apertura y una lección.
 * El plan se decide una vez al día y se guarda en el dispositivo; la racha de días cumplidos y las
 * partidas ya repasadas viajan en las copias (reglas en MERGERS de backup.ts).
 */

export const MISTAKES_PER_DAY = 3
export const PUZZLES_PER_DAY = 5
/** Momentos que se preguntan en el repaso guiado. */
export const REVIEW_MOMENTS = 3
/** Solo se propone repasar partidas de los últimos días. */
const REVIEW_MAX_AGE = 30 * 24 * 60 * 60 * 1000
/** Pérdida máxima (puntos de probabilidad de ganar) para dar por buena otra jugada distinta de la mejor. */
const GOOD_DROP = 5

export type StepId = 'review' | 'mistakes' | 'puzzles' | 'opening' | 'lesson'

export interface TrainingPlan {
  day: string
  review?: { gameId: string; opponent: string }
  /** Ids de tus errores pendientes elegidos para hoy. */
  mistakes: string[]
  /** Tema de los problemas (o 'mix'). */
  theme: string
  /** Apertura que toca repasar; `mark` es el número de repasos que llevaba al hacer el plan. */
  opening?: { id: string; family: string; mark: number }
  lesson?: { id: string; title: string }
  done: { review: boolean; mistakes: number; puzzles: number; opening: boolean; lesson: boolean }
}

export interface Step {
  id: StepId
  done: number
  total: number
}

const PLAN_KEY = 'trainingPlan'
const DAYS_KEY = 'trainingDays'
const REVIEWED_KEY = 'reviewedGames'

export const today = (now = Date.now()) => dayKey(now)

// ---------------------------------------------------------------------------
// Repaso guiado

const userSide = (g: GameSummary) => (g.userColor === 'white' ? 'w' : g.userColor === 'black' ? 'b' : undefined)

/** Errores del usuario en una partida, según el resumen del análisis. */
const userErrors = (g: GameSummary, s: AnalysisSummary) => {
  const c = g.userColor ? s.counts[g.userColor] : undefined
  return c ? c.error + c.grave : 0
}

/** La partida real más reciente, ya analizada, con errores tuyos y sin repasar. */
export function chooseReviewGame(games: GameSummary[], summary: (id: string) => AnalysisSummary | undefined, reviewed: string[], now = Date.now()): GameSummary | undefined {
  const done = new Set(reviewed)
  return [...games]
    .filter((g) => isOnlineGame(g) && !done.has(g.id) && now - g.date <= REVIEW_MAX_AGE)
    .sort((a, b) => b.date - a.date)
    .find((g) => {
      const s = summary(g.id)
      return s !== undefined && userErrors(g, s) > 0
    })
}

/**
 * Momentos que se preguntan: tus errores más caros (hasta 3), en el orden de la partida.
 * Si no hay errores, las imprecisiones.
 */
export function reviewMoments(game: GameSummary, analysis: GameAnalysis, max = REVIEW_MOMENTS): MoveAnalysis[] {
  const side = userSide(game)
  const mine = analysis.moves.filter((m) => !side || m.color === side)
  const errors = mine.filter((m) => m.classification === 'error' || m.classification === 'grave')
  const pool = errors.length ? errors : mine.filter((m) => m.classification === 'imprecision')
  return [...pool]
    .sort((a, b) => b.drop - a.drop)
    .slice(0, max)
    .sort((a, b) => a.ply - b.ply)
}

export type Verdict = 'best' | 'good' | 'played' | 'bad'

/**
 * Valora tu respuesta en un momento del repaso. `winAfter` es tu probabilidad de ganar tras tu
 * jugada (de 0 a 100); `winBest`, la que tenías jugando lo mejor.
 */
export function judgeAnswer(answer: string, best: string | undefined, played: string, winBest: number, winAfter: number | undefined): Verdict {
  if (best && answer === best) return 'best'
  if (answer === played) return 'played'
  if (winAfter !== undefined && winBest - winAfter < GOOD_DROP) return 'good'
  return 'bad'
}

/** Tu probabilidad de ganar tras tu jugada, a partir de la evaluación del motor (que es para el rival). */
export const winAfterReply = (r: { cp?: number; mate?: number }) => 100 - winPercent({ cp: r.cp, mate: r.mate, pv: [] })

export const loadReviewed = () => load<string[]>(REVIEWED_KEY, [])
export function markReviewed(gameId: string) {
  const all = loadReviewed()
  if (!all.includes(gameId)) save(REVIEWED_KEY, [...all, gameId].slice(-500))
}

// ---------------------------------------------------------------------------
// Plan del día

export interface PlanInput {
  day: string
  reviewGame?: GameSummary
  dueMistakes: MyPuzzle[]
  /** Temas recomendados por tus errores, del más al menos fallado. */
  themes: string[]
  /** ¿Hay problemas suficientes de ese tema sin conexión? */
  themeAvailable: (theme: string) => boolean
  /** Tus aperturas, de la más a la menos jugada. */
  openings: OpeningGroup[]
  openingSrs: Record<string, OpeningSrs>
  lessons: Lesson[]
  lessonProgress: Record<string, LessonProgress>
  now?: number
}

const opponentOf = (g: GameSummary) => (g.userColor === 'white' ? g.black.name : g.white.name)
const srsMark = (s?: OpeningSrs) => (s ? s.reps + s.lapses : 0)

export function buildPlan(i: PlanInput): TrainingPlan {
  const now = i.now ?? Date.now()
  // Los errores de la partida que se va a repasar ya salen en el repaso.
  const mistakes = i.dueMistakes.filter((p) => p.gameId !== i.reviewGame?.id).slice(0, MISTAKES_PER_DAY).map((p) => p.id)
  const theme = i.themes.find(i.themeAvailable) ?? 'mix'
  const opening = i.openings.find((o) => !i.openingSrs[o.id] || i.openingSrs[o.id].due <= now)
  const lesson = i.lessons.find((l) => !i.lessonProgress[l.id]?.done)
  return {
    day: i.day,
    ...(i.reviewGame ? { review: { gameId: i.reviewGame.id, opponent: opponentOf(i.reviewGame) } } : {}),
    mistakes,
    theme,
    ...(opening ? { opening: { id: opening.id, family: opening.family, mark: srsMark(i.openingSrs[opening.id]) } } : {}),
    ...(lesson ? { lesson: { id: lesson.id, title: lesson.title } } : {}),
    done: { review: false, mistakes: 0, puzzles: 0, opening: false, lesson: false },
  }
}

/** Actualiza lo que se hace fuera de la sesión: la práctica de la apertura y la lección. */
export function refreshPlan(plan: TrainingPlan, srs: Record<string, OpeningSrs>, lessons: Record<string, LessonProgress>, reviewed: string[]): TrainingPlan {
  const done = { ...plan.done }
  if (plan.opening && srsMark(srs[plan.opening.id]) > plan.opening.mark) done.opening = true
  if (plan.lesson && lessons[plan.lesson.id]?.done) done.lesson = true
  if (plan.review && reviewed.includes(plan.review.gameId)) done.review = true
  return { ...plan, done }
}

export function planSteps(plan: TrainingPlan): Step[] {
  const steps: Step[] = []
  if (plan.review) steps.push({ id: 'review', done: plan.done.review ? 1 : 0, total: 1 })
  if (plan.mistakes.length) steps.push({ id: 'mistakes', done: Math.min(plan.done.mistakes, plan.mistakes.length), total: plan.mistakes.length })
  steps.push({ id: 'puzzles', done: Math.min(plan.done.puzzles, PUZZLES_PER_DAY), total: PUZZLES_PER_DAY })
  if (plan.opening) steps.push({ id: 'opening', done: plan.done.opening ? 1 : 0, total: 1 })
  if (plan.lesson) steps.push({ id: 'lesson', done: plan.done.lesson ? 1 : 0, total: 1 })
  return steps
}

export const stepComplete = (s: Step) => s.done >= s.total
export const planComplete = (plan: TrainingPlan) => planSteps(plan).every(stepComplete)

/** Plan guardado de hoy, si lo hay (sin crear uno nuevo). */
export function storedPlan(now = Date.now()): TrainingPlan | null {
  const p = load<TrainingPlan | null>(PLAN_KEY, null)
  return p && p.day === today(now) ? p : null
}

export function savePlan(plan: TrainingPlan) {
  save(PLAN_KEY, plan)
  if (planComplete(plan)) markDay(plan.day)
}

// ---------------------------------------------------------------------------
// Racha

export const loadDays = () => load<string[]>(DAYS_KEY, [])

function markDay(day: string) {
  const all = loadDays()
  if (!all.includes(day)) save(DAYS_KEY, [...all, day].sort().slice(-1000))
}

/** Días seguidos cumplidos hasta hoy (o hasta ayer, si hoy aún no has terminado). */
export function streak(days: string[], now = Date.now()): number {
  const set = new Set(days)
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Unión sin repetir, para fusionar copias de dos dispositivos. */
export const mergeLists = (a: unknown, b: unknown) => [...new Set([...((a ?? []) as string[]), ...((b ?? []) as string[])])].sort()
