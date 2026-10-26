import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Board } from '../components/Board'
import { MoveList } from '../components/MoveList'
import { PromotionPicker } from '../components/PromotionPicker'
import { setBusy } from '../lib/activity'
import {
  addToRecord,
  bestWin,
  type BotGame,
  botAcceptsDraw,
  botGameToSummary,
  type BotStyle,
  chooseBotMove,
  clampElo,
  ELO_PRESETS,
  ELO_STEP,
  loadBotGame,
  loadBotRecord,
  makeBot,
  MAX_ELO,
  MIN_ELO,
  saveBotGame,
} from '../lib/bots'
import { getEngine, releaseEngine } from '../lib/engine'
import type { Settings } from '../lib/settings'
import { usePersistentState } from '../lib/storage'
import type { Color, GameSummary, Result } from '../lib/types'

interface Props {
  settings: Settings
  onSaveGame: (g: GameSummary) => void
  onAnalyze: (id: string) => void
}

type ColorChoice = 'white' | 'random' | 'black'

interface Finished {
  result: Result
  reason: string
  summaryId: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function replay(moves: string[]): Chess {
  const c = new Chess()
  for (const uci of moves) c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return c
}

function endReason(c: Chess): string {
  if (c.isCheckmate()) return 'Jaque mate'
  if (c.isStalemate()) return 'Rey ahogado'
  if (c.isThreefoldRepetition()) return 'Triple repetición'
  if (c.isInsufficientMaterial()) return 'Material insuficiente'
  return 'Regla de las 50 jugadas'
}

export function PlayView({ settings, onSaveGame, onAnalyze }: Props) {
  const [game, setGame] = useState<BotGame | null>(loadBotGame)
  const [elo, setElo] = usePersistentState('botElo', 400)
  const [style, setStyle] = usePersistentState<BotStyle>('botStyle', 'equilibrado')
  const [colorChoice, setColorChoice] = usePersistentState<ColorChoice>('botColor', 'white')
  const [thinking, setThinking] = useState(false)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [record, setRecord] = useState(loadBotRecord)
  const [flipped, setFlipped] = useState(false)

  const chess = useMemo(() => replay(game?.moves ?? []), [game])
  const fen = chess.fen()
  const turn: Color = chess.turn() === 'w' ? 'white' : 'black'
  const bot = game ? makeBot(game.elo, game.style) : makeBot(elo, style)
  const userName = settings.chesscomUser || 'Tú'
  const userTurn = Boolean(game && !finished && turn === game.userColor)

  // Mientras se juega, el análisis en segundo plano se para. Al salir, se libera el motor del bot.
  useEffect(() => {
    setBusy('play', Boolean(game && !finished))
    return () => setBusy('play', false)
  }, [game, finished])
  useEffect(() => () => releaseEngine('play'), [])

  const finish = (g: BotGame, result: Result, reason: string) => {
    const summary = botGameToSummary(g, result, userName, reason)
    onSaveGame(summary)
    const userWon = (result === '1-0') === (g.userColor === 'white') && result !== '1/2-1/2'
    setRecord(addToRecord(makeBot(g.elo).id, result === '1/2-1/2' ? 'd' : userWon ? 'w' : 'l'))
    saveBotGame(null)
    setFinished({ result, reason, summaryId: summary.id })
  }

  const apply = (g: BotGame, uci: string) => {
    const next: BotGame = { ...g, moves: [...g.moves, uci] }
    setGame(next)
    setMsg(null)
    const c = replay(next.moves)
    if (c.isGameOver()) {
      const result: Result = c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2'
      finish(next, result, endReason(c))
    } else {
      saveBotGame(next)
    }
  }

  // Turno del bot
  useEffect(() => {
    if (!game || finished || turn === game.userColor || chess.isGameOver()) return
    let cancelled = false
    setThinking(true)
    const started = Date.now()
    chooseBotMove(fen, bot, getEngine('play'), game.moves.length)
      .then(async (uci) => {
        // Una pausa breve para que parezca que piensa y se vea su jugada.
        await sleep(Math.max(0, 500 + Math.random() * 600 - (Date.now() - started)))
        if (!cancelled) apply(game, uci)
      })
      .catch((e) => !cancelled && setMsg(`El bot no ha podido jugar: ${(e as Error).message}`))
      .finally(() => !cancelled && setThinking(false))
    return () => {
      cancelled = true
    }
  }, [game, finished]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const userColor: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice
    const g: BotGame = { elo: clampElo(elo), style, userColor, moves: [], startedAt: Date.now(), undos: 0 }
    setGame(g)
    saveBotGame(g)
    setFinished(null)
    setMsg(null)
    setFlipped(false)
  }

  const playUser = (from: string, to: string, promotion?: string) => {
    if (!game || !userTurn) return
    try {
      const m = new Chess(fen).move({ from, to, promotion })
      apply(game, m.lan)
    } catch {
      setResetKey((k) => k + 1)
    }
  }

  const onMove = (from: string, to: string) => {
    const piece = chess.get(from as Parameters<typeof chess.get>[0])
    if (piece?.type === 'p' && (to[1] === '8' || to[1] === '1')) setPromo({ from, to })
    else playUser(from, to)
  }

  const undo = () => {
    if (!game || thinking || finished || !game.moves.length) return
    const moves = [...game.moves]
    // Se deshace hasta que vuelva a ser tu turno (tu jugada y la respuesta del bot).
    do moves.pop()
    while (moves.length && replay(moves).turn() !== game.userColor[0])
    const next = { ...game, moves, undos: game.undos + 1 }
    setGame(next)
    saveBotGame(next)
    setMsg('Jugada deshecha.')
  }

  const offerDraw = async () => {
    if (!game || thinking || finished) return
    setMsg(`${bot.name} se lo está pensando…`)
    const botColor: Color = game.userColor === 'white' ? 'black' : 'white'
    const ok = await botAcceptsDraw(fen, bot, botColor, getEngine('play'))
    if (ok) finish(game, '1/2-1/2', 'Tablas acordadas')
    else setMsg(`${bot.name} rechaza las tablas.`)
  }

  const resign = () => {
    if (!game || finished) return
    if (!window.confirm('¿Seguro que quieres rendirte?')) return
    finish(game, game.userColor === 'white' ? '0-1' : '1-0', 'Abandono')
  }

  const newGame = () => {
    setGame(null)
    setFinished(null)
    setMsg(null)
  }

  // Elección de rival
  if (!game) {
    const r = record[bot.id]
    const best = bestWin(record)
    const change = (v: number) => setElo(clampElo(v))
    return (
      <div className="page play-setup">
        <header className="page-head">
          <h1>Jugar</h1>
          <p className="muted">Elige el nivel de tu rival, de 50 en 50 puntos. Al terminar, la partida se guarda en Mis partidas, en el apartado Contra bots.</p>
        </header>
        <section className="card level-card">
          <div className="level-head">
            <span className="bot-avatar">{bot.avatar}</span>
            <div className="bot-info">
              <strong className="level-title">
                {bot.name} <span className="level-elo">{bot.elo}</span>
              </strong>
              <span className="muted small">{bot.description}</span>
            </div>
          </div>
          <div className="level-control">
            <button className="btn" onClick={() => change(elo - ELO_STEP)} disabled={elo <= MIN_ELO} aria-label="Bajar 50 puntos">
              −50
            </button>
            <input
              type="range"
              min={MIN_ELO}
              max={MAX_ELO}
              step={ELO_STEP}
              value={clampElo(elo)}
              onChange={(e) => change(Number(e.target.value))}
              aria-label="Nivel del rival"
            />
            <button className="btn" onClick={() => change(elo + ELO_STEP)} disabled={elo >= MAX_ELO} aria-label="Subir 50 puntos">
              +50
            </button>
          </div>
          <div className="chips">
            {ELO_PRESETS.map((p) => (
              <button key={p} className={`chip ${clampElo(elo) === p ? 'active' : ''}`} onClick={() => change(p)}>
                {p}
              </button>
            ))}
          </div>
          <p className="small bot-record">
            {r ? `Contra ${bot.name} (${bot.elo}): ganadas ${r.w}, perdidas ${r.l}, tablas ${r.d}.` : `Aún no has jugado contra ${bot.name} (${bot.elo}).`}
            {best ? ` Tu mejor victoria: ${best}.` : ''}
          </p>
          <h3>Estilo</h3>
          <div className="segmented" role="radiogroup" aria-label="Estilo del bot">
            {(['equilibrado', 'atacante'] as BotStyle[]).map((st) => (
              <button key={st} role="radio" aria-checked={style === st} className={style === st ? 'active' : ''} onClick={() => setStyle(st)}>
                {st === 'equilibrado' ? 'Equilibrado' : 'Atacante'}
              </button>
            ))}
          </div>
        </section>
        <section className="card start-card">
          <h3>Juegas con</h3>
          <div className="segmented" role="radiogroup" aria-label="Color">
            {(['white', 'random', 'black'] as ColorChoice[]).map((c) => (
              <button key={c} role="radio" aria-checked={colorChoice === c} className={colorChoice === c ? 'active' : ''} onClick={() => setColorChoice(c)}>
                {c === 'white' ? 'Blancas' : c === 'black' ? 'Negras' : 'Al azar'}
              </button>
            ))}
          </div>
          <button className="btn primary play-start" onClick={start}>
            Jugar contra {bot.name} ({bot.elo})
          </button>
        </section>
      </div>
    )
  }

  const orientation: Color = flipped ? (game.userColor === 'white' ? 'black' : 'white') : game.userColor
  const last = game.moves[game.moves.length - 1]
  const sans = chess.history()
  const botLine = `${bot.avatar} ${bot.name} (${bot.elo})`
  const top = orientation === game.userColor ? botLine : userName
  const bottom = orientation === game.userColor ? userName : botLine
  const userWon = finished && finished.result !== '1/2-1/2' && (finished.result === '1-0') === (game.userColor === 'white')

  return (
    <div className="page play" data-fen={fen}>
      <div className="play-board">
        <div className="player-line">{top}</div>
        <Board
          fen={fen}
          orientation={orientation}
          movableColor={userTurn && !thinking ? game.userColor : undefined}
          lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
          onMove={onMove}
          resetKey={resetKey}
        />
        <div className="player-line">{bottom}</div>
      </div>

      <div className="play-side">
        {finished ? (
          <section className={`card play-result ${userWon ? 'win' : finished.result === '1/2-1/2' ? 'draw' : 'loss'}`}>
            <h2>{userWon ? '¡Has ganado!' : finished.result === '1/2-1/2' ? 'Tablas' : `Ha ganado ${bot.name}`}</h2>
            <p className="muted">{finished.reason}. La partida está guardada en Mis partidas.</p>
            <div className="toolbar">
              <button className="btn primary" onClick={() => onAnalyze(finished.summaryId)}>
                Analizar la partida
              </button>
              <button className="btn" onClick={start}>
                Revancha
              </button>
              <button className="btn" onClick={newGame}>
                Otro rival
              </button>
            </div>
          </section>
        ) : (
          <section className="card play-status">
            <p>
              {thinking ? (
                <>
                  <span className="spinner" /> {bot.name} está pensando…
                </>
              ) : userTurn ? (
                <strong>Te toca mover{chess.inCheck() ? ': estás en jaque' : ''}.</strong>
              ) : (
                '…'
              )}
            </p>
            {msg && <p className="muted small">{msg}</p>}
          </section>
        )}
        <section className="card">
          <MoveList sans={sans} ply={sans.length} onSelect={() => undefined} />
        </section>
        <div className="view-controls">
          <button className="btn small" onClick={() => setFlipped((f) => !f)}>
            Girar tablero
          </button>
        </div>
      </div>

      {!finished && (
        <div className="play-actions">
          <button className="btn" onClick={undo} disabled={thinking || !game.moves.length}>
            ↶ Deshacer
          </button>
          <button className="btn" onClick={offerDraw} disabled={thinking}>
            ½ Tablas
          </button>
          <button className="btn" onClick={resign}>
            ⚑ Rendirse
          </button>
        </div>
      )}

      {promo && (
        <PromotionPicker
          color={game.userColor}
          onCancel={() => {
            setPromo(null)
            setResetKey((k) => k + 1)
          }}
          onPick={(p) => {
            const { from, to } = promo
            setPromo(null)
            playUser(from, to, p)
          }}
        />
      )}
    </div>
  )
}
