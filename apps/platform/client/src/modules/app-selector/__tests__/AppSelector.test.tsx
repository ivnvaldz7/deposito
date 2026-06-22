import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import AppSelector from '../AppSelector'

function TestApp() {
  return (
    <MemoryRouter initialEntries={['/app-selector']}>
      <Routes>
        <Route path="/app-selector" element={<AppSelector />} />
        <Route path="/deposito" element={<div data-testid="deposito-page">Deposito</div>} />
        <Route path="/ale-bet" element={<div data-testid="alebet-page">AleBet</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const multiAppUser = {
  sub: 'u1',
  email: 'multi@test.com',
  name: 'Multi App User',
  apps: {
    deposito: { rol: 'encargado', activo: true },
    'ale-bet': { rol: 'observador', activo: true },
  },
  isPlatformAdmin: false,
}

describe('AppSelector', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, authResolved: false })
    useAppStore.setState({ activeModule: null, lastApp: null })
    localStorage.removeItem('platform-app')
  })

  it('shows available apps for multi-app user', () => {
    useAuthStore.setState({ token: 't', user: multiAppUser, authResolved: true })

    render(<TestApp />)

    expect(screen.getByText(/depósito/i)).toBeInTheDocument()
    expect(screen.getByText(/ale.bet/i)).toBeInTheDocument()
  })

  it('navigates to deposito on click', () => {
    useAuthStore.setState({ token: 't', user: multiAppUser, authResolved: true })

    render(<TestApp />)

    fireEvent.click(screen.getByText(/depósito/i))
    expect(screen.getByTestId('deposito-page')).toBeInTheDocument()
  })

  it('sets lastApp on selection', () => {
    useAuthStore.setState({ token: 't', user: multiAppUser, authResolved: true })

    render(<TestApp />)

    fireEvent.click(screen.getByText(/depósito/i))
    expect(useAppStore.getState().lastApp).toBe('deposito')
  })

  it('handles user with no apps gracefully', () => {
    const noAppsUser = { ...multiAppUser, apps: {} }
    useAuthStore.setState({ token: 't', user: noAppsUser, authResolved: true })

    render(<TestApp />)

    expect(screen.getByText(/sin apps/i)).toBeInTheDocument()
  })

  it('only shows active apps', () => {
    const inactiveUser = {
      ...multiAppUser,
      apps: {
        deposito: { rol: 'encargado', activo: false },
        'ale-bet': { rol: 'observador', activo: true },
      },
    }
    useAuthStore.setState({ token: 't', user: inactiveUser, authResolved: true })

    render(<TestApp />)

    // Should show ale-bet but not deposito
    expect(screen.getByText(/ale.bet/i)).toBeInTheDocument()
    expect(screen.queryByText(/depósito/i)).not.toBeInTheDocument()
  })
})
