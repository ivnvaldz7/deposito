import { Toaster as SonnerToaster } from 'sonner'

export function AppToaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        className: 'font-body text-sm',
        style: {
          background: 'var(--color-surface-low)',
          color: 'var(--color-on-surface)',
          borderRadius: '0.5rem',
        },
      }}
    />
  )
}
