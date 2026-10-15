export function LoadingState() {
  return (
    <div role="status" className="grid h-48 place-items-center" aria-live="polite">
      <div className="w-full max-w-md space-y-3 px-4" aria-hidden="true">
        <div className="loading-shimmer h-3 w-2/5 rounded-full" />
        <div className="loading-shimmer h-14 rounded-xl" />
        <div className="loading-shimmer h-14 rounded-xl" />
      </div>
      <p className="sr-only">Cargando...</p>
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
    <div className="flex h-48 items-center justify-center rounded bg-surface-low animate-reveal">
      <p className="font-body text-sm text-on-surface-variant">{message}</p>
    </div>
  )
}
