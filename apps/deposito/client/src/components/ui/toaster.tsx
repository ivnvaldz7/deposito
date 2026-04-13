import { Toaster } from 'sonner'

export function AppToaster() {
  return (
    <Toaster
      theme="system"
      position="top-right"
      closeButton
      visibleToasts={5}
      toastOptions={{
        duration: 3600,
        style: {
          background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
          color: 'var(--color-text-2)',
          border: '1px solid var(--color-border)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 0 24px 0 rgba(0, 0, 0, 0.15)',
          borderRadius: '0.25rem',
          padding: '0.875rem 1rem',
        },
        classNames: {
          toast: 'font-body',
          title: 'font-heading text-sm font-semibold text-on-surface',
          description: 'font-body text-xs text-on-surface-variant',
          closeButton: '!bg-transparent !text-on-surface-variant hover:!text-on-surface !border-0',
          actionButton: '!bg-surface-high !text-on-surface !rounded',
          cancelButton: '!bg-surface-high !text-on-surface-variant !rounded',
        },
      }}
    />
  )
}
