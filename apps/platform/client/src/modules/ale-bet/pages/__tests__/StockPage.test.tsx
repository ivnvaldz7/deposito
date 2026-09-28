import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi, type StockOverview } from '../../lib/api'
import StockPage from '../StockPage'
import { createStockOverview } from './fixtures/ale-bet-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn() }, stock: { get: vi.fn(), lotes: { create: vi.fn(), ajuste: vi.fn() } } },
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

  it('renders loading and error states', async () => {
    vi.mocked(aleBetApi.stock.get).mockReturnValueOnce(new Promise(() => {}))
    const { unmount } = render(<MemoryRouter><StockPage /></MemoryRouter>)
    expect(screen.getByText('Cargando stock...')).toBeInTheDocument()
    unmount()

    vi.mocked(aleBetApi.stock.get).mockRejectedValueOnce(new Error('Error'))
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders the operational stock view without an opening action', async () => {
    const data: StockOverview = createStockOverview()
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(data)
    render(<MemoryRouter><StockPage /></MemoryRouter>)

    expect(await screen.findByText('Producto A')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apertura/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/saldo de apertura/i)).not.toBeInTheDocument()
  })

  it('renders operational lots and never restores a zero lot from the UI', async () => {
    const data: StockOverview = createStockOverview()
    data.productos[0] = {
      ...data.productos[0],
      stockTotal: 5,
      stockDeposito: 3,
      stockAcondicionado: 2,
      lotes: [{
        id: 'lote-1', numero: 'L123', cajas: 0, sueltos: 5,
        fechaProduccion: null, fechaVencimiento: null, activo: true,
        stockTotal: 5, stockDeposito: 3, stockAcondicionado: 2,
      }],
    }
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(data)
    render(<MemoryRouter><StockPage /></MemoryRouter>)

    fireEvent.click(await screen.findByText('Producto A'))
    expect(await screen.findByText('L123')).toBeInTheDocument()
    expect(screen.getAllByText('Depósito').length).toBeGreaterThan(0)
    expect(screen.queryByText('L000')).not.toBeInTheDocument()
  })
})
