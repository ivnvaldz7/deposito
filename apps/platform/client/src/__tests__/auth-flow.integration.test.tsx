import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { AppRouter } from '@/router'

// Mock fetch globally for integration tests
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response
}

const singleAppUser = {
  sub: 'u1',
  email: 'a@b.com',
  name: 'Test',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: false,
}

const multiAppUser = {
  sub: 'u2',
  email: 'multi@test.com',
  name: 'Multi',
  apps: {
    deposito: { rol: 'encargado', activo: true },
    'ale-bet': { rol: 'observador', activo: true },
  },
  isPlatformAdmin: false,
}

describe('Auth Flow Integration', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    useAuthStore.setState({ token: null, user: null, authResolved: false })
    useAppStore.setState({ activeModule: null, lastApp: null })
    localStorage.removeItem('platform-auth')
    localStorage.removeItem('platform-app')
  })

  it('renders login page from /login with Google button', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciá sesión/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('callback handler with valid token calls /me and redirects single-app user to their app', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(singleAppUser))

    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=valid123']}>
        <AppRouter />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('a@b.com')
    })

    expect(useAuthStore.getState().token).toBe('valid123')
    // User should have deposito active — redirect goes to /deposito
    expect(screen.getByText(/módulo depósito/i)).toBeInTheDocument()
  })

  it('callback handler with valid token — multi-app user without lastApp — shows selector', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(multiAppUser))

    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=multi123']}>
        <AppRouter />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('multi@test.com')
    })

    // Multi-app user with no lastApp → should show selector
    await waitFor(() => {
      expect(screen.getByText(/seleccioná una aplicación/i)).toBeInTheDocument()
    })
  })

  it('callback handler with valid token — multi-app user with valid lastApp — direct redirect', async () => {
    mockFetch.mockResolvedValue(createJsonResponse(multiAppUser))
    useAppStore.setState({ lastApp: 'deposito' })

    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=multi123']}>
        <AppRouter />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('multi@test.com')
    })

    // Has lastApp=deposito and deposito is in user's apps → direct redirect
    await waitFor(() => {
      expect(screen.getByText(/módulo depósito/i)).toBeInTheDocument()
    })
  })

  it('unauthenticated user trying to access /deposito/* gets redirected to login', () => {
    render(
      <MemoryRouter initialEntries={['/deposito/dashboard']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciá sesión/i)).toBeInTheDocument()
  })

  it('authenticated user without deposito access gets redirected to app-selector', async () => {
    const user = {
      ...singleAppUser,
      apps: { 'ale-bet': { rol: 'encargado', activo: true } },
    }
    useAuthStore.setState({ token: 't', user, authResolved: true })

    render(
      <MemoryRouter initialEntries={['/deposito']}>
        <AppRouter />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/seleccioná una aplicación/i)).toBeInTheDocument()
    })
  })

  it('authenticated user with correct app access sees the app content', () => {
    useAuthStore.setState({ token: 't', user: singleAppUser, authResolved: true })

    render(
      <MemoryRouter initialEntries={['/deposito']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/módulo depósito/i)).toBeInTheDocument()
  })

  it('single-app user at root / gets auto-redirected to their app', () => {
    useAuthStore.setState({ token: 't', user: singleAppUser, authResolved: true })

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/módulo depósito/i)).toBeInTheDocument()
  })

  it('redirects unauthenticated user from root to login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciá sesión/i)).toBeInTheDocument()
  })
})
