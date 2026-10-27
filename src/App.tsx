import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { startBackgroundAnalysis, useBackgroundState } from './lib/background'
import { DEMO_GAMES, getGames, mergeGames } from './lib/games'
import { loadBotGame } from './lib/bots'
import { isLiveActive } from './lib/lichessPlay'
import { finishLichessLogin } from './lib/lichessAuth'
import { save } from './lib/storage'
import { LiveLock } from './components/LiveLock'
import { installBackNavigation, onToast, setViewBack, showToast } from './lib/nav'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { onSyncMerged, startAutoSync } from './lib/sync'
import type { GameSummary } from './lib/types'
import { AnalysisView } from './views/Analysis'
import { GamesView } from './views/Games'
import { HomeView } from './views/Home'
import { LearnView } from './views/Learn'
import { PlayView } from './views/Play'
import { ProgressView } from './views/Progress'
import { PuzzlesView } from './views/Puzzles'

// El escáner (con sus plantillas de piezas) solo se descarga al usarlo.
const ScanView = lazy(() => import('./views/Scan').then((m) => ({ default: m.ScanView })))

export type View = 'inicio' | 'jugar' | 'partidas' | 'analisis' | 'problemas' | 'aprender' | 'escanear' | 'progreso'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'jugar', label: 'Jugar', icon: '♟' },
  { id: 'partidas', label: 'Partidas', icon: '☰' },
  { id: 'analisis', label: 'Análisis', icon: '♘' },
  { id: 'problemas', label: 'Problemas', icon: '♛' },
  { id: 'aprender', label: 'Aprender', icon: '♙' },
]

/** Estado de navegación que se recupera al volver atrás. */
interface NavState {
  view: View
  gameId: string | null
  puzzleTheme: string
}

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'inicio', gameId: null, puzzleTheme: 'mix' })
  const { view, gameId, puzzleTheme } = nav
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [games, setGames] = useState<GameSummary[]>(getGames)
  const [toast, setToast] = useState<string | null>(null)
  const [playFrom, setPlayFrom] = useState<string | null>(null)
  const history = useRef<NavState[]>([])
  const navRef = useRef(nav)
  const indicator = useRef<HTMLDivElement>(null)

  /** Cambia de pantalla guardando la actual para poder volver con el gesto atrás. */
  const go = (next: Partial<NavState>) => {
    const cur = navRef.current
    const merged = { ...cur, ...next }
    if (merged.view === cur.view && merged.gameId === cur.gameId && merged.puzzleTheme === cur.puzzleTheme) return
    history.current = [...history.current, cur].slice(-30)
    navRef.current = merged
    setNav(merged)
  }
  const setView = (v: View) => go({ view: v })

  // Gesto y botón atrás: vuelven a la pantalla anterior (las pantallas pueden interceptarlo).
  useEffect(() => {
    setViewBack(() => {
      const prev = history.current.pop()
      if (!prev) return false
      navRef.current = prev
      setNav(prev)
      return true
    })
    onToast((msg) => setToast(msg))
    const remove = installBackNavigation(indicator.current!)
    return () => {
      remove()
      setViewBack(null)
      onToast(null)
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Análisis en segundo plano de las partidas pendientes. Cada partida que termina refresca la vista.
  useEffect(() => {
    startBackgroundAnalysis()
  }, [])
  // Vuelta desde la autorización de Lichess: se guarda el permiso y se abre el juego online.
  useEffect(() => {
    void finishLichessLogin().then((msg) => {
      if (!msg) return
      showToast(msg)
      save('playMode', 'online')
      setView('jugar')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronización automática entre dispositivos (si está configurada).
  useEffect(() => {
    const stop = startAutoSync()
    const off = onSyncMerged(() => {
      setGames(getGames())
      setSettingsState(loadSettings())
    })
    return () => {
      stop()
      off()
    }
  }, [])
  const bg = useBackgroundState()
  useEffect(() => {
    if (!bg.current) setGames(getGames())
  }, [bg.analyzed, bg.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cada pantalla empieza arriba (en el móvil, si no, el tablero puede quedar fuera de la vista).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const allGames = [...games, ...DEMO_GAMES.filter((d) => !games.some((g) => g.id === d.id))]
  const currentGame = allGames.find((g) => g.id === gameId) ?? null

  const setSettings = (s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }
  const addGames = (incoming: GameSummary[]) => setGames(mergeGames(incoming))
  const openGame = (id: string) => go({ view: 'analisis', gameId: id })
  const openPuzzles = (theme: string) => go({ view: 'problemas', puzzleTheme: theme })
  const pendingBotGame = view !== 'jugar' && Boolean(loadBotGame())
  /** Prepara una partida contra un bot desde una posición. */
  const playPosition = (fen: string) => {
    setPlayFrom(fen)
    if (loadBotGame()) showToast('Tienes una partida a medias. La posición queda preparada para cuando la termines.')
    setView('jugar')
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">♞</span>
          <div>
            <strong>Ajedrez App</strong>
            <small>Aprende jugando</small>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${view === n.id || (view === 'escanear' && n.id === 'partidas') || (view === 'progreso' && n.id === 'inicio') ? 'active' : ''}`} onClick={() => setView(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.id === 'jugar' && pendingBotGame && <span className="nav-dot" aria-label="Partida a medias" />}
            </button>
          ))}
        </nav>
        <p className="sidebar-foot">Versión de prueba. Los datos se guardan solo en este navegador.</p>
      </aside>
      <main className="content">
        {view === 'inicio' && (
          <HomeView settings={settings} onSettings={setSettings} games={games} onOpenGame={openGame} onNavigate={setView} onPractice={openPuzzles} />
        )}
        {view === 'jugar' && (
          <PlayView settings={settings} onSaveGame={(g) => addGames([g])} onAnalyze={openGame} startFen={playFrom} onClearStart={() => setPlayFrom(null)} />
        )}
        {view === 'partidas' && (
          <GamesView settings={settings} onSettings={setSettings} games={allGames} onAddGames={addGames} onOpenGame={openGame} onNavigate={setView} />
        )}
        {(view === 'analisis' || view === 'escanear') && isLiveActive() && <LiveLock onGoToGame={() => setView('jugar')} />}
        {view === 'analisis' && !isLiveActive() && (
          <AnalysisView
            key={currentGame?.id ?? 'none'}
            game={currentGame}
            settings={settings}
            onSettings={setSettings}
            onNavigate={setView}
            onPractice={openPuzzles}
            onPlayFrom={playPosition}
          />
        )}
        {view === 'problemas' && <PuzzlesView key={puzzleTheme} initialTheme={puzzleTheme} />}
        {view === 'aprender' && <LearnView onPractice={openPuzzles} onPlayFrom={playPosition} />}
        {view === 'progreso' && <ProgressView games={games} onNavigate={setView} onOpenGame={openGame} onPractice={openPuzzles} />}
        {view === 'escanear' && !isLiveActive() && (
          <Suspense fallback={<p className="muted page">Cargando el escáner…</p>}>
            <ScanView
              onAnalyze={(g) => {
                addGames([g])
                openGame(g.id)
              }}
              onBack={() => setView('partidas')}
              onPlay={playPosition}
            />
          </Suspense>
        )}
      </main>
      <div ref={indicator} className="back-indicator" aria-hidden="true">
        ‹
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
