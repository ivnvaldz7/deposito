import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRouter } from '../index'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('@/stores/auth-store', () => {
  let storeState = {
    token: 'test-token',
    user: { mustChangePassword: true, apps: { deposito: { activo: true } } },
    authResolved: true,
  }
  return {
    useAuthStore: Object.assign(
      (selector?: (state: any) => any) => (selector ? selector(storeState) : storeState),
      {
        getState: () => storeState,
        setState: (newState: any) => { storeState = { ...storeState, ...newState } }
      }
    )
  }
})

describe('AppRouter / AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mustChangePassword=true bloquea navegación normal', async () => {
    // When hitting a protected app directly
    render(
      <MemoryRouter initialEntries={['/deposito']}>
        <AppRouter />
      </MemoryRouter>
    )

    // Should redirect to change password
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    })
  })
})
