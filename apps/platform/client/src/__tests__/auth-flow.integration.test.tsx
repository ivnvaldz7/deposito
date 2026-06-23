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
    // Mock initial /me call
    mockFetch.mockResolvedValueOnce(createJsonResponse(singleAppUser))
    // Mock subsequent API calls from DashboardPage (acta stats, movimientos, etc.)
    mockFetch.mockResolvedValue(createJsonResponse([]))

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
    // Sidebar logo with "depósito" confirms the module rendered
    await waitFor(() => {
      expect(screen.getByText('depósito')).toBeInTheDocument()
    })
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
    // Mock initial /me call
    mockFetch.mockResolvedValueOnce(createJsonResponse(multiAppUser))
    // Mock subsequent API calls from DashboardPage
    mockFetch.mockResolvedValue(createJsonResponse([]))
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
    // Sidebar logo with "depósito" confirms the module rendered
    await waitFor(() => {
      expect(screen.getByText('depósito')).toBeInTheDocument()
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
    // Mock API calls from DashboardPage
    mockFetch.mockResolvedValue(createJsonResponse([]))

    render(
      <MemoryRouter initialEntries={['/deposito']}>
        <AppRouter />
      </MemoryRouter>,
    )

    // Sidebar logo confirms the module rendered
    expect(screen.getByText('depósito')).toBeInTheDocument()
  })

  it('single-app user at root / gets auto-redirected to their app', () => {
    useAuthStore.setState({ token: 't', user: singleAppUser, authResolved: true })
    // Mock API calls from DashboardPage
    mockFetch.mockResolvedValue(createJsonResponse([]))

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>,
    )

    // Sidebar logo confirms redirect to /deposito
    expect(screen.getByText('depósito')).toBeInTheDocument()
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
