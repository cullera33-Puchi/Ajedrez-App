import { useState } from 'react'

export interface TrendPoint {
  /** Posición en el eje horizontal (fecha en ms). */
  x: number
  y: number
  /** Texto del detalle al tocar el punto. */
  label: string
}

interface Props {
  points: TrendPoint[]
  /** Etiqueta del valor, para el texto accesible. */
  name: string
  height?: number
  /** Formato de los valores mínimo y máximo bajo el gráfico. */
  format?: (v: number) => string
  /** Dibuja barras en lugar de línea. */
  bars?: boolean
}

const W = 600

/** Gráfico de una sola serie, con detalle del punto tocado. */
export function TrendChart({ points, name, height = 120, format = (v) => String(Math.round(v)), bars = false }: Props) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length < 2) return <p className="muted small">Faltan datos para dibujar la evolución.</p>
  const PAD = 6
  const x0 = points[0].x
  const x1 = points[points.length - 1].x
  const ys = points.map((p) => p.y)
  const lo = bars ? 0 : Math.min(...ys)
  const hi = Math.max(...ys)
  const span = hi - lo || 1
  const x = (v: number) => PAD + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * PAD)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (height - 2 * PAD)
  const line = points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const barW = Math.max(2, (W - 2 * PAD) / points.length - 3)

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * W
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.x) - vx) < Math.abs(x(points[best].x) - vx)) best = i
    })
    setSel(best)
  }
  const shown = sel !== null ? points[sel] : null

  return (
    <div className="trend">
      <svg className="evo-chart" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" onPointerDown={pick} role="img" aria-label={name}>
        {bars ? (
          points.map((p, i) => (
            <rect key={i} x={x(p.x) - barW / 2} y={y(p.y)} width={barW} height={Math.max(0, height - PAD - y(p.y))} className={`bar-win ${sel === i ? 'sel' : ''}`} />
          ))
        ) : (
          <polyline points={line} className="evo-line" vectorEffect="non-scaling-stroke" />
        )}
        {shown && <line x1={x(shown.x)} x2={x(shown.x)} y1={0} y2={height} className="evo-cursor" vectorEffect="non-scaling-stroke" />}
      </svg>
      <p className="small muted chart-note">
        {bars ? `Máximo ${format(hi)}.` : `Entre ${format(lo)} y ${format(hi)}.`}
      </p>
      <p className="small evo-readout">{shown ? shown.label : <span className="muted">Toca el gráfico para ver el detalle.</span>}</p>
    </div>
  )
}
