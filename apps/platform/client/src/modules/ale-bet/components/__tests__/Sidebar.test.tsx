import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, cleanup } from '@testing-library/react'
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

  it('shows Ventas por cliente for admin and facturacion in sidebar and bottom nav', () => {
    // Bottom-nav displacement per design R1: admin loses Stock, facturacion
    // loses Clientes in the bottom nav (both keep the full desktop sidebar).
    const displacedByRol: Record<string, string> = {
      admin: 'Stock',
      facturacion: 'Clientes',
    }
    for (const rol of ['admin', 'facturacion']) {
      // Each iteration renders into the same document; wipe the previous tree.
      cleanup()
      mockRol(rol)
      renderSidebar()

      // Desktop sidebar (aside) + mobile bottom nav both render in jsdom;
      // the label appears exactly twice when the role can see it.
      const ventasLinks = screen.getAllByRole('link', { name: 'Ventas por cliente' })
      expect(ventasLinks).toHaveLength(2)
      for (const link of ventasLinks) {
        expect(link).toHaveAttribute('href', '/ale-bet/ventas')
      }
      // The displaced section stays in the desktop sidebar (single occurrence)
      // while its bottom-nav slot was taken over by ventas.
      expect(screen.getAllByText(displacedByRol[rol])).toHaveLength(1)
    }
  })

  it('hides Ventas por cliente for vendedor; historial unchanged', () => {
    mockRol('vendedor')
    renderSidebar()

    expect(screen.queryByRole('link', { name: 'Ventas por cliente' })).not.toBeInTheDocument()
    // Vendedor keeps Historial in the sidebar AND the bottom-nav extra slot.
    expect(screen.getAllByText('Historial')).toHaveLength(2)
  })
})
