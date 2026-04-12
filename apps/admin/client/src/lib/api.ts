import { getToken, removeToken } from './auth'

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
  createdAt: string
  updatedAt: string
  appAccess: AppAccess[]
}

interface ApiOptions extends RequestInit {
  auth?: boolean
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null

    if (response.status === 401) {
      removeToken()
      window.location.assign('/login')
    }

    throw new Error(data?.error ?? 'Error al procesar la solicitud')
  }

  return (await response.json()) as T
}

export async function apiRequest<T>(
  input: string,
  options: ApiOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.auth !== false) {
    const token = getToken()

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(input, {
    ...options,
    headers,
  })

  return parseResponse<T>(response)
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    nombre: string
  }
}

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(payload),
    }),
}

export const userApi = {
  list: () => apiRequest<PlatformUser[]>('/api/users'),
  create: (payload: {
    email: string
    nombre: string
    password: string
    appAccess: Array<{ app: AppId; rol: string }>
  }) =>
    apiRequest<PlatformUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAccess: (
    userId: string,
    payload: { app: AppId; rol: string; activo: boolean }
  ) =>
    apiRequest<AppAccess>(`/api/users/${userId}/access`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateStatus: (userId: string, payload: { activo: boolean }) =>
    apiRequest<PlatformUser>(`/api/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  seed: () =>
    apiRequest<{
      created: boolean
      user: { id: string; email: string; nombre: string }
    }>('/api/seed', {
      method: 'POST',
      auth: false,
    }),
}
