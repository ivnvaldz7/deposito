export function LoadingState() {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="font-body text-sm text-on-surface-variant">Cargando...</p>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="font-body text-sm text-error">{message}</p>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 rounded bg-surface-low">
      <p className="font-body text-sm text-on-surface-variant">{message}</p>
    </div>
  )
}
