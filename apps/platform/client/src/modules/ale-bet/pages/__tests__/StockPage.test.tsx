import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import StockPage from '../StockPage'
import { createStockOverview } from './fixtures/ale-bet-mock-factories'
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

describe('StockPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.stock.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    expect(screen.getByText('Cargando stock...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.stock.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders stock view with products without summary cards and without SKU', async () => {
    const data = createStockOverview()
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(data)
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getAllByText('Stock').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('Producto B')).toBeInTheDocument()
    expect(screen.queryByText('Total productos')).not.toBeInTheDocument()
    expect(screen.queryByText(/SKU-/)).not.toBeInTheDocument()
  })

  it('shows location-aware balances for a product and expands lotes', async () => {
    const data = createStockOverview()
    data.productos[0] = {
      ...data.productos[0],
      stockTotal: 12,
      stockDeposito: 7,
      stockAcondicionado: 5,
      stockDisponiblePedido: 6,
      lotes: [
        {
          id: 'lote-1',
          numero: 'L123',
          cajas: 0,
          sueltos: 5,
          fechaProduccion: null,
          fechaVencimiento: null,
          activo: true,
          stockTotal: 5,
          stockDeposito: 3,
          stockAcondicionado: 2,
        },
        {
          id: 'lote-zero',
          numero: 'L000',
          cajas: 0,
          sueltos: 0,
          fechaProduccion: null,
          fechaVencimiento: null,
          activo: true,
          stockTotal: 0,
          stockDeposito: 0,
          stockAcondicionado: 0,
        }
      ]
    }
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(data)
    render(<MemoryRouter><StockPage /></MemoryRouter>)

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    
    // expand lotes
    fireEvent.click(screen.getByText('Producto A'))
    
    expect(await screen.findByText('L123')).toBeInTheDocument()
    expect(screen.getAllByText('Depósito').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Acondicionado').length).toBeGreaterThan(0)
    
    // The amounts from the fixture should appear
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.queryByText('N/D')).not.toBeInTheDocument()

    // Lote zero should show 0
    expect(screen.getByText('L000')).toBeInTheDocument()
    // Find all '0' texts to ensure they render properly instead of being hidden
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(3) // at least total, deposito, acondicionado for L000
  })
})
