import { lazy, Suspense, useEffect, useState } from 'react'
import { startBackgroundAnalysis, useBackgroundState } from './lib/background'
import { DEMO_GAMES, getGames, mergeGames } from './lib/games'
import { loadSettings, saveSettings, type Settings } from './lib/settings'
import type { GameSummary } from './lib/types'
import { AnalysisView } from './views/Analysis'
import { GamesView } from './views/Games'
import { HomeView } from './views/Home'
import { LearnView } from './views/Learn'
import { PlayView } from './views/Play'
import { PuzzlesView } from './views/Puzzles'

// El escáner (con sus plantillas de piezas) solo se descarga al usarlo.
const ScanView = lazy(() => import('./views/Scan').then((m) => ({ default: m.ScanView })))

export type View = 'inicio' | 'jugar' | 'partidas' | 'analisis' | 'problemas' | 'aprender' | 'escanear'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'jugar', label: 'Jugar', icon: '♟' },
  { id: 'partidas', label: 'Partidas', icon: '☰' },
  { id: 'analisis', label: 'Análisis', icon: '♘' },
  { id: 'problemas', label: 'Problemas', icon: '♛' },
  { id: 'aprender', label: 'Aprender', icon: '♙' },
]

export default function App() {
  const [view, setView] = useState<View>('inicio')
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [games, setGames] = useState<GameSummary[]>(getGames)
  const [gameId, setGameId] = useState<string | null>(null)
  const [puzzleTheme, setPuzzleTheme] = useState('mix')

  // Análisis en segundo plano de las partidas pendientes. Cada partida que termina refresca la vista.
  useEffect(() => {
    startBackgroundAnalysis()
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
  const openGame = (id: string) => {
    setGameId(id)
    setView('analisis')
  }
  const openPuzzles = (theme: string) => {
    setPuzzleTheme(theme)
    setView('problemas')
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
            <button key={n.id} className={`nav-item ${view === n.id || (view === 'escanear' && n.id === 'partidas') ? 'active' : ''}`} onClick={() => setView(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <p className="sidebar-foot">Versión de prueba. Los datos se guardan solo en este navegador.</p>
      </aside>
      <main className="content">
        {view === 'inicio' && (
          <HomeView settings={settings} onSettings={setSettings} games={games} onOpenGame={openGame} onNavigate={setView} onPractice={openPuzzles} />
        )}
        {view === 'jugar' && <PlayView settings={settings} onSaveGame={(g) => addGames([g])} onAnalyze={openGame} />}
        {view === 'partidas' && (
          <GamesView settings={settings} onSettings={setSettings} games={allGames} onAddGames={addGames} onOpenGame={openGame} onNavigate={setView} />
        )}
        {view === 'analisis' && (
          <AnalysisView
            key={currentGame?.id ?? 'none'}
            game={currentGame}
            settings={settings}
            onSettings={setSettings}
            onNavigate={setView}
            onPractice={openPuzzles}
          />
        )}
        {view === 'problemas' && <PuzzlesView key={puzzleTheme} initialTheme={puzzleTheme} />}
        {view === 'aprender' && <LearnView onPractice={openPuzzles} />}
        {view === 'escanear' && (
          <Suspense fallback={<p className="muted page">Cargando el escáner…</p>}>
            <ScanView
              onAnalyze={(g) => {
                addGames([g])
                openGame(g.id)
              }}
              onBack={() => setView('partidas')}
            />
          </Suspense>
        )}
      </main>
    </div>
  )
}
