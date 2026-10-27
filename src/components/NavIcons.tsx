/**
 * Iconos de navegación por la partida, dibujados en SVG con el color del texto. Los caracteres
 * ⏮ ◀ ▶ ⏭ el iPhone los muestra como emoji azules.
 */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="nav-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    {children}
  </svg>
)

export const IconFirst = () => (
  <Svg>
    <rect x="4" y="5" width="2.6" height="14" rx="1" />
    <path d="M19 5.8v12.4a1 1 0 0 1-1.5.86L8.4 12.86a1 1 0 0 1 0-1.72l9.1-6.2A1 1 0 0 1 19 5.8z" />
  </Svg>
)
export const IconPrev = () => (
  <Svg>
    <path d="M17 5.8v12.4a1 1 0 0 1-1.5.86L6.4 12.86a1 1 0 0 1 0-1.72l9.1-6.2A1 1 0 0 1 17 5.8z" />
  </Svg>
)
export const IconNext = () => (
  <Svg>
    <path d="M7 5.8v12.4a1 1 0 0 0 1.5.86l9.1-6.2a1 1 0 0 0 0-1.72l-9.1-6.2A1 1 0 0 0 7 5.8z" />
  </Svg>
)
export const IconLast = () => (
  <Svg>
    <path d="M5 5.8v12.4a1 1 0 0 0 1.5.86l9.1-6.2a1 1 0 0 0 0-1.72l-9.1-6.2A1 1 0 0 0 5 5.8z" />
    <rect x="17.4" y="5" width="2.6" height="14" rx="1" />
  </Svg>
)
