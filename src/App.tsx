import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react'
import { startBackgroundAnalysis, useBackgroundState } from './lib/background'
import { DEMO_GAMES, getGames, mergeGames } from './lib/games'
import { loadBotGame } from './lib/bots'
import { isLiveActive } from './lib/lichessPlay'
import { finishLichessLogin } from './lib/lichessAuth'
import { save } from './lib/storage'
import { LiveLock } from './components/LiveLock'
import { MobileMenu } from './components/MobileMenu'
import { installBackNavigation, onToast, setViewBack, showToast } from './lib/nav'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import { onSyncMerged, startAutoSync } from './lib/sync'
import { refreshTodayPlan } from './lib/training'
import type { GameSummary } from './lib/types'
import { HomeView } from './views/Home'

// Cada pantalla se descarga aparte: la app abre antes. Después de abrir se precargan en segundo
// plano para que cambiar de pestaña sea inmediato. El escáner, con sus plantillas, solo al usarlo.
const VIEWS = {
  play: () => import('./views/Play'),
  games: () => import('./views/Games'),
  analysis: () => import('./views/Analysis'),
  puzzles: () => import('./views/Puzzles'),
  learn: () => import('./views/Learn'),
  progress: () => import('./views/Progress'),
  training: () => import('./views/Training'),
}
const PlayView = lazy(() => VIEWS.play().then((m) => ({ default: m.PlayView })))
const GamesView = lazy(() => VIEWS.games().then((m) => ({ default: m.GamesView })))
const AnalysisView = lazy(() => VIEWS.analysis().then((m) => ({ default: m.AnalysisView })))
const PuzzlesView = lazy(() => VIEWS.puzzles().then((m) => ({ default: m.PuzzlesView })))
const LearnView = lazy(() => VIEWS.learn().then((m) => ({ default: m.LearnView })))
const ProgressView = lazy(() => VIEWS.progress().then((m) => ({ default: m.ProgressView })))
const TrainingView = lazy(() => VIEWS.training().then((m) => ({ default: m.TrainingView })))
const ScanView = lazy(() => import('./views/Scan').then((m) => ({ default: m.ScanView })))

export type View = 'inicio' | 'entreno' | 'jugar' | 'partidas' | 'analisis' | 'problemas' | 'aprender' | 'escanear' | 'progreso'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'entreno', label: 'Entrenar', icon: '★' },
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
  /** En Entrenar: repaso guiado de la partida `gameId` en lugar de la sesión del día. */
  review: boolean
  /** En Aprender: lección o apertura que se abre directamente (desde el entrenamiento). */
  learnTarget: { kind: 'lesson' | 'opening'; id: string } | null
}

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'inicio', gameId: null, puzzleTheme: 'mix', review: false, learnTarget: null })
  const { view, gameId, puzzleTheme, review, learnTarget } = nav
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [games, setGames] = useState<GameSummary[]>(getGames)
  const [toast, setToast] = useState<string | null>(null)
  const [playFrom, setPlayFrom] = useState<string | null>(null)
  const [, refresh] = useReducer((x: number) => x + 1, 0)
  const history = useRef<NavState[]>([])
  const navRef = useRef(nav)

  /** Cambia de pantalla guardando la actual para poder volver con el gesto atrás. */
  const go = (next: Partial<NavState>) => {
    const cur = navRef.current
    const merged = { ...cur, ...next }
    if (JSON.stringify(merged) === JSON.stringify(cur)) return
    history.current = [...history.current, cur].slice(-30)
    navRef.current = merged
    setNav(merged)
  }
  const setView = (v: View) => go({ view: v, review: false, learnTarget: null })
  /** Vuelve a la pantalla anterior si es `v` (sin añadir otra entrada al historial); si no, va a ella. */
  const returnTo = (v: View) => {
    const prev = history.current[history.current.length - 1]
    if (prev?.view !== v) return setView(v)
    history.current.pop()
    navRef.current = prev
    setNav(prev)
  }

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
    const remove = installBackNavigation()
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
  // Precarga de las demás pantallas cuando el navegador esté libre.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
    idle(() => Object.values(VIEWS).forEach((load) => void load().catch(() => undefined)))
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
    // Tras recibir datos de otro dispositivo (importBackup ya ha recargado la memoria) se refresca la vista.
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
  // Al cambiar de pantalla, el entrenamiento de hoy recoge lo hecho fuera de él (apertura, lección).
  useEffect(() => {
    window.scrollTo(0, 0)
    refreshTodayPlan()
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
  const openReview = (id: string) => go({ view: 'entreno', gameId: id, review: true, learnTarget: null })
  const openLearn = (kind: 'lesson' | 'opening', id: string) => go({ view: 'aprender', review: false, learnTarget: { kind, id } })
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
      <MobileMenu
        items={NAV.map((n) => ({ ...n, dot: n.id === 'jugar' && pendingBotGame }))}
        extra={[
          { id: 'progreso', label: 'Tu progreso', icon: '📈' },
          { id: 'escanear', label: 'Escanear posición', icon: '📷' },
        ]}
        isActive={(id) => view === id}
        onSelect={setView}
      />
      <main className="content">
        <Suspense fallback={<p className="muted page">Cargando…</p>}>
        {view === 'inicio' && (
          <HomeView settings={settings} onSettings={setSettings} games={games} onOpenGame={openGame} onNavigate={setView} onPractice={openPuzzles} />
        )}
        {view === 'jugar' && (
          <PlayView settings={settings} onSaveGame={(g) => addGames([g])} onAnalyze={openGame} startFen={playFrom} onClearStart={() => setPlayFrom(null)} />
        )}
        {view === 'partidas' && (
          <GamesView settings={settings} onSettings={setSettings} games={allGames} onAddGames={addGames} onOpenGame={openGame} onNavigate={setView} />
        )}
        {(view === 'analisis' || view === 'escanear') && isLiveActive() && <LiveLock onGoToGame={() => setView('jugar')} onUnlock={refresh} />}
        {view === 'analisis' && !isLiveActive() && (
          <AnalysisView
            key={currentGame?.id ?? 'none'}
            game={currentGame}
            settings={settings}
            onSettings={setSettings}
            onNavigate={setView}
            onPractice={openPuzzles}
            onPlayFrom={playPosition}
            onGuidedReview={openReview}
          />
        )}
        {view === 'entreno' && (
          <TrainingView
            key={review ? `repaso-${gameId}` : 'sesion'}
            games={games}
            reviewGameId={review ? gameId : null}
            onOpenGame={openGame}
            onOpenLesson={(id) => openLearn('lesson', id)}
            onOpenOpening={(id) => openLearn('opening', id)}
            onStartSession={() => setView('entreno')}
          />
        )}
        {view === 'problemas' && <PuzzlesView key={puzzleTheme} initialTheme={puzzleTheme} />}
        {view === 'aprender' && (
          <LearnView
            key={learnTarget ? `${learnTarget.kind}-${learnTarget.id}` : 'aprender'}
            onPractice={openPuzzles}
            onPlayFrom={playPosition}
            target={learnTarget}
            onReturn={() => returnTo('entreno')}
          />
        )}
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
        </Suspense>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
