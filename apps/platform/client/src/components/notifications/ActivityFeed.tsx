import { useEffect, useRef } from 'react'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useNotificationsSSE } from '@/hooks/use-notifications-sse'
import { FeedToggle } from './FeedToggle'
import { FeedPanel } from './FeedPanel'
import { X } from 'lucide-react'

/**
 * Activity Feed completo: toggle + panel lateral.
 * Se activa el SSE automáticamente al montar.
 */
export function ActivityFeed() {
  const feedOpen = useNotificationsStore((s) => s.feedOpen)
  const toggleFeed = useNotificationsStore((s) => s.toggleFeed)
  const setFeedOpen = useNotificationsStore((s) => s.setFeedOpen)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)

  const panelRef = useRef<HTMLDivElement>(null)

  // Activar SSE
  useNotificationsSSE()

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!feedOpen) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setFeedOpen(false)
      }
    }
    // Delay para evitar que el click que abrió cierre inmediatamente
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('mousedown', handler)
    }
  }, [feedOpen, setFeedOpen])

  return (
    <>
      {/* Toggle button — renderiza donde se use */}
      <FeedToggle unreadCount={unreadCount} onClick={toggleFeed} />

      {/* Sidebar panel lateral derecho */}
      {feedOpen && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setFeedOpen(false)} />

          {/* Panel */}
          <div
            ref={panelRef}
            className="fixed top-0 right-0 h-full w-96 bg-surface border-l border-outline-variant/20 shadow-2xl z-50 flex flex-col animate-slide-in"
          >
            {/* Close button */}
            <div className="absolute top-3 left-3 z-10">
              <button
                type="button"
                onClick={() => setFeedOpen(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <FeedPanel />
          </div>
        </>
      )}
    </>
  )
}
