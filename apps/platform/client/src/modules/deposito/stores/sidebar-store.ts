import { create } from 'zustand'

interface SidebarState {
  collapsed: boolean
}

export const useSidebarStore = create<SidebarState>()(() => ({
  collapsed: true,
}))
