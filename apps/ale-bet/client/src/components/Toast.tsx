import { useEffect } from 'react'

export interface ToastProps {
  message: string
  type: 'info' | 'success'
  onClose: () => void
}

function ensureToastAnimation(): void {
  if (document.getElementById('ale-bet-toast-animation')) {
    return
  }

  const style = document.createElement('style')
  style.id = 'ale-bet-toast-animation'
  style.textContent = `
    @keyframes aleBetToastSlideIn {
      from {
        opacity: 0;
        transform: translate3d(0, -12px, 0);
      }
      to {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }
    }
  `

  document.head.appendChild(style)
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    ensureToastAnimation()

    const timeoutId = window.setTimeout(() => {
      onClose()
    }, 5_000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [onClose])

  const accentColor = type === 'success' ? '#7ff6a1' : 'var(--color-accent)'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--color-surface)',
        border: `1px solid ${accentColor}`,
        borderRadius: '8px',
        padding: '12px 16px',
        color: 'var(--color-text)',
        fontSize: '13px',
        zIndex: 9999,
        animation: 'aleBetToastSlideIn 300ms ease-out',
        maxWidth: '320px',
        boxShadow: '0 16px 28px rgba(0, 0, 0, 0.25)',
      }}
    >
      {message}
    </div>
  )
}
