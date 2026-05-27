import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UploadPage } from './pages/UploadPage'
import { GameStatusPage } from './pages/GameStatusPage'
import { CandidatesPage } from './pages/CandidatesPage'
import { SchemaPage } from './pages/SchemaPage'
import { SimulationPage } from './pages/SimulationPage'
import { RtpAnalysisPage } from './pages/RtpAnalysisPage'
import { useTheme } from './components/theme-provider'
import { Moon, Sun, Upload, Activity } from 'lucide-react'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}

function Header() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <Activity className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">RTP Verify</span>
          </div>
          {!isHome && (
            <>
              <span className="text-border">/</span>
              <NavLink
                to="/"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Upload className="w-3 h-3" />
                Upload
              </NavLink>
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/games/:gameId" element={<GameStatusPage />} />
          <Route path="/games/:gameId/candidates" element={<CandidatesPage />} />
          <Route path="/games/:gameId/schema" element={<SchemaPage />} />
          <Route path="/games/:gameId/simulation" element={<SimulationPage />} />
          <Route path="/games/:gameId/ai-simulation" element={<RtpAnalysisPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </BrowserRouter>
  )
}

export default App
