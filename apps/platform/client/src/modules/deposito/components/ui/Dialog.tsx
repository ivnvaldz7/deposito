import { useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg mx-4 rounded-lg shadow-xl"
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
    <div className={`px-6 py-6 ${className ?? ''}`}>
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="space-y-1 mb-5">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-heading text-lg font-bold text-on-surface">
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

export function DialogClose({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  if (asChild) return <>{children}</>
  return <>{children}</>
}
