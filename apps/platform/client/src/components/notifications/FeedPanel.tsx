import { useState } from 'react'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useNotifications, useMarkAllAsRead } from '@/lib/notifications-api'
import { FeedItem } from './FeedItem'
import type { AppId } from '@platform/core'

type FilterTab = 'all' | AppId

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'deposito', label: 'Depósito' },
  { key: 'ale_bet', label: 'Ale-Bet' },
  { key: 'admin', label: 'Admin' },
]

export function FeedPanel() {
  const [filter, setFilter] = useState<FilterTab>('all')
  const notifications = useNotificationsStore((s) => s.notifications)
  const markAllAsReadLocal = useNotificationsStore((s) => s.markAllAsRead)

  const apiFilter = filter === 'all' ? undefined : { app: filter as AppId }
  const { data, isFetchingNextPage, fetchNextPage, hasNextPage } = useNotifications(apiFilter)
  const { mutate: markAllRemote } = useMarkAllAsRead()

  // Combinar RT + historial
  const rtNotifications = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.app === filter)

  const historyNotifications = data?.pages.flatMap((p) => p.notifications) ?? []

  function handleMarkAllRead() {
    markAllAsReadLocal()
    markAllRemote()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
        <span className="font-heading font-semibold text-on-surface text-sm">
          Actividad
        </span>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Marcar todas
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-outline-variant/10">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`font-body text-xs px-2 py-1 rounded transition-colors ${
              filter === tab.key
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista de RT + historial */}
      <div className="flex-1 overflow-y-auto">
        {/* RT notifications (no duplicadas en historial) */}
        {rtNotifications.map((n) => (
          <FeedItem key={`rt-${n.id}`} notification={n} />
        ))}

        {/* History from API (skip if in RT list) */}
        {historyNotifications
          .filter((h) => !rtNotifications.some((rt) => rt.id === h.id))
          .map((n) => (
            <FeedItem
              key={`hist-${n.id}`}
              notification={{
                id: n.id,
                app: n.app,
                tipo: n.tipo,
                titulo: n.titulo,
                mensaje: n.mensaje,
                leida: n.leida,
                link: n.link,
                timestamp: n.createdAt,
              }}
            />
          ))}

        {/* Infinite scroll trigger */}
        {hasNextPage && (
          <div className="px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="font-body text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {isFetchingNextPage ? 'Cargando...' : 'Ver más'}
            </button>
          </div>
        )}

        {rtNotifications.length === 0 && historyNotifications.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="font-body text-on-surface-variant text-sm">
              Sin actividad reciente
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
