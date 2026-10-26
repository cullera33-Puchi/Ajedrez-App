import { load, save } from './storage'

/** auto sigue el modo del sistema (día o noche); light y dark lo fijan; eink es para tablets de tinta electrónica. */
export type ThemeChoice = 'auto' | 'light' | 'dark' | 'eink'

export const isEink = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'eink'

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice
}

export const loadTheme = () => load<ThemeChoice>('theme', 'auto')

export function setTheme(choice: ThemeChoice): void {
  save('theme', choice)
  applyTheme(choice)
}
