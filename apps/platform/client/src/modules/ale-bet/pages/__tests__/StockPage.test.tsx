import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi, type Producto, type StockOverview } from '../../lib/api'
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
    stock: { get: vi.fn(), movimientos: vi.fn(), apertura: vi.fn() },
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
    const data = createStockOverview();
    (data.productos as any)[0] = { /*@ts-ignore*/
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

  it('lists active catalog products at stock zero and exposes them in the opening selector', async () => {
    const productos: Producto[] = [
      { id: 'p-1', nombre: 'Producto A', sku: 'SKU-A', stockMinimo: null, unidadesPorCaja: 1, activo: true, stock: 0, fisico: 0, reservado: 0, disponible: 0, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, stockBajo: false, lotes: [] },
      { id: 'p-2', nombre: 'Producto B', sku: 'SKU-B', stockMinimo: null, unidadesPorCaja: 12, activo: true, stock: 0, fisico: 0, reservado: 0, disponible: 0, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, stockBajo: false, lotes: [] },
      { id: 'p-3', nombre: 'Producto C', sku: 'SKU-C', stockMinimo: 10, unidadesPorCaja: 6, activo: true, stock: 0, fisico: 0, reservado: 0, disponible: 0, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, stockBajo: true, lotes: [] },
    ]
    const overview: StockOverview = { productos, movimientos: [] }
    vi.mocked(aleBetApi.stock.get).mockResolvedValue(overview)
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(productos)

    render(<MemoryRouter><StockPage /></MemoryRouter>)

    await screen.findByText('Producto C')
    expect(screen.getAllByText('0')).toHaveLength(9)
    fireEvent.click(screen.getByRole('button', { name: 'Saldo de apertura' }))

    expect(await screen.findByRole('option', { name: 'Producto A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Producto B' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Producto C' })).toBeInTheDocument()
    expect(vi.mocked(aleBetApi.stock.get)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(aleBetApi.stock.movimientos)).not.toHaveBeenCalled()
  })

  it('confirms the complete opening form and registers the selected unit quantity', async () => {
    const producto = { id: 'p-1', nombre: 'Producto A', sku: 'SKU-A', stockMinimo: null, unidadesPorCaja: 12, activo: true, stock: 0, fisico: 0, reservado: 0, disponible: 0, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0, stockBajo: false, lotes: [] } satisfies Producto
    vi.mocked(aleBetApi.stock.get).mockResolvedValue({ productos: [producto], movimientos: [] })
    vi.mocked(aleBetApi.productos.list).mockResolvedValue([producto])
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      producto: { id: producto.id, nombre: producto.nombre },
      lotes: [{ id: 'l-1', numero: 'L001', fechaProduccion: null, fechaVencimiento: null, activo: true, stockTotal: 0, stockDeposito: 0, stockAcondicionado: 0 }],
      ubicaciones: [{ id: 'u-dep', codigo: 'DEPOSITO', nombre: 'Depósito' }, { id: 'u-aco', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }],
    })
    vi.mocked(aleBetApi.stock.apertura).mockResolvedValue({ movimientoId: 'm-1', tipo: 'SALDO_APERTURA', anterior: 0, nuevo: 5, delta: 5 })

    render(<MemoryRouter><StockPage /></MemoryRouter>)
    await screen.findByText('Producto A')
    fireEvent.click(screen.getByRole('button', { name: 'Saldo de apertura' }))
    const user = userEvent.setup()
    const productSelect = await screen.findByRole('combobox', { name: 'Producto' })
    await screen.findByRole('option', { name: 'Producto A' })
    await user.selectOptions(productSelect, 'p-1')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Lote' }), { target: { value: 'l-1' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Ubicación' }), { target: { value: 'u-aco' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cantidad' }), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Fecha efectiva'), { target: { value: '2026-08-24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar apertura' }))

    expect(screen.getAllByText('Producto A').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('L001')).toBeInTheDocument()
    expect(screen.getAllByText('Acondicionado').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('5 unidades')).toBeInTheDocument()
    expect(screen.getByText('2026-08-24')).toBeInTheDocument()
    expect(screen.getAllByText('Saldo de apertura').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar saldo de apertura' }))

    await waitFor(() => expect(aleBetApi.stock.apertura).toHaveBeenCalledWith(
      'p-1',
      'l-1',
      expect.objectContaining({ ubicacionId: 'u-aco', cantidadFinal: 5 }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    ))
  })
})
