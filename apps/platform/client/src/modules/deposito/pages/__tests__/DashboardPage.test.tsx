import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQueryClient as render } from '@/test-utils'
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

vi.mock('../../components/layout/Topbar', () => ({
  Topbar: () => <div data-testid="dashboard-actions">Buscador inteligente</div>,
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
      expect(screen.queryByText(/no se pudo cargar/i)).toBeInTheDocument()
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
      expect(screen.getByText('Últimos movimientos')).toBeInTheDocument()
    })
    expect(screen.getByText('Depósito')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getAllByText(/Vitamina B12/i).length).toBeGreaterThan(0)
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
      expect(screen.getByText('Alertas de stock bajo')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Ver productos con stock bajo' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Paracetamol', { selector: 'p' })).toBeInTheDocument()
    expect(within(dialog).getAllByText('Droga')).toHaveLength(2)
    expect(within(dialog).getByText('3 kg')).toBeInTheDocument()
  })

  it('uses the cm³ notation and gives each movement type a distinct visual treatment', async () => {
    const stats = createDashboardStats({
      stockBajoEtiquetas: [
        { id: 'etiqueta-cm3', articulo: 'AMANTINA 250 CM3', mercado: 'VENEZUELA', cantidad: 0 },
      ],
      ultimosMovimientos: [
        { id: 'ingreso', tipo: 'ingreso_acta' as const, categoria: 'etiqueta', productoNombre: 'AMANTINA 250 CM3', cantidad: 20 },
        { id: 'egreso', tipo: 'egreso_orden' as const, categoria: 'etiqueta', productoNombre: 'AMANTINA 500 CM3', cantidad: -20 },
        { id: 'ajuste', tipo: 'ajuste_manual' as const, categoria: 'etiqueta', productoNombre: 'AMANTINA 750 CM3', cantidad: -5 },
      ],
    })
    vi.mocked(api.get).mockResolvedValue(stats)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('AMANTINA 250 cm³').length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument()

    for (const chip of screen.getAllByTestId('movement-type-ingreso_acta')) {
      expect(chip).toHaveClass('text-emerald-300')
    }
    for (const chip of screen.getAllByTestId('movement-type-egreso_orden')) {
      expect(chip).toHaveClass('text-rose-300')
    }
    for (const chip of screen.getAllByTestId('movement-type-ajuste_manual')) {
      expect(chip).toHaveClass('text-violet-300')
    }
  })
})
