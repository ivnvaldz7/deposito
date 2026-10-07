import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ChangePasswordPage from '../ChangePasswordPage'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('@/stores/auth-store', () => {
  let storeState = {
    user: { mustChangePassword: true, apps: {} },
    initializeAuth: vi.fn().mockResolvedValue(undefined),
    login: vi.fn(),
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

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders the change password form', () => {
    render(
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Contraseña actual/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nueva contraseña/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirmar nueva contraseña/)).toBeInTheDocument()
  })

  it('validates password minimum length (<8 rechazada)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Contraseña actual/), 'oldPass123')
    await user.type(screen.getByLabelText(/^Nueva contraseña/), 'short')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Debe tener al menos 8 caracteres')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('validates confirm password matches (confirmación distinta rechazada)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ChangePasswordPage />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Contraseña actual/), 'oldPass123')
    await user.type(screen.getByLabelText(/^Nueva contraseña/), 'newPass123')
    await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), 'different')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls change password API and navigates on success (cambio exitoso)', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.endsWith('/change-password')) {
        return new Response(JSON.stringify({ token: 'new', user: { mustChangePassword: false, apps: {} } }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/app-selector" element={<div>Navegación continúa</div>} />
        </Routes>
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/Contraseña actual/), 'oldPass123')
    await user.type(screen.getByLabelText(/^Nueva contraseña/), 'newPass123')
    await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), 'newPass123')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
    
    // Check it navigates away
    expect(await screen.findByText('Navegación continúa')).toBeInTheDocument()
  })
})
