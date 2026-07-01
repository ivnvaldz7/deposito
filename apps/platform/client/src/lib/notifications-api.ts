import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './api-client'
import type { AppId } from '@platform/core'

const API_BASE = '/notifications'

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface NotificationRow {
  id: string
  userId: string
  app: AppId
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  link: string | null
  createdAt: string
}

interface PaginatedResponse {
  notifications: NotificationRow[]
  total: number
  page: number
  limit: number
}

// ─── Keys ─────────────────────────────────────────────────────────────────────
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filters?: Record<string, unknown>) => ['notifications', 'list', filters] as const,
}

// ─── GET /api/notifications (paginado infinito) ───────────────────────────────
export function useNotifications(filters?: { app?: AppId; leida?: boolean; tipo?: string }) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: '20' })
      if (filters?.app) params.set('app', filters.app)
      if (filters?.leida !== undefined) params.set('leida', String(filters.leida))
      if (filters?.tipo) params.set('tipo', filters.tipo)

      return apiClient.get<PaginatedResponse>(`${API_BASE}?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < Math.ceil(last.total / last.limit) ? last.page + 1 : undefined,
  })
}

// ─── PATCH /api/notifications/:id/read ────────────────────────────────────────
export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`${API_BASE}/${id}/read`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      // Optimistic update: marco como leída en TODAS las páginas cacheadas
      queryClient.setQueriesData<{ pages: PaginatedResponse[] }>(
        { queryKey: notificationKeys.all },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              notifications: page.notifications.map((n) =>
                n.id === id ? { ...n, leida: true } : n
              ),
            })),
          }
        }
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

// ─── POST /api/notifications/read-all ─────────────────────────────────────────
export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.post(`${API_BASE}/read-all`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all })

      queryClient.setQueriesData<{ pages: PaginatedResponse[] }>(
        { queryKey: notificationKeys.all },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              notifications: page.notifications.map((n) => ({ ...n, leida: true })),
            })),
          }
        }
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
