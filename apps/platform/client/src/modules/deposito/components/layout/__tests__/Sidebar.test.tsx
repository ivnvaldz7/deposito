import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../Sidebar'

vi.mock('@/stores/auth-store', () => ({ 
  useAuthStore: (selector: (s: any) => any) => selector({ 
    user: { name: 'Ana', apps: { deposito: { rol: 'encargado', activo: true } } }, 
    logout: vi.fn() 
  }) 
}))

vi.mock('@/lib/permissions', () => ({
  can: () => true
}))

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }))

describe('Depósito Sidebar (Shared AppSidebarLayout)', () => {
  it('renders fixed stable desktop structure without hover-expand animations', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    
    const sidebar = screen.getByRole('complementary')
    // Es FIJO, sin width dinámico ni hover
    expect(sidebar).toHaveClass('fixed', 'w-[280px]')
    expect(sidebar).not.toHaveClass('w-0', 'transition-all', 'duration-300')

    // Contiene el nombre de app y usuario en el header
    expect(screen.getByText('Depósito')).toBeInTheDocument()
    expect(screen.getAllByText('Ana')).toHaveLength(1)
    expect(screen.getByText('Encargado')).toBeInTheDocument()

    // Acciones del footer presentes
    expect(screen.getByRole('button', { name: 'Cambiar módulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('marks current route as active', () => {
    render(
      <MemoryRouter initialEntries={['/deposito/actas']}>
        <Routes>
          <Route path="*" element={<Sidebar />} />
        </Routes>
      </MemoryRouter>
    )

    // The Active Link should have "bg-surface-variant/30 text-on-surface font-semibold"
    const actasLink = screen.getByRole('link', { name: /Actas/i })
    expect(actasLink).toHaveClass('font-semibold')
    
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i })
    expect(dashboardLink).not.toHaveClass('font-semibold')
  })

  it('does not render Usuarios link in the sidebar', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: /Usuarios/i })).not.toBeInTheDocument()
  })

  it('uses the operational navigation order and keeps Productos out of the visible menu', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/deposito/dashboard',
      '/deposito/actas',
      '/deposito/ordenes',
      '/deposito/estuches',
      '/deposito/etiquetas',
      '/deposito/frascos',
      '/deposito/drogas',
      '/deposito/materiales-empaque',
      '/deposito/movimientos',
      '/deposito/pendientes',
      '/deposito/ordenes/archivadas',
      '/deposito/metricas',
    ])
    expect(screen.queryByRole('link', { name: 'Productos' })).not.toBeInTheDocument()
  })
})
