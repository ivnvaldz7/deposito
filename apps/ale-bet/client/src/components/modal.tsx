import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6">
      <div className="w-full max-w-2xl rounded-3xl border border-white/8 bg-[var(--surface-low)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
          <h2 className="font-[Montserrat] text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/8 px-3 py-1 text-sm text-[var(--on-surface-variant)] transition hover:border-white/16 hover:text-[var(--on-surface)]"
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
