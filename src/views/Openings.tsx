import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Arrow, Board } from '../components/Board'
import { setBusy } from '../lib/activity'
import { toSpanishSan } from '../lib/analysis'
import { getEngine } from '../lib/engine'
import { allSummaries } from '../lib/games'
import { type ExplorerMove, fetchExplorer } from '../lib/lichess'
import { useBackHandler } from '../lib/nav'
import {
  buildTree,
  childKey,
  isDue,
  loadOpeningSrs,
  loadReviews,
  mainLine,
  MAX_PLY,
  MIN_SUPPORT,
  moverWin,
  nodesToReview,
  type OpeningGroup,
  type OpeningNode,
  pickReply,
  positionKey,
  recordPractice,
  repertoireMove,
  type Review,
  reviewFor,
  reviewLabel,
  saveReview,
  topOpenings,
} from '../lib/openings'
import { score } from '../lib/progress'
import type { GameSummary } from '../lib/types'

const colorName = (c: 'white' | 'black') => (c === 'white' ? 'blancas' : 'negras')
const moveNumber = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'} ${toSpanishSan(san)}`

/** Tarjeta de Aprender con tus 5 aperturas más jugadas con cada color. */
export function OpeningsCard({ games, onOpen }: { games: GameSummary[]; onOpen: (g: OpeningGroup) => void }) {
  const top = useMemo(() => topOpenings(games), [games])
  const srs = loadOpeningSrs()
  if (!top.white.length && !top.black.length) {
    return <p className="muted">Importa tus partidas de Chess.com o Lichess y aquí aparecerán las aperturas que más juegas, para revisarlas y practicarlas.</p>
  }
  return (
    <div className="openings-cols">
      {(['white', 'black'] as const).map((c) => (
        <div key={c}>
          <h3>Con {colorName(c)}</h3>
          <div className="lesson-list">
            {top[c].map((g) => (
              <button key={g.id} className="lesson-item" onClick={() => onOpen(g)}>
                <span className="lesson-text">
                  <strong>{g.family}</strong>
                  <span className="muted small">
                    {g.games.length} partidas, {score(g.results)} % de puntos
                  </span>
                  {srs[g.id] ? (
                    isDue(srs, g.id) && <span className="small due-tag">Toca repasar</span>
                  ) : (
                    <span className="small muted">Sin practicar</span>
                  )}
                </span>
              </button>
            ))}
            {!top[c].length && <p className="muted small">Sin partidas con {colorName(c)}.</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Revisa con Stockfish tus jugadas habituales en el árbol de la apertura (las que no estén ya revisadas). */
function useReviews(tree: Map<string, OpeningNode>) {
  const [reviews, setReviews] = useState<Record<string, Review>>(loadReviews)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    const pending = nodesToReview(tree).filter((n) => !reviewFor(loadReviews(), n.key, n.moves[0].uci))
    if (!pending.length) return
    setBusy('openings', true)
    setProgress({ done: 0, total: pending.length })
    void (async () => {
      const engine = getEngine('main')
      for (const [i, n] of pending.entries()) {
        if (cancelled) break
        try {
          const before = await engine.evaluate(n.fen, 14)
          const played = n.moves[0]
          let drop = 0
          if (before.best && before.best !== played.uci) {
            const next = childKey(n.fen, played.uci)
            if (next) {
              const after = await engine.evaluate(next.fen, 14)
              // La evaluación de después es del rival: se invierte.
              drop = Math.max(0, moverWin(before.cp, before.mate) - moverWin(after.cp !== undefined ? -after.cp : undefined, after.mate !== undefined ? -after.mate : undefined))
            }
          }
          const best = before.best ?? played.uci
          const c = new Chess(n.fen)
          const bestSan = c.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }).san
          saveReview(n.key, played.uci, { best, bestSan, drop: Math.round(drop * 10) / 10 })
        } catch {
          // Si una posición falla, se sigue con las demás.
        }
        if (!cancelled) {
          setReviews(loadReviews())
          setProgress({ done: i + 1, total: pending.length })
        }
      }
      if (!cancelled) setProgress(null)
      if (!cancelled) setBusy('openings', false)
    })()
    return () => {
      cancelled = true
      setBusy('openings', false)
    }
  }, [tree])
  return { reviews, progress }
}

export function OpeningDetail({ group, onBack, onPlayFrom }: { group: OpeningGroup; onBack: () => void; onPlayFrom?: (fen: string) => void }) {
  const tree = useMemo(() => buildTree(group), [group])
  const { reviews, progress } = useReviews(tree)
  const line = mainLine(tree, reviews)
  const [sel, setSel] = useState(line.length)
  const [practice, setPractice] = useState(false)
  const [explorer, setExplorer] = useState<ExplorerMove[] | null>(null)
  useBackHandler(!practice, onBack)

  const summaries = useMemo(() => new Map(allSummaries().map((s) => [s.id, s])), [])
  const analyzed = group.games.filter((g) => summaries.has(g.id))
  const accuracy = analyzed.length ? Math.round(analyzed.reduce((s, g) => s + summaries.get(g.id)!.accuracy[group.color], 0) / analyzed.length) : null

  const endFen = useMemo(() => {
    const c = new Chess()
    for (const st of line) c.move({ from: st.uci.slice(0, 2), to: st.uci.slice(2, 4), promotion: st.uci[4] })
    return c.fen()
  }, [line])

  // Ideas para seguir: lo más jugado en Lichess tras tu línea (si hay conexión).
  useEffect(() => {
    let cancelled = false
    if (!navigator.onLine || !line.length) return
    fetchExplorer(endFen)
      .then((m) => !cancelled && setExplorer(m.slice(0, 3)))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [endFen, line.length])

  if (practice) return <OpeningPractice group={group} tree={tree} reviews={reviews} onExit={() => setPractice(false)} />

  const shownFen = sel === 0 ? new Chess().fen() : (childKey(line[sel - 1].fen, line[sel - 1].uci)?.fen ?? endFen)
  const lastStep = sel > 0 ? line[sel - 1] : undefined
  // Tus jugadas mejorables, de las más repetidas a las menos.
  const improvements = nodesToReview(tree)
    .map((n) => ({ n, rep: repertoireMove(n, reviews) }))
    .filter((x) => x.rep?.corrected && x.rep.played >= MIN_SUPPORT)
    .sort((a, b) => b.n.count - a.n.count)
    .slice(0, 5)
  const firstOpp = line.filter((s) => !s.user).slice(0, 2)

  return (
    <div className="page puzzles opening-detail">
      <div className="puzzle-board">
        <Board
          fen={shownFen}
          orientation={group.color}
          lastMove={lastStep ? [lastStep.uci.slice(0, 2), lastStep.uci.slice(2, 4)] : undefined}
        />
      </div>
      <div className="puzzle-side">
        <section className="card">
          <button className="link small" onClick={onBack}>
            Volver a Aprender
          </button>
          <h2>
            {group.family} <span className="muted small">con {colorName(group.color)}</span>
          </h2>
          <p className="small">
            {group.games.length} partidas: {group.results.w} victorias, {group.results.d} tablas y {group.results.l} derrotas ({score(group.results)} % de
            puntos){accuracy !== null ? `. Precisión media: ${accuracy} %` : ''}.
          </p>
          {progress && (
            <p className="msg info small">
              <span className="spinner" /> Stockfish revisa tus jugadas: {progress.done} de {progress.total}.
            </p>
          )}
          <div className="toolbar">
            <button className="btn primary" onClick={() => setPractice(true)} disabled={!line.length}>
              Practicar
            </button>
            {onPlayFrom && line.length > 0 && (
              <button className="btn" onClick={() => onPlayFrom(endFen)}>
                Jugar desde el final de la línea
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <h3>Tu línea habitual</h3>
          {line.length ? (
            <>
              <div className="variation-moves">
                <button className={`var-move ${sel === 0 ? 'active' : ''}`} onClick={() => setSel(0)}>
                  Inicio
                </button>
                {line.map((st, i) => {
                  const r = st.user && st.rep ? reviewFor(reviews, st.key, st.rep.corrected ? '' : st.uci) : undefined
                  const cls = st.rep?.corrected ? 'corrected' : r ? reviewLabel(r.drop) : ''
                  return (
                    <button key={i} className={`var-move ${st.user ? 'mine' : ''} ${cls} ${sel === i + 1 ? 'active' : ''}`} onClick={() => setSel(i + 1)}>
                      {moveNumber(i, st.san)}
                    </button>
                  )
                })}
              </div>
              <p className="muted small">
                Tus jugadas, en negrita; las del rival, las que más te juegan. Las marcadas en verde son correcciones de Stockfish a lo que sueles jugar.
              </p>
            </>
          ) : (
            <p className="muted small">Faltan partidas con esta apertura para sacar una línea (hacen falta al menos {MIN_SUPPORT} que coincidan).</p>
          )}
        </section>

        {improvements.length > 0 && (
          <section className="card">
            <h3>Lo que puedes mejorar</h3>
            <ul className="rules">
              {improvements.map(({ n, rep }) => (
                <li key={n.key}>
                  En la jugada {Math.floor(n.ply / 2) + 1} sueles jugar <strong>{toSpanishSan(rep!.corrected!.yourSan)}</strong> ({rep!.played} de {rep!.of}{' '}
                  partidas). Mejor: <strong>{toSpanishSan(rep!.san)}</strong>.
                </li>
              ))}
            </ul>
          </section>
        )}

        {firstOpp.length > 0 && (
          <section className="card">
            <h3>Lo que te juegan</h3>
            {firstOpp.map((st) => {
              const node = tree.get(st.key)!
              return (
                <p key={st.key} className="small">
                  En la jugada {Math.floor(node.ply / 2) + 1}:{' '}
                  {node.moves
                    .slice(0, 3)
                    .map((m) => `${toSpanishSan(m.san)} (${Math.round((m.count / node.count) * 100)} %)`)
                    .join(', ')}
                  .
                </p>
              )
            })}
          </section>
        )}

        {explorer && explorer.length > 0 && (
          <section className="card">
            <h3>Para seguir</h3>
            <p className="muted small">Lo más jugado en Lichess entre jugadores de 1000 a 1400 tras tu línea:</p>
            <p className="small">
              {explorer.map((m) => `${toSpanishSan(m.san)} (${m.games.toLocaleString('es-ES')} partidas, ${m.score} % de puntos)`).join(', ')}.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

type PracticeState = { state: 'playing' } | { state: 'done'; text: string }

/** Práctica: el rival te juega lo que te juegan de verdad y tú tienes que encontrar tu jugada de repertorio. */
function OpeningPractice({ group, tree, reviews, onExit }: { group: OpeningGroup; tree: Map<string, OpeningNode>; reviews: Record<string, Review>; onExit: () => void }) {
  const userChar = group.color === 'white' ? 'w' : 'b'
  const chess = useRef(new Chess())
  const [fen, setFen] = useState(() => new Chess().fen())
  const [lastMove, setLastMove] = useState<[string, string] | undefined>()
  const [status, setStatus] = useState<PracticeState>({ state: 'playing' })
  const [msg, setMsg] = useState<string>('')
  const [mistakes, setMistakes] = useState(0)
  const [wrongHere, setWrongHere] = useState(0)
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [resetKey, setResetKey] = useState(0)
  const [round, setRound] = useState(0)
  const [sans, setSans] = useState<string[]>([])
  useBackHandler(true, onExit)

  const finish = (m: number) => {
    const clean = m === 0
    recordPractice(group.id, clean)
    setStatus({
      state: 'done',
      text: clean
        ? '¡Línea completada sin errores! La próxima repetición, dentro de unos días.'
        : `Línea completada con ${m} ${m === 1 ? 'fallo' : 'fallos'}. Volverá a salir pronto para repasarla.`,
    })
  }

  const node = (): OpeningNode | undefined => {
    const n = tree.get(positionKey(chess.current.fen()))
    return n && n.count >= MIN_SUPPORT && chess.current.history().length < MAX_PLY ? n : undefined
  }

  // Turno del rival: responde como te responden en tus partidas.
  useEffect(() => {
    if (status.state !== 'playing' || chess.current.turn() === userChar) return
    const n = node()
    if (!n) {
      finish(mistakes)
      return
    }
    const reply = pickReply(n)
    if (!reply) {
      finish(mistakes)
      return
    }
    const t = setTimeout(() => {
      const m = chess.current.move({ from: reply.uci.slice(0, 2), to: reply.uci.slice(2, 4), promotion: reply.uci[4] })
      setFen(chess.current.fen())
      setSans(chess.current.history())
      setLastMove([m.from, m.to])
      setMsg(`El rival juega ${toSpanishSan(m.san)} (te lo juegan en ${reply.count} de ${n.count} partidas).`)
      if (!node() || !repertoireMove(node()!, reviews)) finish(mistakes)
    }, 500)
    return () => clearTimeout(t)
  }, [fen, status, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (from: string, to: string) => {
    if (status.state !== 'playing') return
    const n = node()
    const rep = n && repertoireMove(n, reviews)
    if (!rep) return
    const c = new Chess(chess.current.fen())
    let played
    try {
      played = c.move({ from, to, promotion: 'q' })
    } catch {
      setResetKey((k) => k + 1)
      return
    }
    if (played.lan.slice(0, 4) !== rep.uci.slice(0, 4)) {
      if (wrongHere === 0) setMistakes((x) => x + 1)
      const tries = wrongHere + 1
      setWrongHere(tries)
      setResetKey((k) => k + 1)
      if (tries >= 2) setArrows([{ orig: rep.uci.slice(0, 2), dest: rep.uci.slice(2, 4), brush: 'green' }])
      setMsg(tries >= 2 ? `Tu jugada de repertorio es ${toSpanishSan(rep.san)}.` : `${toSpanishSan(played.san)} no es tu jugada de repertorio. Prueba otra vez.`)
      return
    }
    const m = chess.current.move({ from: rep.uci.slice(0, 2), to: rep.uci.slice(2, 4), promotion: rep.uci[4] })
    setFen(chess.current.fen())
    setSans(chess.current.history())
    setLastMove([m.from, m.to])
    setArrows([])
    setWrongHere(0)
    setMsg(
      rep.corrected
        ? `¡Bien! ${toSpanishSan(rep.san)} es mejor que ${toSpanishSan(rep.corrected.yourSan)}, que es lo que solías jugar.`
        : `¡Bien! ${toSpanishSan(rep.san)} es tu jugada (la jugaste en ${rep.played} de ${rep.of} partidas).`,
    )
    if (!node()) finish(mistakes)
  }

  const restart = () => {
    chess.current = new Chess()
    setFen(chess.current.fen())
    setSans([])
    setLastMove(undefined)
    setStatus({ state: 'playing' })
    setMsg('')
    setMistakes(0)
    setWrongHere(0)
    setArrows([])
    setRound((r) => r + 1)
  }

  const userTurn = status.state === 'playing' && fen.split(' ')[1] === userChar

  return (
    <div className="page puzzles opening-practice">
      <div className="puzzle-board">
        <Board fen={fen} orientation={group.color} movableColor={userTurn ? group.color : undefined} lastMove={lastMove} arrows={arrows} onMove={onMove} resetKey={resetKey} />
      </div>
      <div className="puzzle-side">
        <section className="card">
          <button className="link small" onClick={onExit}>
            Volver a la apertura
          </button>
          <h2>Practicar: {group.family}</h2>
          {status.state === 'playing' ? (
            <p className="msg info">{userTurn ? `Te toca: juega tu jugada de repertorio. ${msg}` : msg || 'El rival está pensando…'}</p>
          ) : (
            <p className={`msg ${mistakes ? 'error' : 'ok'}`}>{status.text}</p>
          )}
          <p className="small muted">
            {sans.length ? sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${toSpanishSan(s)}` : toSpanishSan(s))).join(' ') : 'Posición inicial.'}
          </p>
          <div className="toolbar">
            <button className="btn" onClick={restart}>
              {status.state === 'playing' ? 'Empezar de nuevo' : 'Otra línea'}
            </button>
          </div>
        </section>
        <section className="card">
          <h3>Cómo funciona</h3>
          <p className="small muted">
            El rival responde con lo que te juegan de verdad en tus partidas, así que cada vez puede salir una línea distinta. Tú tienes que
            jugar tu repertorio: lo que sueles jugar o, si Stockfish lo ve claramente peor, la jugada que propone. Si la línea sale sin fallos, la
            próxima repetición se aplaza unos días.
          </p>
        </section>
      </div>
    </div>
  )
}

