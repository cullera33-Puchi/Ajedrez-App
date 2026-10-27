import { useEffect } from 'react'
import { verifyLiveGame } from '../lib/lichessPlay'

/** Aviso que sustituye al análisis y al escáner mientras hay una partida online sin terminar. */
export function LiveLock({ onGoToGame, onUnlock }: { onGoToGame: () => void; onUnlock: () => void }) {
  // Si la partida ya terminó en Lichess (por ejemplo, con la app cerrada), se desbloquea.
  useEffect(() => {
    void verifyLiveGame().then((live) => !live && onUnlock())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <section className="card empty">
        <h2>Partida online en curso</h2>
        <p className="muted">
          Mientras juegas en Lichess, el análisis y el escáner están bloqueados: usar un motor durante la partida va contra el juego limpio. Se
          desbloquean al terminarla.
        </p>
        <button className="btn primary" onClick={onGoToGame}>
          Volver a la partida
        </button>
      </section>
    </div>
  )
}
