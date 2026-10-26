import { formatEval, type PositionEval, winPercent } from '../lib/analysis'
import type { Color } from '../lib/types'

export function EvalBar({ evaluation, orientation }: { evaluation?: PositionEval; orientation: Color }) {
  const white = evaluation ? winPercent(evaluation) : 50
  const text = formatEval(evaluation)
  return (
    <div className={`evalbar ${orientation === 'black' ? 'flipped' : ''}`} title="Ventaja estimada">
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      <span className={`evalbar-text ${white >= 50 ? 'on-white' : 'on-black'}`}>{text}</span>
    </div>
  )
}
