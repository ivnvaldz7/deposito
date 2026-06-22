import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AdminRoute } from '../AdminRoute'

function TestApp({ initialEntries = ['/'] }: { initialEntries?: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/app-selector" element={<div data-testid="selector-page">Selector</div>} />
        <Route
          path="/"
          element={
            <AdminRoute>
              <div data-testid="admin-content">Admin Content</div>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

const mockAdminUser = {
  sub: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: true,
}

const mockRegularUser = {
  sub: 'user-1',
  email: 'user@test.com',
  name: 'User',
  apps: { deposito: { rol: 'observador', activo: true } },
  isPlatformAdmin: false,
}

describe('AdminRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, authResolved: false })
  })

  it('redirects to /login when no token', () => {
    render(<TestApp />)

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
  })

  it('renders children when user is platform admin', () => {
    useAuthStore.setState({ token: 'admin-token', user: mockAdminUser, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
  })

  it('redirects to /app-selector when user is not platform admin', () => {
    useAuthStore.setState({ token: 'user-token', user: mockRegularUser, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('selector-page')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
  })

  it('redirects to /login when token exists but user is null', () => {
    useAuthStore.setState({ token: 'token', user: null, authResolved: true })

    render(<TestApp />)

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })
})
