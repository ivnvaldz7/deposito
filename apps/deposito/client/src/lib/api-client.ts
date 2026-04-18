import { useAuthStore, type AuthUser } from '@/stores/auth-store'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function buildApiUrl(path: string): string {
  return `${BASE_URL}/api${path}`
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RefreshResponse {
  token: string
  user: AuthUser
}

let refreshPromise: Promise<string | null> | null = null

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ message: 'Error desconocido' })) as { message?: string }
  return new ApiError(res.status, body.message ?? 'Error del servidor')
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        useAuthStore.getState().logout()
        return null
      }

      const data = (await res.json()) as RefreshResponse
      useAuthStore.getState().login(data.token, data.user)
      return data.token
    } catch {
      useAuthStore.getState().logout()
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function request<T>(
  path: string,
  options: RequestInit,
  token?: string | null,
  attemptRefresh = true
): Promise<T> {
  const activeToken = token ?? useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`
  }

  const res = await fetch(buildApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })

  if (res.status === 401 && attemptRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshedToken = await refreshAccessToken()
    if (refreshedToken) {
      return request<T>(path, options, refreshedToken, false)
    }
  }

  if (!res.ok) {
    throw await parseError(res)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: 'GET' }, token),

  post: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, token),

  put: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, token),

  del: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: 'DELETE' }, token),
}
