import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadGame } from '../lib/api'
import { Upload, FileArchive, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UploadPage() {
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function handleFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      setError('Only .zip files are accepted')
      return
    }
    setError(null)
    setProgress(0)
    try {
      const { gameId } = await uploadGame(file, setProgress)
      navigate(`/games/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setProgress(null)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const isUploading = progress !== null

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md space-y-6">
        {/* Title block */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Verify Game RTP</h1>
          <p className="text-sm text-muted-foreground">
            Upload a game source ZIP to extract, analyze, and simulate RTP.
          </p>
        </div>

        {/* Drop zone */}
        <div
          className={cn(
            'relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 group',
            dragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-border hover:border-primary/50 hover:bg-accent/30',
            isUploading && 'pointer-events-none opacity-70'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={onInputChange} />

          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl border border-border flex items-center justify-center transition-all duration-200',
              dragging ? 'border-primary bg-primary/10' : 'bg-muted group-hover:bg-accent'
            )}>
              {isUploading
                ? <FileArchive className="w-5 h-5 text-primary animate-pulse" />
                : <Upload className={cn('w-5 h-5 transition-colors', dragging ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              }
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isUploading ? `Uploading… ${progress}%` : 'Drop your ZIP here'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isUploading ? 'Processing game source files' : 'or click to browse — .zip files only'}
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {isUploading && (
          <div className="space-y-1.5">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right tabular">{progress}%</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Footer hint */}
        {!isUploading && !error && (
          <p className="text-center text-xs text-muted-foreground/60">
            Supports Go, Java, C source with embedded paytables
          </p>
        )}
      </div>
    </div>
  )
}
