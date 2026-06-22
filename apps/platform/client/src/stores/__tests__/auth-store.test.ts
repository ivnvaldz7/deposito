import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, type PlatformUser } from '../auth-store'

const mockUser: PlatformUser = {
  sub: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: false,
}

const mockToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.test'

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAuthStore.setState({
      token: null,
      user: null,
      authResolved: false,
    })
  })

  it('starts with no token, no user, authResolved false', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.authResolved).toBe(false)
  })

  it('sets token and user on login', () => {
    useAuthStore.getState().login(mockToken, mockUser)

    const state = useAuthStore.getState()
    expect(state.token).toBe(mockToken)
    expect(state.user).toEqual(mockUser)
    expect(state.authResolved).toBe(true)
  })

  it('clears everything on logout', () => {
    // First login
    useAuthStore.getState().login(mockToken, mockUser)
    // Then logout
    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.authResolved).toBe(true)
  })

  it('updates access token via setAccessToken', () => {
    useAuthStore.getState().login(mockToken, mockUser)

    const newToken = 'new-token-value'
    useAuthStore.getState().setAccessToken(newToken)

    expect(useAuthStore.getState().token).toBe(newToken)
    // user unchanged
    expect(useAuthStore.getState().user).toEqual(mockUser)
  })

  it('only persists user to localStorage (not token)', () => {
    useAuthStore.getState().login(mockToken, mockUser)

    const persistedRaw = localStorage.getItem('platform-auth')
    expect(persistedRaw).not.toBeNull()

    const persisted = JSON.parse(persistedRaw!)
    expect(persisted.state.user).toEqual(mockUser)
    expect(persisted.state.token).toBeUndefined()
  })

  it('does not persist token or authResolved to localStorage', () => {
    useAuthStore.getState().login(mockToken, mockUser)

    const persisted = JSON.parse(localStorage.getItem('platform-auth')!)
    expect(persisted.state.authResolved).toBeUndefined()
    expect(Object.keys(persisted.state)).toEqual(['user'])
  })

  it('initializeAuth is a no-op if already resolved', async () => {
    useAuthStore.setState({ authResolved: true })

    // This should return immediately without throwing
    await expect(useAuthStore.getState().initializeAuth()).resolves.toBeUndefined()
  })

  it('can login, logout, and login again with different user', () => {
    const user1 = { ...mockUser, email: 'one@test.com' }
    const user2 = { ...mockUser, email: 'two@test.com' }
    const token1 = 'token-1'
    const token2 = 'token-2'

    useAuthStore.getState().login(token1, user1)
    expect(useAuthStore.getState().user?.email).toBe('one@test.com')

    useAuthStore.getState().logout()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()

    useAuthStore.getState().login(token2, user2)
    expect(useAuthStore.getState().user?.email).toBe('two@test.com')
    expect(useAuthStore.getState().token).toBe(token2)
  })

  it('setAccessToken with null clears the token', () => {
    useAuthStore.getState().login(mockToken, mockUser)
    expect(useAuthStore.getState().token).toBe(mockToken)

    useAuthStore.getState().setAccessToken(null)
    expect(useAuthStore.getState().token).toBeNull()
    // user still intact
    expect(useAuthStore.getState().user).toEqual(mockUser)
  })
})
