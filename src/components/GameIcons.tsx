/** Iconos de las acciones de la partida, con el mismo trazo fino que los del menú. */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="action-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const IconUndo = () => (
  <Svg>
    <path d="M9 7 4.5 11.5 9 16" />
    <path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-2" />
  </Svg>
)

export const IconFlag = () => (
  <Svg>
    <path d="M5.5 21V4" />
    <path d="M5.5 4.5h11l-2.5 4 2.5 4h-11" />
  </Svg>
)

export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconCheck = () => (
  <Svg>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const IconHandshake = () => (
  <Svg>
    <path d="M3 11.5 7 8l3 1.5L13 8l4 3.5" />
    <path d="M7 8 3 12l5.5 5.5a1.5 1.5 0 0 0 2.1 0L17 11.5 21 12" />
    <path d="M10 14.5l2 2M12 12.5l2 2" />
  </Svg>
)
