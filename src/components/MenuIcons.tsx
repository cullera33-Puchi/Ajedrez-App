/**
 * Iconos del menú: trazo fino en el color del texto (`currentColor`), todos con el mismo grosor.
 * Sustituyen a los símbolos y emojis, que cada sistema pinta a su manera (en iOS, a color).
 */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="menu-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const IconHome = () => (
  <Svg>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9v11h4.5v-6h4v6h4.5V9" />
  </Svg>
)

export const IconTarget = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Svg>
)

export const IconPawn = () => (
  <Svg>
    <circle cx="12" cy="6" r="2.9" />
    <path d="M8.6 11h6.8" />
    <path d="M10.2 11c0 3.2-1.6 5.4-3.4 7h10.4c-1.8-1.6-3.4-3.8-3.4-7" />
    <path d="M5.8 20.5h12.4" />
  </Svg>
)

export const IconList = () => (
  <Svg>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" />
  </Svg>
)

export const IconSearch = () => (
  <Svg>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </Svg>
)

export const IconBulb = () => (
  <Svg>
    <path d="M9.5 17.5h5M10.5 20.5h3" />
    <path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.7.5 1 1.2 1 2V17h4.8v-1c0-.8.3-1.5 1-2A5.8 5.8 0 0 0 12 3.5z" />
  </Svg>
)

export const IconBook = () => (
  <Svg>
    <path d="M3 5.5c2.7-1.3 5.7-1.3 9 .8 3.3-2.1 6.3-2.1 9-.8v13c-2.7-1.3-5.7-1.3-9 .8-3.3-2.1-6.3-2.1-9-.8z" />
    <path d="M12 6.3v13" />
  </Svg>
)

export const IconTrend = () => (
  <Svg>
    <path d="M3.5 17 9 11.5l4 4 7.5-7.5" />
    <path d="M15 8h5.5v5.5" />
  </Svg>
)

export const IconCamera = () => (
  <Svg>
    <path d="M4.5 7.5h3l1.8-2.5h5.4l1.8 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
