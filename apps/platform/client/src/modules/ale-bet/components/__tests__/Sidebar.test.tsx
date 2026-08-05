import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'
import Sidebar from '../Sidebar'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location-display">{location.pathname}</div>
}

function mockRol(rol: string, logoutFn = vi.fn()) {
  const user = createMockUser({ apps: { 'ale-bet': { rol, activo: true } } })
  ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (state: any) => any) =>
      selector({ user, token: 'token', logout: logoutFn }),
  )
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/ale-bet/dashboard']}>
      <Routes>
        <Route path="/ale-bet/dashboard" element={<Sidebar />} />
        <Route path="/login" element={<LocationDisplay />} />
        <Route path="/app-selector" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no longer contains "Nuevo pedido" in desktop but keeps it in mobile', () => {
    mockRol('vendedor')
    renderSidebar()

    // In desktop sidebar, the string "Nuevo pedido" was removed
    // We can only find "Nuevo" in the mobile bottom nav
    expect(screen.queryByText('Nuevo pedido')).not.toBeInTheDocument()
    expect(screen.getByText('Nuevo')).toBeInTheDocument()
    expect(screen.getByText('Nuevo').closest('a')).toHaveAttribute('href', '/ale-bet/pedidos/nuevo')
  })

  it('handles "Cambiar módulo" routing without logging out', () => {
    const logoutMock = vi.fn()
    mockRol('vendedor', logoutMock)
    renderSidebar()

    const changeModuleBtn = screen.getByRole('button', { name: 'Cambiar módulo' })
    fireEvent.click(changeModuleBtn)

    expect(logoutMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/app-selector')
  })

  it('handles "Cerrar sesión" cleanly via the store', () => {
    const logoutMock = vi.fn()
    mockRol('vendedor', logoutMock)
    renderSidebar()

    const logoutBtn = screen.getByRole('button', { name: 'Cerrar sesión' })
    fireEvent.click(logoutBtn)

    expect(logoutMock).toHaveBeenCalled()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/login')
  })
})
