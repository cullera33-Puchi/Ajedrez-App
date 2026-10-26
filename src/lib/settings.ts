import { load, save } from './storage'

export interface Settings {
  chesscomUser: string
  lichessUser: string
  depth: number
}

const DEFAULTS: Settings = { chesscomUser: '', lichessUser: '', depth: 12 }

export function loadSettings(): Settings {
  return { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) }
}

export function saveSettings(s: Settings): void {
  save('settings', s)
}
