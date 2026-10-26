import { ResourceLinks } from '../components/ResourceLinks'

interface Props {
  onPractice: (theme: string) => void
}

const PIECES = [
  { icon: '♙', name: 'Peón', value: '1' },
  { icon: '♘', name: 'Caballo', value: '3' },
  { icon: '♗', name: 'Alfil', value: '3' },
  { icon: '♖', name: 'Torre', value: '5' },
  { icon: '♕', name: 'Dama', value: '9' },
  { icon: '♔', name: 'Rey', value: 'Sin precio' },
]

const OPENING_RULES = [
  { title: 'Controla el centro', text: 'Empieza con los peones de rey o de dama (e4, d4, e5, d5). Las piezas en el centro tienen más casillas.' },
  { title: 'Desarrolla las piezas menores', text: 'Saca caballos y alfiles antes que la dama y las torres. Intenta no mover dos veces la misma pieza en la apertura.' },
  { title: 'Enroca pronto', text: 'Pon el rey a salvo y conecta las torres. Suele ser buena idea enrocar antes de la jugada 10.' },
  { title: 'No saques la dama demasiado pronto', text: 'El rival la ataca con piezas menores y gana tiempo para desarrollarse.' },
  { title: 'Cuida el punto f7 o f2', text: 'Al principio solo lo defiende el rey. Muchas trampas de apertura van contra esa casilla.' },
]

const MODULES = [
  { title: 'Mates básicos', text: 'Mate del pasillo, mate de la coz y mates con dama.', theme: 'mateIn1' },
  { title: 'Piezas colgadas', text: 'Aprende a ver las piezas que el rival deja sin defender.', theme: 'hangingPiece' },
  { title: 'Dobles ataques', text: 'Una pieza que ataca dos objetivos a la vez. El caballo es el especialista.', theme: 'fork' },
  { title: 'Clavadas', text: 'Una pieza que no puede moverse sin dejar expuesta otra más valiosa.', theme: 'pin' },
]

export function LearnView({ onPractice }: Props) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Aprender</h1>
        <p className="muted">Lo básico para subir de 500 a 1000. Las lecciones interactivas llegarán en las próximas versiones.</p>
      </header>

      <div className="grid-2">
        <section className="card">
          <h2>Valor de las piezas</h2>
          <p className="muted">Sirve para decidir si un cambio te conviene. Antes de capturar, suma lo que ganas y lo que pierdes.</p>
          <div className="pieces">
            {PIECES.map((p) => (
              <div key={p.name} className="piece">
                <span className="piece-icon">{p.icon}</span>
                <span>{p.name}</span>
                <strong>{p.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Principios de apertura</h2>
          <ol className="rules">
            {OPENING_RULES.map((r) => (
              <li key={r.title}>
                <strong>{r.title}.</strong> {r.text}
              </li>
            ))}
          </ol>
        </section>

        <section className="card span-2">
          <h2>Practica por temas</h2>
          <div className="modules">
            {MODULES.map((m) => (
              <div key={m.title} className="module">
                <h3>{m.title}</h3>
                <p className="muted">{m.text}</p>
                <button className="btn" onClick={() => onPractice(m.theme)}>
                  Practicar
                </button>
                <ResourceLinks theme={m.theme} title={false} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
