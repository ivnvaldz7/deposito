import { create } from 'zustand'

export interface Notification {
  id: string
  tipo: string
  mensaje: string
  datos?: Record<string, unknown>
  timestamp: string
  leida: boolean
}

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  addNotification: (event: Omit<Notification, 'id' | 'leida'>) => void
  markAllAsRead: () => void
}

const MAX_NOTIFICATIONS = 50

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (event) => {
    const notification: Notification = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      leida: false,
    }
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
      unreadCount: state.unreadCount + 1,
    }))
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, leida: true })),
      unreadCount: 0,
    }))
  },
}))
