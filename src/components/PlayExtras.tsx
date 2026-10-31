import { createElement } from 'react'
import type { Material, Role } from '../lib/playView'
import type { Color } from '../lib/types'
import { IconFirst, IconLast, IconNext, IconPrev } from './NavIcons'

const ROLE_CLASS: Record<Role, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }
const ROLE_NAME: Record<Role, [string, string]> = { p: ['peón', 'peones'], n: ['caballo', 'caballos'], b: ['alfil', 'alfiles'], r: ['torre', 'torres'], q: ['dama', 'damas'] }

/** Piezas que ha capturado un bando (con las figuras del tablero) y su ventaja en puntos. */
export function Captured({ side, material }: { side: Color; material: Material }) {
  const roles = material.captured[side]
  const adv = material.advantage[side]
  if (!roles.length && !adv) return null
  const victim = side === 'white' ? 'black' : 'white'
  const counts = new Map<Role, number>()
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1)
  const label = [...counts].map(([r, n]) => `${n} ${ROLE_NAME[r][n === 1 ? 0 : 1]}`).join(', ')
  return (
    <span className="captured" aria-label={`Ha capturado: ${label || 'nada'}${adv ? `. Ventaja de ${adv}` : ''}`}>
      <span className="captured-pieces cg-wrap" aria-hidden="true">
        {roles.map((r, i) => createElement('piece', { key: i, className: `${ROLE_CLASS[r]} ${victim} ${i > 0 && roles[i - 1] === r ? 'same' : ''}` }))}
      </span>
      {adv > 0 && <span className="captured-adv">+{adv}</span>}
    </span>
  )
}

interface NavProps {
  ply: number
  total: number
  viewing: boolean
  onGo: (ply: number) => void
}

/** Botones para repasar las jugadas de la partida en curso sin salir de ella. */
export function PlayNav({ ply, total, viewing, onGo }: NavProps) {
  return (
    <div className={`play-nav ${viewing ? 'viewing' : ''}`}>
      <button className="btn" onClick={() => onGo(0)} disabled={ply === 0} aria-label="Ir al principio">
        <IconFirst />
      </button>
      <button className="btn" onClick={() => onGo(ply - 1)} disabled={ply === 0} aria-label="Jugada anterior">
        <IconPrev />
      </button>
      <span className="play-nav-info small" aria-live="polite">
        {viewing ? (
          <button className="link" onClick={() => onGo(total)}>
            Volver a la partida
          </button>
        ) : total ? (
          <span className="muted">Repasa las jugadas</span>
        ) : null}
      </span>
      <button className="btn" onClick={() => onGo(ply + 1)} disabled={!viewing} aria-label="Jugada siguiente">
        <IconNext />
      </button>
      <button className="btn" onClick={() => onGo(total)} disabled={!viewing} aria-label="Posición actual">
        <IconLast />
      </button>
    </div>
  )
}
