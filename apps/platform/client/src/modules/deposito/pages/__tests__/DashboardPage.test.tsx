import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import DashboardPage from '../DashboardPage'
import { createDashboardStats } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))

describe('DashboardPage (Depósito)', () => {
  const mockUser = createMockUser()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: mockUser, token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el dashboard')).toBeInTheDocument()
    })
  })

  it('renders dashboard with KPI data', async () => {
    const stats = createDashboardStats()
    vi.mocked(api.get).mockResolvedValue(stats)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Últimos Movimientos')).toBeInTheDocument()
    expect(screen.getAllByText('Vitamina B12').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Paracetamol')).toBeInTheDocument()
  })

  it('shows stock bajo section when there is low stock', async () => {
    const stats = createDashboardStats({
      stockBajo: [
        { id: 'd1', nombre: 'Paracetamol', cantidad: 3 },
        { id: 'd2', nombre: 'Ibuprofeno', cantidad: 2 },
      ],
    })
    vi.mocked(api.get).mockResolvedValue(stats)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText('Stock Bajo')).toBeInTheDocument()
    })
  })
})
