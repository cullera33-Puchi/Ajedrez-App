import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Elemento <piece> de chessground: sus estilos ponen el dibujo de cada pieza.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      piece: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
