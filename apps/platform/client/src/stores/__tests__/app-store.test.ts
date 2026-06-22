import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../app-store'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeModule: null,
      lastApp: null,
    })
    localStorage.removeItem('platform-app')
  })

  it('starts with no active module and no lastApp', () => {
    const state = useAppStore.getState()
    expect(state.activeModule).toBeNull()
    expect(state.lastApp).toBeNull()
  })

  it('sets active module', () => {
    useAppStore.getState().setActiveModule('deposito')

    expect(useAppStore.getState().activeModule).toBe('deposito')
  })

  it('updates active module on subsequent calls', () => {
    useAppStore.getState().setActiveModule('deposito')
    useAppStore.getState().setActiveModule('ale-bet')

    expect(useAppStore.getState().activeModule).toBe('ale-bet')
  })

  it('sets lastApp', () => {
    useAppStore.getState().setLastApp('deposito')

    expect(useAppStore.getState().lastApp).toBe('deposito')
  })

  it('persists lastApp to localStorage (not activeModule)', () => {
    useAppStore.getState().setActiveModule('deposito')
    useAppStore.getState().setLastApp('ale-bet')

    const persisted = JSON.parse(localStorage.getItem('platform-app')!)
    expect(persisted.state.lastApp).toBe('ale-bet')
    expect(persisted.state.activeModule).toBeUndefined()
  })

  it('clears lastApp on logout call', () => {
    useAppStore.getState().setLastApp('deposito')
    expect(useAppStore.getState().lastApp).toBe('deposito')

    useAppStore.getState().clearLastApp()
    expect(useAppStore.getState().lastApp).toBeNull()
  })
})
