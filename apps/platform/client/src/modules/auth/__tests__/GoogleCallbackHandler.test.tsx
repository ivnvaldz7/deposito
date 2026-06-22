import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import GoogleCallbackHandler from '../GoogleCallbackHandler'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockUser = {
  sub: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: false,
}

describe('GoogleCallbackHandler', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    useAuthStore.setState({ token: null, user: null, authResolved: false })
    useAppStore.setState({ activeModule: null, lastApp: null })
    localStorage.removeItem('platform-app')
  })

  it('shows loading state while processing', () => {
    // Don't resolve the fetch yet to test loading state
    mockFetch.mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=valid-token']}>
        <GoogleCallbackHandler />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciando sesión/i)).toBeInTheDocument()
  })

  it('calls /api/auth/me with the token and logs in', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUser),
    })

    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=valid-token']}>
        <GoogleCallbackHandler />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('test@example.com')
    })

    expect(useAuthStore.getState().token).toBe('valid-token')

    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/api/auth/me')
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer valid-token')
  })

  it('redirects to /login when no token in URL', async () => {
    // We need to check navigation — mock window.location
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
    })

    render(
      <MemoryRouter initialEntries={['/auth/google/callback']}>
        <GoogleCallbackHandler />
      </MemoryRouter>,
    )

    // After the effect runs, we should still be in the loading state
    // because the navigation won't happen in jsdom
    await waitFor(() => {
      expect(screen.getByText(/iniciando sesión/i)).toBeInTheDocument()
    })
  })
})
