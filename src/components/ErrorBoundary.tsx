import { Component, type ReactNode } from 'react'
import { copyText } from '../lib/coach'
import { logError, logReport } from '../lib/log'

interface Props {
  children: ReactNode
  onHome: () => void
}

/**
 * Si una pantalla falla al dibujarse, en lugar de quedarse en blanco muestra un aviso, lo apunta en el
 * registro y deja volver a Inicio o copiar el registro para Claude.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean; copied: boolean }> {
  state = { failed: false, copied: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logError(`La pantalla ha fallado: ${error.message}`, `${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page">
        <section className="card">
          <h2>Algo ha fallado en esta pantalla</h2>
          <p className="muted">El error ha quedado apuntado en el registro (Inicio, Registro de errores). Tus datos no se han perdido.</p>
          <div className="toolbar">
            <button className="btn primary" onClick={this.props.onHome}>
              Volver a Inicio
            </button>
            <button className="btn" onClick={() => void copyText(logReport()).then((ok) => this.setState({ copied: ok }))}>
              Copiar el registro para Claude
            </button>
          </div>
          {this.state.copied && <p className="msg ok small">Copiado. Pégalo en la conversación con Claude.</p>}
        </section>
      </div>
    )
  }
}
