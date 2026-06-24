import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function buildApiUrl(path: string): string {
  return `${BASE_URL}/api${path}`
}

export interface AppAccess {
  rol: string
  activo: boolean
}

export interface PlatformUser {
  id?: string
  sub: string
  email: string
  name: string
  apps: Record<string, AppAccess>
  isPlatformAdmin: boolean
}

export interface RefreshResponse {
  token: string
  user: PlatformUser
}

export interface AuthState {
  token: string | null
  user: PlatformUser | null
  authResolved: boolean
  login: (token: string, user: PlatformUser) => void
  setAccessToken: (token: string | null) => void
  initializeAuth: () => Promise<void>
  logout: () => void
}

let refreshBootstrapPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authResolved: false,

      login: (token, user) => {
        set({ token, user, authResolved: true })
      },

      setAccessToken: (token) => {
        set({ token })
      },

      initializeAuth: async () => {
        if (get().authResolved) return
        if (refreshBootstrapPromise) return refreshBootstrapPromise

        refreshBootstrapPromise = (async () => {
          try {
            const res = await fetch(buildApiUrl('/auth/refresh'), {
              method: 'POST',
              credentials: 'include',
            })

            if (!res.ok) {
              set({ token: null, user: null, authResolved: true })
              return
            }

            const data = (await res.json()) as RefreshResponse
            set({ token: data.token, user: data.user, authResolved: true })
          } catch {
            set({ token: null, user: null, authResolved: true })
          } finally {
            refreshBootstrapPromise = null
          }
        })()

        return refreshBootstrapPromise
      },

      logout: () => {
        set({ token: null, user: null, authResolved: true })
      },
    }),
    {
      name: 'platform-auth',
      version: 1,
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
)
