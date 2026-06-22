import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppState {
  activeModule: string | null
  lastApp: string | null
  setActiveModule: (module: string | null) => void
  setLastApp: (app: string | null) => void
  clearLastApp: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeModule: null,
      lastApp: null,

      setActiveModule: (module) => {
        set({ activeModule: module })
      },

      setLastApp: (app) => {
        set({ lastApp: app })
      },

      clearLastApp: () => {
        set({ lastApp: null })
      },
    }),
    {
      name: 'platform-app',
      version: 1,
      partialize: (state) => ({
        lastApp: state.lastApp,
      }),
    },
  ),
)
