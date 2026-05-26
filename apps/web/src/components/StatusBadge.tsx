import { cn } from '@/lib/utils'

interface StatusConfig {
  dot: string
  text: string
  label?: string
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  uploaded:   { dot: 'bg-blue-500',                  text: 'text-blue-600 dark:text-blue-400' },
  extracting: { dot: 'bg-amber-500 animate-pulse',   text: 'text-amber-600 dark:text-amber-400' },
  extracted:  { dot: 'bg-amber-500',                 text: 'text-amber-600 dark:text-amber-400' },
  scanning:   { dot: 'bg-violet-500 animate-pulse',  text: 'text-violet-600 dark:text-violet-400' },
  scanned:    { dot: 'bg-violet-500',                text: 'text-violet-600 dark:text-violet-400' },
  analyzing:  { dot: 'bg-indigo-500 animate-pulse',  text: 'text-indigo-600 dark:text-indigo-400' },
  analyzed:   { dot: 'bg-indigo-500',                text: 'text-indigo-600 dark:text-indigo-400' },
  simulating: { dot: 'bg-cyan-500 animate-pulse',    text: 'text-cyan-600 dark:text-cyan-400' },
  simulated:  { dot: 'bg-cyan-500',                  text: 'text-cyan-600 dark:text-cyan-400' },
  reporting:  { dot: 'bg-teal-500 animate-pulse',    text: 'text-teal-600 dark:text-teal-400' },
  complete:   { dot: 'bg-success',                   text: 'text-success' },
  failed:     { dot: 'bg-destructive',               text: 'text-destructive' },
  running:    { dot: 'bg-primary animate-pulse',     text: 'text-primary' },
  pending:    { dot: 'bg-muted-foreground',          text: 'text-muted-foreground' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { dot: 'bg-muted-foreground', text: 'text-muted-foreground' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
      <span className={cn('text-xs font-medium tabular', cfg.text)}>{status}</span>
    </span>
  )
}
