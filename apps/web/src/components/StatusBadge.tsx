const STATUS_STYLES: Record<string, string> = {
  uploaded: 'bg-blue-100 text-blue-800',
  extracting: 'bg-yellow-100 text-yellow-800',
  extracted: 'bg-yellow-100 text-yellow-800',
  scanning: 'bg-yellow-100 text-yellow-800',
  scanned: 'bg-indigo-100 text-indigo-800',
  analyzing: 'bg-purple-100 text-purple-800',
  analyzed: 'bg-purple-100 text-purple-800',
  simulating: 'bg-orange-100 text-orange-800',
  simulated: 'bg-orange-100 text-orange-800',
  reporting: 'bg-teal-100 text-teal-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
