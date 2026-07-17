import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import DashboardPage from '../DashboardPage'
import { createDashboardOverview } from './fixtures/ale-bet-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), create: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), cancelar: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('DashboardPage (Ale-Bet)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser({ apps: { 'ale-bet': { rol: 'admin', activo: true } } }),
      token: 'token',
    })
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.dashboard).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByText('Cargando dashboard...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.dashboard).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders KPI metric cards', async () => {
    const data = createDashboardOverview()
    vi.mocked(aleBetApi.dashboard).mockResolvedValue(data)
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getByText('Pedidos recientes')).toBeInTheDocument()
  })
})
