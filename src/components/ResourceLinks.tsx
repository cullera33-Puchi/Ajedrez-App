import { themeName } from '../lib/puzzles'

/** Términos de búsqueda en español para cada tema (lo que un principiante buscaría). */
const QUERY: Record<string, string> = {
  mateIn1: 'patrones de mate',
  mateIn2: 'patrones de mate en dos jugadas',
  backRankMate: 'mate del pasillo',
  smotheredMate: 'mate de la coz',
  hangingPiece: 'piezas colgadas no regalar piezas',
  fork: 'doble ataque',
  pin: 'clavada',
  skewer: 'ensartada',
  defensiveMove: 'cómo defenderse de amenazas',
  promotion: 'coronación de peones',
  endgame: 'finales básicos',
  discoveredAttack: 'ataque a la descubierta',
}

const LICHESS_THEMES = new Set([
  'mateIn1', 'mateIn2', 'backRankMate', 'smotheredMate', 'hangingPiece', 'fork', 'pin', 'skewer', 'defensiveMove', 'promotion', 'endgame', 'discoveredAttack',
])

export function resourceLinks(theme: string): { label: string; href: string }[] {
  const q = QUERY[theme] ?? themeName(theme).toLowerCase()
  const links: { label: string; href: string }[] = []
  if (LICHESS_THEMES.has(theme)) links.push({ label: 'Entrenar en Lichess', href: `https://lichess.org/training/${theme}` })
  links.push(
    { label: 'Vídeos', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`ajedrez ${q} principiantes`)}` },
    { label: 'Libros y cursos', href: `https://www.google.com/search?q=${encodeURIComponent(`libro o curso de ajedrez ${q} para principiantes`)}` },
  )
  return links
}

/** Enlaces para aprender más sobre un tema: entrenamiento en Lichess, vídeos y libros o cursos. */
export function ResourceLinks({ theme, title = true }: { theme: string; title?: boolean }) {
  return (
    <div className="resources">
      {title && <span className="small muted">Aprender más sobre {themeName(theme).toLowerCase()}:</span>}
      <div className="resource-links">
        {resourceLinks(theme).map((l) => (
          <a key={l.label} className="resource-link" href={l.href} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
    </div>
  )
}
