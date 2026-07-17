import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('renders stock view with products and movements', async () => {
    const data = createStockOverview()
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(data)
    render(<MemoryRouter><StockPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getAllByText('Stock').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('Producto B')).toBeInTheDocument()
    expect(screen.getByText('Últimos movimientos')).toBeInTheDocument()
    expect(screen.getByText('ENTRADA MANUAL')).toBeInTheDocument()
  })
})
