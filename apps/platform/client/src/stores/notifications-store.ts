import { create } from 'zustand'
import type { ActivityEvent } from '@platform/core'

export interface NotificationItem {
  id: string
  app: string
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  link: string | null
  timestamp: string
}

interface NotificationsState {
  /** Notificaciones en tiempo real (recibidas por SSE) */
  notifications: NotificationItem[]
  unreadCount: number
  feedOpen: boolean

  addNotification: (event: ActivityEvent) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  toggleFeed: () => void
  setFeedOpen: (open: boolean) => void
}

const MAX_RT_NOTIFICATIONS = 100

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  feedOpen: false,

  addNotification: (event) => {
    const notification: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      app: event.app,
      tipo: event.tipo,
      titulo: event.titulo,
      mensaje: event.mensaje,
      leida: false,
      link: event.link ?? null,
      timestamp: event.timestamp,
    }
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_RT_NOTIFICATIONS),
      unreadCount: state.unreadCount + 1,
    }))
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, leida: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, leida: true })),
      unreadCount: 0,
    }))
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },

  toggleFeed: () => {
    set((state) => ({ feedOpen: !state.feedOpen }))
  },

  setFeedOpen: (open) => {
    set({ feedOpen: open })
  },
}))
