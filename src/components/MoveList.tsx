import { useEffect, useRef } from 'react'
import { CLASS_SYMBOL, type MoveAnalysis, toSpanishSan } from '../lib/analysis'

interface Props {
  sans: string[]
  analysis?: MoveAnalysis[]
  ply: number
  onSelect: (ply: number) => void
}

export function MoveList({ sans, analysis, ply, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector('.move.active')?.scrollIntoView({ block: 'nearest' })
  }, [ply])

  const rows = []
  for (let i = 0; i < sans.length; i += 2) {
    rows.push(
      <div className="move-row" key={i}>
        <span className="move-num">{i / 2 + 1}.</span>
        {[i, i + 1].map((j) =>
          j < sans.length ? (
            <button key={j} className={`move ${ply === j + 1 ? 'active' : ''} ${analysis?.[j] ? 'c-' + analysis[j].classification : ''}`} onClick={() => onSelect(j + 1)}>
              {toSpanishSan(sans[j])}
              {analysis?.[j] && <span className="move-sym">{CLASS_SYMBOL[analysis[j].classification]}</span>}
            </button>
          ) : (
            <span key={j} />
          ),
        )}
      </div>,
    )
  }
  return (
    <div className="movelist" ref={ref}>
      {rows.length ? rows : <p className="muted">La partida no tiene jugadas.</p>}
    </div>
  )
}
