import { useEffect, useState } from 'react'
import { copyText } from '../lib/coach'
import { clearLog, type LogEntry, loadAppLog, logReport, onLogChange } from '../lib/log'

const LEVEL: Record<LogEntry['level'], string> = { error: 'Error', aviso: 'Aviso', info: 'Info' }

const when = (t: number) => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Tarjeta de Inicio: errores y avisos de la app, para copiarlos o compartirlos con Claude. */
export function LogCard() {
  const [entries, setEntries] = useState(loadAppLog)
  const [open, setOpen] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => onLogChange(() => setEntries(loadAppLog())), [])

  const errors = entries.filter((e) => e.level === 'error').length
  const warns = entries.filter((e) => e.level === 'aviso').length
  const shown = (onlyProblems ? entries.filter((e) => e.level !== 'info') : entries).slice(-40).reverse()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => setMsg((await copyText(logReport())) ? 'Copiado. Pégalo en la conversación con Claude.' : 'No se ha podido copiar.')
  const share = async () => {
    try {
      await navigator.share({ title: 'Registro de Ajedrez App', text: logReport() })
    } catch {
      // Compartir cancelado.
    }
  }

  return (
    <section className="card log-card">
      <h2>Registro de errores</h2>
      <p className="muted small">
        La app apunta sola los errores y avisos mientras la usas, con la pantalla en la que estabas. Si algo falla, cópialo y pégamelo. Se guarda solo en este
        dispositivo y sin claves ni correos.
      </p>
      <p className="small">
        {errors || warns
          ? `${errors} ${errors === 1 ? 'error' : 'errores'} y ${warns} ${warns === 1 ? 'aviso' : 'avisos'} desde el ${when(entries[0].t)}.`
          : 'Sin errores ni avisos registrados.'}
      </p>
      <div className="toolbar">
        <button className="btn primary small" onClick={() => void copy()}>
          Copiar para Claude
        </button>
        {canShare && (
          <button className="btn small" onClick={() => void share()}>
            Compartir
          </button>
        )}
        <button className="btn small" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar' : 'Ver el registro'}
        </button>
        <button
          className="btn small"
          onClick={() => {
            if (window.confirm('¿Borrar el registro de este dispositivo?')) clearLog()
          }}
          disabled={!entries.length}
        >
          Borrar
        </button>
      </div>
      {msg && <p className="msg ok small">{msg}</p>}
      {open && (
        <>
          <label className="check small">
            <input type="checkbox" checked={!onlyProblems} onChange={(e) => setOnlyProblems(!e.target.checked)} /> Ver también las pantallas visitadas
          </label>
          {shown.length ? (
            <ul className="log-list">
              {shown.map((e) => (
                <li key={`${e.t}-${e.msg}`} className={`log-${e.level}`}>
                  <span className="log-when">{when(e.t)}</span> <strong>{LEVEL[e.level]}</strong> <span className="muted">({e.where})</span> {e.msg}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nada que mostrar.</p>
          )}
        </>
      )}
    </section>
  )
}
