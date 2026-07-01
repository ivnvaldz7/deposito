import { Bell } from 'lucide-react'

interface FeedToggleProps {
  unreadCount: number
  onClick: () => void
}

export function FeedToggle({ unreadCount, onClick }: FeedToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Notificaciones"
      title="Notificaciones"
      className="relative text-on-surface-variant hover:text-on-surface transition-colors"
    >
      <Bell size={16} strokeWidth={1.5} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full font-body text-white font-medium"
          style={{
            fontSize: '0.55rem',
            width: '14px',
            height: '14px',
            backgroundColor: 'var(--color-danger)',
            lineHeight: 1,
          }}
          aria-label={`${unreadCount} notificaciones sin leer`}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
