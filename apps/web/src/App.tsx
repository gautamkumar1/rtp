function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">
          RTP Verification Platform
        </h1>
      </header>
      <main className="px-6 py-8">
        <p className="text-muted-foreground">
          Upload slot game source ZIPs to verify RTP.
        </p>
      </main>
    </div>
  )
}

export default App
