import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initStore } from './lib/games'
import { summarizeStored } from './lib/recommend'
import { applyTheme, loadTheme } from './lib/theme'
import './styles.css'

applyTheme(loadTheme())

// Se abre la base de datos (y se migran los datos antiguos) antes de mostrar la app.
initStore(summarizeStored)
  .catch((e) => console.error('No se ha podido abrir el almacenamiento', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

// Instalación en el móvil y uso sin conexión (solo en la versión compilada).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
