import { useEffect, useState } from 'react'

const PREFIX = 'ajedrez:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento disponible: la app sigue funcionando en memoria.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // Ignorado
  }
}

export function listKeys(prefix: string): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .map((k) => k.slice(PREFIX.length))
  } catch {
    return []
  }
}

/** useState persistido en localStorage. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial))
  useEffect(() => save(key, value), [key, value])
  return [value, setValue] as const
}
