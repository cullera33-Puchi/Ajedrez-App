import type { Color } from '../lib/types'

const PIECES: { p: string; white: string; black: string; label: string }[] = [
  { p: 'q', white: '♕', black: '♛', label: 'Dama' },
  { p: 'r', white: '♖', black: '♜', label: 'Torre' },
  { p: 'b', white: '♗', black: '♝', label: 'Alfil' },
  { p: 'n', white: '♘', black: '♞', label: 'Caballo' },
]

/** Elección de pieza al coronar un peón. */
export function PromotionPicker({ color, onPick, onCancel }: { color: Color; onPick: (p: string) => void; onCancel: () => void }) {
  return (
    <div className="promo-backdrop" onClick={onCancel}>
      <div className="promo" role="dialog" aria-label="Elige pieza para coronar" onClick={(e) => e.stopPropagation()}>
        <p>Coronar en:</p>
        <div className="promo-options">
          {PIECES.map((x) => (
            <button key={x.p} className="promo-btn" onClick={() => onPick(x.p)} title={x.label} aria-label={x.label}>
              <span>{color === 'white' ? x.white : x.black}</span>
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
