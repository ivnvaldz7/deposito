import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../Sidebar'

vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (s: object) => unknown) => selector({ user: { name: 'Ana', apps: { deposito: { rol: 'encargado' } } }, logout: vi.fn() }) }))
vi.mock('../../../stores/sidebar-store', () => ({ useSidebarStore: (selector: (s: object) => unknown) => selector({ collapsed: false }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }))

describe('Depósito Sidebar', () => {
  it('is a fixed desktop overlay and exposes one compact action block without repeating identity', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    const sidebar = screen.getByRole('complementary')
    expect(sidebar).toHaveClass('fixed')
    expect(screen.getAllByText('Ana')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cambiar módulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})
