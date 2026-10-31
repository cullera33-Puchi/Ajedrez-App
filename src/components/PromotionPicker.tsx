import { createElement } from 'react'
import type { Color } from '../lib/types'

const PIECES: { p: string; role: string; label: string }[] = [
  { p: 'q', role: 'queen', label: 'Dama' },
  { p: 'r', role: 'rook', label: 'Torre' },
  { p: 'b', role: 'bishop', label: 'Alfil' },
  { p: 'n', role: 'knight', label: 'Caballo' },
]

/** Elección de pieza al coronar un peón, con las mismas figuras del tablero. */
export function PromotionPicker({ color, onPick, onCancel }: { color: Color; onPick: (p: string) => void; onCancel: () => void }) {
  return (
    <div className="promo-backdrop" onClick={onCancel}>
      <div className="promo" role="dialog" aria-label="Elige pieza para coronar" onClick={(e) => e.stopPropagation()}>
        <p>Coronar en:</p>
        <div className="promo-options">
          {PIECES.map((x) => (
            <button key={x.p} className="promo-btn" onClick={() => onPick(x.p)} title={x.label} aria-label={x.label}>
              <span className="promo-piece cg-wrap" aria-hidden="true">
                {createElement('piece', { className: `${x.role} ${color}` })}
              </span>
              <small>{x.label}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** ¿Esta jugada de peón llega a la última fila? */
export function needsPromotion(fen: string, from: string, to: string, pieceType?: string): boolean {
  return pieceType === 'p' && (to[1] === '8' || to[1] === '1') && from !== to && Boolean(fen)
}
