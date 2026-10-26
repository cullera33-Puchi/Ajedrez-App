import { useEffect, useState } from 'react'

const PREFIX = 'ajedrez:'

// Si localStorage no está disponible (pruebas o algunos modos privados), se guarda en memoria.
const memory = new Map<string, string>()

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function setItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  setItem(PREFIX + key, JSON.stringify(value))
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    memory.delete(PREFIX + key)
  }
}

export function listKeys(prefix: string): string[] {
  let keys: string[]
  try {
    keys = Object.keys(localStorage)
  } catch {
    keys = [...memory.keys()]
  }
  return keys.filter((k) => k.startsWith(PREFIX + prefix)).map((k) => k.slice(PREFIX.length))
}

/** Todas las claves propias de la app, con su valor (para la copia de seguridad). */
export function dumpAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of listKeys('')) out[k] = load(k, null)
  return out
}

/** useState persistido en localStorage. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial))
  useEffect(() => save(key, value), [key, value])
  return [value, setValue] as const
}
