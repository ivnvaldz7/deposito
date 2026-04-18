import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function buildApiUrl(path: string): string {
  return `${BASE_URL}/api${path}`
}

export interface AuthUser {
  id?: string
  email: string
  name: string
  role: 'encargado' | 'observador' | 'solicitante'
}

interface RefreshResponse {
  token: string
  user: AuthUser
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  authResolved: boolean
  login: (token: string, user: AuthUser) => void
  setAccessToken: (token: string | null) => void
  setUser: (user: AuthUser | null) => void
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
      login: (token, user) => set({ token, user, authResolved: true }),
      setAccessToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
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
      logout: () => set({ token: null, user: null, authResolved: true }),
    }),
    {
      name: 'deposito-auth',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as { user?: AuthUser | null } | undefined
        return {
          token: null,
          user: state?.user
            ? {
                email: state.user.email,
                name: state.user.name,
                role: state.user.role,
              }
            : null,
          authResolved: false,
        }
      },
      partialize: (state) => ({
        user: state.user
          ? {
              email: state.user.email,
              name: state.user.name,
              role: state.user.role,
            }
          : null,
      }),
    },
  ),
)
