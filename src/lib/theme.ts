import { load, save } from './storage'

/**
 * auto sigue el modo del sistema (día o noche); light y dark lo fijan; eink es para tablets de tinta
 * electrónica, y eink-dark es su versión con fondo negro (para jugar de noche).
 */
export type ThemeChoice = 'auto' | 'light' | 'dark' | 'eink' | 'eink-dark'

export const isEink = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'eink'

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  // Tinta noche usa todas las reglas de tinta (data-theme="eink") y cambia solo los colores (data-ink).
  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice === 'eink-dark' ? 'eink' : choice
  if (choice === 'eink-dark') root.dataset.ink = 'dark'
  else delete root.dataset.ink
  syncThemeColor()
}

/**
 * La barra de estado del móvil (la de la hora) toma el color de theme-color: se iguala al fondo de la
 * app con el tema elegido, que puede no coincidir con el del sistema (por ejemplo, tinta o día fijo).
 */
function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (!color) return
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color
}

// Con el tema automático, al cambiar el sistema de día a noche cambia también la barra.
if (typeof window !== 'undefined') window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor)

export const loadTheme = () => load<ThemeChoice>('theme', 'auto')

export function setTheme(choice: ThemeChoice): void {
  save('theme', choice)
  applyTheme(choice)
}
