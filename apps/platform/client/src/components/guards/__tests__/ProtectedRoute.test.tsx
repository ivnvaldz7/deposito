import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { ProtectedRoute } from '../ProtectedRoute'

function TestApp({ initialEntries = ['/'] }: { initialEntries?: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/app-selector" element={<div data-testid="selector-page">Selector</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute app="deposito">
              <div data-testid="protected-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

const mockUser = {
  sub: 'u1',
  email: 'a@b.com',
  name: 'Test',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: false,
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, authResolved: false })
  })

  it('redirects to /login when no token', () => {
    render(<TestApp />)

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders children when token exists and app is active', () => {
    useAuthStore.setState({ token: 'valid', user: mockUser, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('redirects to /app-selector when app is not in user apps', () => {
    const userNoDeposito = {
      ...mockUser,
      apps: { 'ale-bet': { rol: 'encargado', activo: true } },
    }
    useAuthStore.setState({ token: 'valid', user: userNoDeposito, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('selector-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('redirects to /app-selector when app exists but is not active', () => {
    const userInactive = {
      ...mockUser,
      apps: { deposito: { rol: 'encargado', activo: false } },
    }
    useAuthStore.setState({ token: 'valid', user: userInactive, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('selector-page')).toBeInTheDocument()
  })

  it('redirects to /login when token exists but no user (should not happen)', () => {
    useAuthStore.setState({ token: 'valid', user: null, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders children when no app restriction is set', () => {
    useAuthStore.setState({ token: 'valid', user: mockUser, authResolved: true })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="no-app-content">No App Restriction</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('no-app-content')).toBeInTheDocument()
  })
})
