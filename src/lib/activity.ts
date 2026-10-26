/**
 * Avisa de qué está usando el motor en primer plano (analizar una partida, jugar contra un bot),
 * para que el análisis en segundo plano se pare y no lo ralentice.
 */
const busy = new Set<string>()

export function setBusy(reason: string, on: boolean) {
  if (on) busy.add(reason)
  else busy.delete(reason)
}

export const isBusy = () => busy.size > 0
