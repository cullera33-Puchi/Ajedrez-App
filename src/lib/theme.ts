import { load, save } from './storage'

/** auto sigue el modo del sistema (día o noche); light y dark lo fijan. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

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
