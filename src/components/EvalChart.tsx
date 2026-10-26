import { type GameAnalysis, winPercent } from '../lib/analysis'

interface Props {
  analysis: GameAnalysis
  ply: number
  onSelect: (ply: number) => void
}

const W = 600
const H = 110

/** Gráfico de la probabilidad de ganar de las blancas a lo largo de la partida. */
export function EvalChart({ analysis, ply, onSelect }: Props) {
  const n = analysis.positions.length - 1
  if (n < 1) return null
  const x = (i: number) => (i / n) * W
  const y = (w: number) => H - (w / 100) * H
  const pts = analysis.positions.map((p, i) => `${x(i).toFixed(1)},${y(winPercent(p)).toFixed(1)}`)
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSelect(Math.round(((e.clientX - r.left) / r.width) * n))
  }

  return (
    <svg className="evalchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={handleClick} role="img" aria-label="Gráfico de evaluación">
      <rect width={W} height={H} className="evalchart-bg" />
      <polygon points={area} className="evalchart-area" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="evalchart-mid" />
      {analysis.moves.map((m) =>
        m.classification === 'grave' || m.classification === 'error' ? (
          <circle key={m.ply} cx={x(m.ply)} cy={y(winPercent(analysis.positions[m.ply]))} r={4} className={`dot-${m.classification}`} />
        ) : null,
      )}
      <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} className="evalchart-cursor" />
    </svg>
  )
}
