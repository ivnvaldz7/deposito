import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { AppRouter } from '@/router'

const singleAppUser = {
  sub: 'u1',
  email: 'single@test.com',
  name: 'Single App',
  apps: { deposito: { rol: 'encargado', activo: true } },
  isPlatformAdmin: false,
}

const multiAppUser = {
  sub: 'u2',
  email: 'multi@test.com',
  name: 'Multi App',
  apps: {
    deposito: { rol: 'encargado', activo: true },
    'ale-bet': { rol: 'observador', activo: true },
  },
  isPlatformAdmin: false,
}

describe('AppRouter', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, authResolved: false })
    localStorage.removeItem('platform-app')
  })

  it('renders login page at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciá sesión/i)).toBeInTheDocument()
  })

  it('renders callback handler at /auth/google/callback', () => {
    render(
      <MemoryRouter initialEntries={['/auth/google/callback?token=test']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciando sesión/i)).toBeInTheDocument()
  })

  it('renders no-access page at /no-access', () => {
    render(
      <MemoryRouter initialEntries={['/no-access']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/sin acceso/i)).toBeInTheDocument()
  })

  it('renders app-selector at /app-selector for multi-app user', async () => {
    useAuthStore.setState({ token: 't', user: multiAppUser, authResolved: true })

    render(
      <MemoryRouter initialEntries={['/app-selector']}>
        <AppRouter />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/seleccioná una aplicación/i)).toBeInTheDocument()
    })
  })

  it('redirects unauthenticated users from root to login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>,
    )

    expect(screen.getByText(/iniciá sesión/i)).toBeInTheDocument()
  })
})
