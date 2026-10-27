import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Arrow, Board } from '../components/Board'
import { PuzzleSolver } from '../components/PuzzleSolver'
import { setBusy } from '../lib/activity'
import { type GameAnalysis, type MoveAnalysis, type ParsedGame, parsePgn, toSpanishSan } from '../lib/analysis'
import { getEngine } from '../lib/engine'
import { getSummary, loadAnalysis } from '../lib/games'
import { LESSONS, loadLessonProgress } from '../lib/lessons'
import { allMyPuzzles, duePuzzles, recordResult, toPuzzle } from '../lib/myPuzzles'
import { useBackHandler } from '../lib/nav'
import { loadOpeningSrs, topOpenings } from '../lib/openings'
import { logAttempt } from '../lib/puzzleLog'
import { INITIAL_PUZZLE_STATS, type Puzzle, type PuzzleStats, themeName, updateRating } from '../lib/puzzles'
import { loadPack, offlinePuzzles, pickNear } from '../lib/puzzlePack'
import { recommendThemes } from '../lib/recommend'
import { load, save } from '../lib/storage'
import {
  buildPlan,
  chooseReviewGame,
  judgeAnswer,
  loadDays,
  loadReviewed,
  markReviewed,
  planComplete,
  planSteps,
  PUZZLES_PER_DAY,
  refreshPlan,
  reviewMoments,
  savePlan,
  type Step,
  type StepId,
  stepComplete,
  storedPlan,
  streak,
  today,
  type TrainingPlan,
  type Verdict,
  winAfterReply,
} from '../lib/training'
import type { PuzzleEvents } from '../lib/usePuzzlePlay'
import { isEink } from '../lib/theme'
import { type GameSummary, opponentOf } from '../lib/types'

interface Props {
  games: GameSummary[]
  /** Repaso guiado de una partida concreta (desde el análisis), sin el resto de la sesión. */
  reviewGameId: string | null
  onOpenGame: (id: string) => void
  onOpenLesson: (id: string) => void
  onOpenOpening: (id: string) => void
  onOpenVision: (kind: 'coords' | 'hanging') => void
  onStartSession: () => void
}

/** Pasos que se hacen dentro de esta pantalla (la apertura y la lección se abren en Aprender). */
const IN_APP: StepId[] = ['review', 'mistakes', 'puzzles']

/** Problemas sin conexión suficientes de un tema para dedicarle el paso del día. */
const themeAvailable = (t: string) => offlinePuzzles(t).length >= 10

async function todayPlan(games: GameSummary[]): Promise<TrainingPlan> {
  await loadPack()
  const reviewed = loadReviewed()
  const plan =
    storedPlan() ??
    buildPlan({
      day: today(),
      reviewGame: chooseReviewGame(games, getSummary, reviewed),
      dueMistakes: duePuzzles(),
      themes: recommendThemes(games).themes.map((t) => t.theme),
      themeAvailable,
      openings: (() => {
        const top = topOpenings(games)
        return [...top.white, ...top.black].sort((a, b) => b.games.length - a.games.length)
      })(),
      openingSrs: loadOpeningSrs(),
      lessons: LESSONS,
      lessonProgress: loadLessonProgress(),
    })
  const fresh = refreshPlan(plan, loadOpeningSrs(), loadLessonProgress(), reviewed)
  // Si la partida del repaso ya no está (por ejemplo, tras borrar datos), el paso no se puede hacer.
  if (fresh.review && !games.some((g) => g.id === fresh.review!.gameId)) fresh.done.review = true
  savePlan(fresh)
  return fresh
}

export function TrainingView({ games, reviewGameId, onOpenGame, onOpenLesson, onOpenOpening, onOpenVision, onStartSession }: Props) {
  const [plan, setPlanState] = useState<TrainingPlan | null>(null)
  const [active, setActive] = useState<StepId | null>(null)
  const reviewOnly = reviewGameId ? (games.find((g) => g.id === reviewGameId) ?? null) : null

  useEffect(() => {
    let cancelled = false
    void todayPlan(games).then((p) => !cancelled && setPlanState(p))
    return () => {
      cancelled = true
    }
    // El plan se calcula al entrar en la pantalla.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // El gesto atrás dentro de un paso vuelve al resumen de la sesión.
  useBackHandler(active !== null && !reviewOnly, () => setActive(null))

  const update = (fn: (p: TrainingPlan) => TrainingPlan) =>
    setPlanState((cur) => {
      if (!cur) return cur
      const next = fn(cur)
      savePlan(next)
      return next
    })

  /** Al terminar un paso: el siguiente que se hace aquí, o el resumen. */
  const continueAfter = (p: TrainingPlan) => {
    const next = planSteps(p).find((s) => !stepComplete(s))
    setActive(next && IN_APP.includes(next.id) ? next.id : null)
  }

  if (reviewGameId) {
    if (!reviewOnly) return <p className="muted page">No se encuentra la partida.</p>
    return (
      <GuidedReview
        key={reviewOnly.id}
        game={reviewOnly}
        onFinish={() => {
          markReviewed(reviewOnly.id)
          if (plan?.review?.gameId === reviewOnly.id) update((p) => ({ ...p, done: { ...p.done, review: true } }))
        }}
        actions={
          <div className="toolbar">
            <button className="btn primary" onClick={() => onOpenGame(reviewOnly.id)}>
              Ver el análisis completo
            </button>
            <button className="btn" onClick={onStartSession}>
              Entrenamiento de hoy
            </button>
          </div>
        }
      />
    )
  }

  if (!plan) return <p className="muted page">Preparando tu entrenamiento…</p>

  const back = (
    <button className="link small" onClick={() => setActive(null)}>
      Volver al resumen
    </button>
  )

  if (active === 'review' && plan.review) {
    const game = games.find((g) => g.id === plan.review!.gameId)
    if (game)
      return (
        <GuidedReview
          key={game.id}
          game={game}
          header={back}
          onFinish={() => {
            markReviewed(game.id)
            update((p) => ({ ...p, done: { ...p.done, review: true } }))
          }}
          onUnavailable={(reason) => {
            // Sin errores que repasar, la partida queda repasada; sin análisis, solo se salta por hoy.
            if (reason === 'clean') markReviewed(game.id)
            update((p) => ({ ...p, done: { ...p.done, review: true } }))
          }}
          actions={
            <div className="toolbar">
              <button className="btn primary" onClick={() => continueAfter({ ...plan, done: { ...plan.done, review: true } })}>
                Continuar
              </button>
              <button className="btn" onClick={() => onOpenGame(game.id)}>
                Ver el análisis
              </button>
            </div>
          }
        />
      )
  }
  if (active === 'mistakes') return <MistakesStep plan={plan} header={back} onProgress={update} onContinue={continueAfter} />
  if (active === 'puzzles') return <ThemeStep plan={plan} header={back} onProgress={update} onContinue={continueAfter} />

  return <Overview plan={plan} onStart={setActive} onOpenLesson={onOpenLesson} onOpenOpening={onOpenOpening} onOpenVision={onOpenVision} />
}

// ---------------------------------------------------------------------------
// Resumen de la sesión

function stepText(plan: TrainingPlan, s: Step): { title: string; detail: string } {
  switch (s.id) {
    case 'review':
      return { title: 'Repaso de tu última partida', detail: `Contra ${plan.review?.opponent}. Antes de ver el análisis, piensa qué jugarías en tus momentos clave.` }
    case 'mistakes':
      return { title: 'Tus errores pendientes', detail: 'Posiciones de tus partidas donde se te escapó la buena jugada.' }
    case 'puzzles':
      return {
        title: plan.theme === 'mix' ? 'Problemas de tu nivel' : `Problemas: ${themeName(plan.theme)}`,
        detail: plan.theme === 'mix' ? 'Problemas variados, cerca de tu nivel.' : 'Es el tema que más se repite en tus errores.',
      }
    case 'opening':
      return { title: `Apertura: ${plan.opening?.family}`, detail: 'Practica tu línea habitual. Se abre en Aprender; al terminar, vuelve aquí.' }
    case 'lesson':
      return { title: `Lección: ${plan.lesson?.title}`, detail: 'Una lección práctica contra Stockfish. Se abre en Aprender; al terminar, vuelve aquí.' }
  }
}

interface OverviewProps {
  plan: TrainingPlan
  onStart: (s: StepId) => void
  onOpenLesson: (id: string) => void
  onOpenOpening: (id: string) => void
  onOpenVision: (kind: 'coords' | 'hanging') => void
}

function Overview({ plan, onStart, onOpenLesson, onOpenOpening, onOpenVision }: OverviewProps) {
  const steps = planSteps(plan)
  const doneSteps = steps.filter(stepComplete).length
  const days = streak(loadDays())
  const complete = planComplete(plan)
  const nextId = steps.find((s) => !stepComplete(s))?.id
  const rating = load<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS).rating

  const open = (s: StepId) => {
    if (s === 'opening' && plan.opening) onOpenOpening(plan.opening.id)
    else if (s === 'lesson' && plan.lesson) onOpenLesson(plan.lesson.id)
    else onStart(s)
  }

  return (
    <div className="page training">
      <header className="page-head">
        <h1>Entrenamiento de hoy</h1>
        <p className="muted">Unos 10 a 15 minutos. Lo que más te hará mejorar es entrenar un poco cada día.</p>
      </header>
      <section className="card">
        <div className="kpis">
          <div className="kpi good">
            <span className="kpi-value">{days}</span>
            <span className="kpi-label">{days === 1 ? 'Día seguido' : 'Días seguidos'}</span>
          </div>
          <div className="kpi">
            <span className="kpi-value">
              {doneSteps}/{steps.length}
            </span>
            <span className="kpi-label">Pasos de hoy</span>
          </div>
          <div className="kpi">
            <span className="kpi-value">{rating}</span>
            <span className="kpi-label">Nivel de problemas</span>
          </div>
        </div>
        {complete && <p className="msg ok">Entrenamiento de hoy completado. Vuelve mañana para mantener la racha.</p>}
        <ol className="training-steps">
          {steps.map((s) => {
            const t = stepText(plan, s)
            const ok = stepComplete(s)
            return (
              <li key={s.id} className={ok ? 'done' : s.id === nextId ? 'next' : ''}>
                <span className="training-mark" aria-hidden="true">
                  {ok ? '✓' : steps.indexOf(s) + 1}
                </span>
                <div>
                  <strong>{t.title}</strong>
                  <p className="muted small">{t.detail}</p>
                  {s.total > 1 && (
                    <p className="small">
                      {Math.min(s.done, s.total)} de {s.total}
                    </p>
                  )}
                </div>
                {!ok && (
                  <button className={`btn small ${s.id === nextId ? 'primary' : ''}`} onClick={() => open(s.id)}>
                    {s.done > 0 ? 'Continuar' : 'Empezar'}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </section>
      <section className="card">
        <h3>Extra: visión del tablero</h3>
        <p className="muted small">Un minuto para calentar o para rematar la sesión. No cuenta para la racha.</p>
        <div className="toolbar">
          <button className="btn small" onClick={() => onOpenVision('coords')}>
            Coordenadas
          </button>
          <button className="btn small" onClick={() => onOpenVision('hanging')}>
            Piezas colgadas
          </button>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Problemas: tus errores y los del tema del día

interface StepProps {
  plan: TrainingPlan
  header: React.ReactNode
  onProgress: (fn: (p: TrainingPlan) => TrainingPlan) => void
  onContinue: (p: TrainingPlan) => void
}

/** Resultado de uno de tus errores: repaso espaciado e histórico (no cambia el nivel). */
function recordMine(id: string, clean: boolean) {
  void recordResult(id, clean)
  logAttempt({ t: Date.now(), win: clean, source: 'mine', difficulty: null, prev: null, rating: null })
}

/** Problema del tema del día cerca de tu nivel, sin repetir los vistos. */
function pickPuzzle(theme: string, seen: Set<string>): Puzzle | null {
  const stats = load<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS)
  const pool = offlinePuzzles(theme).length ? offlinePuzzles(theme) : offlinePuzzles('mix')
  const p = pickNear(pool, stats.rating, new Set([...stats.history.map((h) => h.id), ...seen]))
  if (p) seen.add(p.id)
  return p
}

/** Cambia tu nivel de problemas como en Problemas y lo apunta en el histórico. */
function ratePuzzle(puzzle: Puzzle, win: boolean) {
  const stats = load<PuzzleStats>('puzzleStats', INITIAL_PUZZLE_STATS)
  const updated = updateRating(stats, puzzle, win)
  save('puzzleStats', updated)
  logAttempt({ t: Date.now(), win, source: puzzle.source, difficulty: puzzle.rating || null, prev: stats.rating, rating: updated.rating })
}

function MistakesStep({ plan, header, onProgress, onContinue }: StepProps) {
  const total = plan.mistakes.length
  const idx = Math.min(plan.done.mistakes, total)
  const [shown, setShown] = useState(idx)
  const own = allMyPuzzles().find((p) => p.id === plan.mistakes[shown])
  const recorded = useRef(false)

  // Si un error ya no existe (por ejemplo, tras borrar datos), cuenta como hecho.
  useEffect(() => {
    if (shown >= total || own) return
    onProgress((p) => ({ ...p, done: { ...p.done, mistakes: Math.max(p.done.mistakes, shown + 1) } }))
    setShown(shown + 1)
  }, [shown, own]) // eslint-disable-line react-hooks/exhaustive-deps

  const record = (clean: boolean) => {
    if (!own || recorded.current) return
    recorded.current = true
    recordMine(own.id, clean)
  }
  const advance = () => onProgress((p) => ({ ...p, done: { ...p.done, mistakes: Math.max(p.done.mistakes, shown + 1) } }))

  if (shown >= total) return <StepDone header={header} text="Has repasado tus errores pendientes de hoy." plan={plan} onContinue={onContinue} />
  if (!own) return null
  const side = own.fen.split(' ')[1] === 'w' ? 'blancas' : 'negras'
  return (
    <PuzzleStep
      key={own.id}
      puzzle={toPuzzle(own)}
      header={header}
      title="Tus errores pendientes"
      count={`Posición ${shown + 1} de ${total}`}
      intro={`Posición de tu partida contra ${own.opponent}. Juegan las ${side}: encuentra la jugada que se te escapó.`}
      solvedText={(clean) => `${clean ? '¡Bien visto!' : 'Resuelto.'} En la partida jugaste ${own.playedSan}; lo mejor era ${own.bestSan}.`}
      events={{
        onFirstMistake: () => record(false),
        onSolved: (clean) => {
          record(clean)
          advance()
        },
        onGaveUp: () => {
          record(false)
          advance()
        },
      }}
      onNext={() => {
        recorded.current = false
        setShown(shown + 1)
      }}
      nextLabel={shown + 1 < total ? 'Siguiente posición' : 'Terminar'}
    />
  )
}

function ThemeStep({ plan, header, onProgress, onContinue }: StepProps) {
  const done = Math.min(plan.done.puzzles, PUZZLES_PER_DAY)
  const [shown, setShown] = useState(done)
  const [seen] = useState(() => new Set<string>())
  const rated = useRef(false)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(() => pickPuzzle(plan.theme, seen))

  const rate = (win: boolean) => {
    if (!puzzle || rated.current) return
    rated.current = true
    ratePuzzle(puzzle, win)
  }
  const advance = () => onProgress((p) => ({ ...p, done: { ...p.done, puzzles: Math.max(p.done.puzzles, shown + 1) } }))

  if (shown >= PUZZLES_PER_DAY || !puzzle) return <StepDone header={header} text="Has terminado los problemas de hoy." plan={plan} onContinue={onContinue} />
  const side = puzzle.fen.split(' ')[1] === 'w' ? 'blancas' : 'negras'
  return (
    <PuzzleStep
      key={puzzle.id}
      puzzle={puzzle}
      header={header}
      title={plan.theme === 'mix' ? 'Problemas de tu nivel' : `Problemas: ${themeName(plan.theme)}`}
      count={`Problema ${shown + 1} de ${PUZZLES_PER_DAY}`}
      intro={`Juegan las ${side}. Encuentra la mejor jugada.`}
      solvedText={(clean) => (clean ? '¡Correcto! Problema resuelto.' : 'Resuelto, aunque con alguna ayuda. No cuenta para tu nivel.')}
      events={{
        onFirstMistake: () => rate(false),
        onSolved: (clean) => {
          // Con pista no cuenta para el nivel (como en Problemas).
          if (clean) rate(true)
          else rated.current = true
          advance()
        },
        onGaveUp: () => {
          rate(false)
          advance()
        },
      }}
      onNext={() => {
        rated.current = false
        setShown(shown + 1)
        setPuzzle(pickPuzzle(plan.theme, seen))
      }}
      nextLabel={shown + 1 < PUZZLES_PER_DAY ? 'Siguiente problema' : 'Terminar'}
    />
  )
}

interface PuzzleStepProps {
  puzzle: Puzzle
  header: React.ReactNode
  title: string
  count: string
  intro: string
  solvedText: (clean: boolean) => string
  events: PuzzleEvents
  onNext: () => void
  nextLabel: string
}

function PuzzleStep({ puzzle, header, title, count, intro, solvedText, events, onNext, nextLabel }: PuzzleStepProps) {
  return (
    <PuzzleSolver
      puzzle={puzzle}
      className="training-run"
      intro={intro}
      solvedText={solvedText}
      events={events}
      header={
        <>
          {header}
          <h2>{title}</h2>
          <p className="muted small">{count}</p>
        </>
      }
      actions={(phase) =>
        phase === 'done' && (
          <button className="btn primary" onClick={onNext}>
            {nextLabel}
          </button>
        )
      }
    />
  )
}

function StepDone({ header, text, plan, onContinue }: { header: React.ReactNode; text: string; plan: TrainingPlan; onContinue: (p: TrainingPlan) => void }) {
  return (
    <div className="page training">
      <section className="card">
        {header}
        <p className="msg ok">{text}</p>
        <button className="btn primary" onClick={() => onContinue(plan)}>
          Continuar
        </button>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Repaso guiado de una partida

interface Answer {
  verdict: Verdict
  /** Tu jugada (UCI), si respondiste. */
  uci?: string
  san?: string
}

const moveNo = (ply: number) => Math.ceil(ply / 2)

function situation(win: number) {
  if (win >= 65) return 'Vas mejor'
  if (win <= 35) return 'Vas peor'
  return 'La posición está igualada'
}

function verdictText(m: MoveAnalysis, a: Answer): { kind: 'ok' | 'error' | 'info'; text: string } {
  const played = toSpanishSan(m.san)
  const best = m.bestSan ? toSpanishSan(m.bestSan) : undefined
  switch (a.verdict) {
    case 'best':
      return { kind: 'ok', text: `¡Muy bien! ${a.san} es la mejor jugada. En la partida jugaste ${played}.` }
    case 'good':
      return { kind: 'ok', text: `Bien: ${a.san} también es buena. La mejor era ${best}. En la partida jugaste ${played}.` }
    case 'played':
      return { kind: 'error', text: `Es lo mismo que jugaste en la partida, y no era buena idea. La mejor era ${best}.` }
    case 'bad':
      return { kind: 'error', text: a.san ? `${a.san} no es buena: pierdes ventaja. La mejor era ${best}. En la partida jugaste ${played}.` : `La mejor era ${best}. En la partida jugaste ${played}.` }
  }
}

/** Comentario del análisis sin la primera frase («Error. Era mejor…»), que ya dice el veredicto. */
const explanation = (m: MoveAnalysis) => m.comment.replace(/^(Error grave|Error|Imprecisión)\. Era mejor [^.]*\.\s*/, '').trim()

interface ReviewProps {
  game: GameSummary
  header?: React.ReactNode
  actions: React.ReactNode
  onFinish: () => void
  /** La partida no se puede repasar: sin análisis guardado o sin errores. */
  onUnavailable?: (reason: 'missing' | 'clean') => void
}

function GuidedReview({ game, header, actions, onFinish, onUnavailable }: ReviewProps) {
  const [data, setData] = useState<{ parsed: ParsedGame; analysis: GameAnalysis } | null | 'missing'>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [checking, setChecking] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const finished = useRef(false)
  const idxRef = useRef(idx)
  const color = game.userColor ?? 'white'
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

  useEffect(() => {
    let cancelled = false
    loadAnalysis(game.id)
      .then((analysis) => {
        if (cancelled) return
        setData(analysis ? { parsed: parsePgn(game.pgn), analysis } : 'missing')
      })
      .catch(() => !cancelled && setData('missing'))
    return () => {
      cancelled = true
    }
  }, [game])

  // Mientras se repasa, el análisis en segundo plano deja libre el motor.
  useEffect(() => {
    setBusy('review', true)
    return () => setBusy('review', false)
  }, [])

  const moments = useMemo(() => (data && data !== 'missing' ? reviewMoments(game, data.analysis) : []), [data, game])
  const allAnswered = moments.length > 0 && answers.length >= moments.length
  const done = moments.length > 0 && idx >= moments.length

  useEffect(() => {
    if (data === 'missing') onUnavailable?.('missing')
    else if (data && moments.length === 0) onUnavailable?.('clean')
  }, [data, moments.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // La partida cuenta como repasada al responder el último momento.
  useEffect(() => {
    if (allAnswered && !finished.current) {
      finished.current = true
      onFinish()
    }
  }, [allAnswered]) // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null) return <p className="muted page">Cargando la partida…</p>
  const title = <h2>Repaso de tu partida contra {opponentOf(game)}</h2>
  if (data === 'missing' || moments.length === 0)
    return (
      <div className="page training">
        <section className="card">
          {header}
          {title}
          <p className="msg info">{data === 'missing' ? 'Esta partida aún no está analizada. Ábrela en Análisis y espera a que termine.' : 'En esta partida no hay errores que repasar. ¡Bien jugada!'}</p>
          {actions}
        </section>
      </div>
    )

  const { parsed, analysis } = data
  const hits = answers.filter((a) => a.verdict === 'best' || a.verdict === 'good').length

  if (done) {
    return (
      <div className="page training">
        <section className="card">
          {header}
          {title}
          <p className="msg ok">
            Has acertado {hits} de {moments.length} {moments.length === 1 ? 'momento' : 'momentos'}.{' '}
            {hits === moments.length ? 'Muy bien: ahora sí habrías visto la buena jugada.' : 'En el análisis completo puedes ver cada error con calma.'}
          </p>
          <ul className="review-summary">
            {moments.map((m, i) => (
              <li key={m.ply}>
                <span className={answers[i].verdict === 'best' || answers[i].verdict === 'good' ? 'good' : 'bad'}>{answers[i].verdict === 'best' || answers[i].verdict === 'good' ? '✓' : '✗'}</span> Jugada {moveNo(m.ply)}: jugaste{' '}
                {toSpanishSan(m.san)}, la mejor era {m.bestSan ? toSpanishSan(m.bestSan) : '?'}.
              </li>
            ))}
          </ul>
          {actions}
        </section>
      </div>
    )
  }

  const m = moments[Math.min(idx, moments.length - 1)]
  const fen = parsed.fens[m.ply - 1]
  const answer = answers[idx] as Answer | undefined
  const best = analysis.positions[m.ply - 1]?.best
  const prev = m.ply >= 2 ? parsed.moves[m.ply - 2] : undefined
  const arrows: Arrow[] = answer
    ? [
        { orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: 'red' },
        ...(best ? [{ orig: best.slice(0, 2), dest: best.slice(2, 4), brush: 'green' as const }] : []),
        ...(answer.uci && answer.uci !== best && answer.uci !== m.uci ? [{ orig: answer.uci.slice(0, 2), dest: answer.uci.slice(2, 4), brush: 'blue' as const }] : []),
      ]
    : []

  const respond = async (from: string, to: string) => {
    if (answer || checking) return
    const chess = new Chess(fen)
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? (best?.slice(0, 4) === from + to && best[4]) || 'q' : undefined
    let mv
    try {
      mv = chess.move({ from, to, promotion })
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    const uci = mv.lan
    const san = toSpanishSan(mv.san)
    let winAfter: number | undefined
    if (uci !== best && uci !== m.uci) {
      if (chess.isCheckmate()) winAfter = 100
      else if (chess.isDraw()) winAfter = 50
      else {
        setChecking(true)
        const at = idx
        const r = await getEngine('main').evaluate(chess.fen(), 12).catch(() => null)
        setChecking(false)
        // Si mientras tanto se ha pasado a otro momento, el resultado ya no vale.
        if (at !== idxRef.current) return
        winAfter = r ? winAfterReply(r) : undefined
      }
    }
    const verdict = judgeAnswer(uci, best, m.uci, m.winBefore, winAfter)
    setAnswers((a) => [...a.slice(0, idx), { verdict, uci, san }])
  }

  const giveUp = () => setAnswers((a) => [...a.slice(0, idx), { verdict: 'bad' }])

  return (
    <div className="page puzzles training-run">
      <div className="puzzle-board">
        <Board
          key={m.ply}
          fen={fen}
          orientation={color}
          movableColor={answer || checking ? undefined : color}
          lastMove={prev ? [prev.from, prev.to] : undefined}
          arrows={arrows}
          onMove={(f, t) => void respond(f, t)}
          resetKey={resetKey}
        />
      </div>
      <div className="puzzle-side">
        <section className="card">
          {header}
          {title}
          <p className="muted small">
            Momento {idx + 1} de {moments.length}. Jugada {moveNo(m.ply)}, juegas con {color === 'white' ? 'blancas' : 'negras'}.
          </p>
          {!answer && (
            <p className="msg info">
              {checking ? (
                <>
                  <span className="spinner" /> Stockfish valora tu jugada…
                </>
              ) : (
                `${situation(m.winBefore)}. ¿Qué jugarías aquí? Mueve en el tablero.`
              )}
            </p>
          )}
          {answer && (
            <>
              <p className={`msg ${verdictText(m, answer).kind}`}>{verdictText(m, answer).text}</p>
              <p className="small muted">
                {isEink()
                  ? 'En el tablero, las flechas marcan lo que jugaste, la mejor jugada y, si es distinta, tu respuesta.'
                  : `En el tablero: en rojo lo que jugaste y en verde la mejor jugada${answer.uci && answer.uci !== best && answer.uci !== m.uci ? '; en azul, tu respuesta' : ''}.`}
              </p>
              {explanation(m) && <p className="small">{explanation(m)}</p>}
            </>
          )}
          <div className="toolbar">
            {!answer && (
              <button className="btn" onClick={giveUp} disabled={checking}>
                Ver solución
              </button>
            )}
            {answer && (
              <button className="btn primary" onClick={() => setIdx(idx + 1)}>
                {idx + 1 < moments.length ? 'Siguiente momento' : 'Ver resumen'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
