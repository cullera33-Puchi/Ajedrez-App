/** Aviso que sustituye al análisis y al escáner mientras hay una partida online sin terminar. */
export function LiveLock({ onGoToGame }: { onGoToGame: () => void }) {
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
