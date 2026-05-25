import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { UploadPage } from './pages/UploadPage'
import { GameStatusPage } from './pages/GameStatusPage'
import { CandidatesPage } from './pages/CandidatesPage'
import { SchemaPage } from './pages/SchemaPage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">
            RTP Verification Platform
          </h1>
        </header>
        <main className="px-6 py-8">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/games/:gameId" element={<GameStatusPage />} />
            <Route path="/games/:gameId/candidates" element={<CandidatesPage />} />
            <Route path="/games/:gameId/schema" element={<SchemaPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
