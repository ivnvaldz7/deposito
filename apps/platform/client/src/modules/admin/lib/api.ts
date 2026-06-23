import { apiClient } from '@/lib/api-client'

export type AppId = 'deposito' | 'ale_bet'

export interface AppAccess {
  id: string
  userId: string
  app: AppId
  rol: string
  activo: boolean
  createdAt: string
}

export interface PlatformUser {
  id: string
  email: string
  nombre: string
  activo: boolean
  estado: string
  isPlatformAdmin: boolean
  createdAt: string
  updatedAt: string
  appAccess: AppAccess[]
}

export const adminApi = {
  list: () => apiClient.get<PlatformUser[]>('/admin/'),

  create: (payload: {
    email: string
    nombre: string
    password: string
    appAccess: Array<{ app: AppId; rol: string }>
  }) => apiClient.post<PlatformUser>('/admin/', payload),

  updateAccess: (
    userId: string,
    payload: { app: AppId; rol: string; activo: boolean },
  ) => apiClient.put<AppAccess>(`/admin/${userId}/access`, payload),

  updateStatus: (userId: string, payload: { activo: boolean }) =>
    apiClient.put<PlatformUser>(`/admin/${userId}/status`, payload),
}
