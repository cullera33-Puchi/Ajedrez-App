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

  // Mantiene visible la jugada actual desplazando solo los contenedores con scroll propio
  // (la lista y, en el móvil, la zona bajo el tablero), nunca la página entera.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.move.active')
    if (el) keepVisible(el)
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

function keepVisible(el: HTMLElement, margin = 8) {
  for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
    const oy = getComputedStyle(box).overflowY
    if ((oy !== 'auto' && oy !== 'scroll') || box.scrollHeight <= box.clientHeight) continue
    const b = box.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.top < b.top + margin) box.scrollTop -= b.top + margin - e.top
    else if (e.bottom > b.bottom - margin) box.scrollTop += e.bottom - (b.bottom - margin)
  }
}
