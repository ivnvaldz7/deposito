import { useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** Large variant: near-fullscreen desktop modal (e.g. import previews). */
  large?: boolean
}

export function Dialog({ open, onOpenChange, children, large = false }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        data-size={large ? 'large' : 'default'}
        className={large
          ? 'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl shadow-xl md:h-[85vh] md:max-w-[min(90vw,1400px)] md:rounded-xl'
          : 'relative w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-xl shadow-xl md:mx-4 md:rounded-xl'}
        style={{ backgroundColor: 'var(--color-surface)' }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  )
}

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:py-6 ${className ?? ''}`}>
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="space-y-1 mb-5">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-on-surface">
      {children}
    </h2>
  )
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return (
    <p className="font-body text-sm text-on-surface-variant">
      {children}
    </p>
  )
}

export function DialogClose({ children, asChild, onClick }: { children: ReactNode; asChild?: boolean; onClick?: () => void }) {
  if (asChild) return <>{children}</>
  return <button type="button" onClick={onClick}>{children}</button>
}
