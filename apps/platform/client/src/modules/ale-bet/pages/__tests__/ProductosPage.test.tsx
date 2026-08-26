import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { createMockUser } from '@/test-utils'
import ProductosPage from '../ProductosPage'
import { createLote, createProducto, createProductoList } from './fixtures/ale-bet-mock-factories'
import { readFileSync } from 'node:fs'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), search: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn(), update: vi.fn() }, stock: { get: vi.fn(), lotes: { create: vi.fn(), ajuste: vi.fn() } } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), preparar: vi.fn(), cancelar: vi.fn(), confirmarCancelacion: vi.fn(), despachar: vi.fn() },
    transportistas: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    remitos: { emitir: vi.fn(), anular: vi.fn(), pdf: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

function mockRol(rol: string) {
  const user = createMockUser({ apps: { 'ale-bet': { rol, activo: true } } })
  ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (state: { user: typeof user; token: string }) => unknown) =>
      selector({ user, token: 'token' }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductosPage />
    </MemoryRouter>,
  )
}

describe('ProductosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
  })

  it('uses the canonical stock adjustment permission', () => {
    expect(readFileSync('src/modules/ale-bet/pages/ProductosPage.tsx', 'utf8')).not.toContain("'stock.adjust'")
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.productos.list).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Cargando productos...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.productos.list).mockRejectedValue(new Error('Error al cargar productos'))
    renderPage()
    await waitFor(() => expect(screen.queryByText(/error/i)).toBeInTheDocument())
  })

  it('renders catalog with products and basic stock', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })
    const table = within(screen.getByTestId('productos-table'))
    expect(table.getByText('Producto A')).toBeInTheDocument()
    expect(table.getByText('Producto B')).toBeInTheDocument()

    // Comprobar stock
    expect(table.getAllByText('500').length).toBeGreaterThan(0)
    expect(table.getAllByText('50').length).toBeGreaterThan(0)
  })

  it('orders catalog presentations naturally after the API response', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue([
      createProducto({ id: 'p-500', nombre: 'ENERGIZANTE 500 ML' }),
      createProducto({ id: 'p-100', nombre: 'ENERGIZANTE 100 ML' }),
      createProducto({ id: 'p-250-vacas', nombre: 'ENERGIZANTE 250 ML VACAS' }),
      createProducto({ id: 'p-25', nombre: 'ENERGIZANTE 25 ML' }),
      createProducto({ id: 'p-250', nombre: 'ENERGIZANTE 250 ML' }),
    ])
    renderPage()
    const rows = await screen.findAllByRole('row')
    expect(rows.slice(1).map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      'ENERGIZANTE 25 ML',
      'ENERGIZANTE 100 ML',
      'ENERGIZANTE 250 ML',
      'ENERGIZANTE 250 ML VACAS',
      'ENERGIZANTE 500 ML',
    ])
  })
  it('usuario sin grant: no ve acciones de administración de productos ni de gestión de stock', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })

    const table = within(screen.getByTestId('productos-table'))
    expect(table.getByText('Producto A')).toBeInTheDocument()
    
    expect(screen.queryByRole('button', { name: '+ Nuevo producto' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Editar' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Eliminar' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Gestionar stock' })).toHaveLength(0)
  })

  it('usuario con grant de gestión de stock: ve el botón y puede abrir el modal', async () => {
    mockRol('encargado')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    
    vi.mocked(aleBetApi.productos.stock.get).mockResolvedValue({
      lotes: [
        {
          id: 'lote-1',
          numero: 'L-2024-001',
          fechaProduccion: null,
          fechaVencimiento: null,
          activo: true,
          unidadesPorCaja: 50,
          stockTotal: 100,
          stockDeposito: 100,
          stockAcondicionado: 0
        }
      ],
      ubicaciones: [
        { id: 'u-dep', codigo: 'DEPOSITO', nombre: 'Depósito Central' },
        { id: 'u-aco', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' }
      ]
    })
    
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: '+ Nuevo producto' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Gestionar stock' }).length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Gestionar stock' })[0])
    await waitFor(() => expect(screen.getByText('LOTE L-2024-001')).toBeInTheDocument())
  })

  it('usuario con full grants (admin): ve acciones de productos y de stock', async () => {
    mockRol('admin')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: '+ Nuevo producto' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: 'Eliminar' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: 'Gestionar stock' }).length).toBeGreaterThanOrEqual(1)
  })

  it('no renderiza SKU para ningún rol (vendedor, encargado, admin)', async () => {
    const roles = ['vendedor', 'encargado', 'admin']
    
    for (const rol of roles) {
      mockRol(rol)
      vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList()) // includes SKU-001, SKU-002
      renderPage()
      
      await waitFor(() => {
        expect(screen.getByText('Productos')).toBeInTheDocument()
      })
      
      expect(screen.queryByText(/SKU/i)).not.toBeInTheDocument()
    }
  })

  it('no renderiza SKU al abrir el modal de Nuevo producto', async () => {
    mockRol('admin')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })
    
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo producto' }))
    
    await waitFor(() => {
      expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
    })
    
    expect(screen.queryByText(/SKU/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/SKU/i)).not.toBeInTheDocument()
  })

  it('no renderiza SKU al abrir el modal de Editar producto', async () => {
    mockRol('admin')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })
    
    const editButtons = screen.getAllByRole('button', { name: 'Editar' })
    fireEvent.click(editButtons[0])
    
    await waitFor(() => {
      expect(screen.getByText('Editar producto')).toBeInTheDocument()
    })
    
    expect(screen.queryByText(/SKU/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/SKU/i)).not.toBeInTheDocument()
  })

  describe('Lectura de stock general - Regresión visual', () => {
    const roles = ['vendedor', 'facturacion', 'armador', 'encargado']
    
    const mockProductoAMANTINA = {
      ...createProductoList()[0],
      id: 'prod-amantina',
      nombre: 'AMANTINA 500 ML',
      stockTotal: 80,
      stockDeposito: 40,
      stockAcondicionado: 40,
      lotes: [
        { id: 'l1', numero: 'AM0140', activo: true, stockTotal: 40, stockDeposito: 40, stockAcondicionado: 0, cajas: 0, sueltos: 0, fechaProduccion: null, fechaVencimiento: null },
        { id: 'l2', numero: 'AM0141', activo: true, stockTotal: 40, stockDeposito: 0, stockAcondicionado: 40, cajas: 0, sueltos: 0, fechaProduccion: null, fechaVencimiento: null }
      ]
    }

    for (const rol of roles) {
      it(`rol ${rol} ve 80 / 40 / 40 en AMANTINA 500 ML y puede expandir lotes`, async () => {
        mockRol(rol)
        vi.mocked(aleBetApi.productos.list).mockResolvedValue([mockProductoAMANTINA])
        renderPage()

        await waitFor(() => {
          expect(screen.getByText('AMANTINA 500 ML')).toBeInTheDocument()
        })

        // Verificar visualmente en la tabla principal
        const row = screen.getByText('AMANTINA 500 ML').closest('tr')!
        expect(within(row).getByText('80')).toBeInTheDocument()
        const forties = within(row).getAllByText('40')
        expect(forties.length).toBeGreaterThanOrEqual(2) // Al menos deposito y acondicionado

        // Click en la fila para expandir
        fireEvent.click(row)

        await waitFor(() => {
          expect(screen.getByText('LOTE AM0140')).toBeInTheDocument()
          expect(screen.getByText('LOTE AM0141')).toBeInTheDocument()
        })
        
        // Verificar lotes 
        const lote1 = screen.getByText('LOTE AM0140').parentElement!.parentElement!
        expect(within(lote1).getAllByText('40').length).toBeGreaterThanOrEqual(2) // deposito, total
        expect(within(lote1).getByText('0')).toBeInTheDocument() // acondicionado
        
        const lote2 = screen.getByText('LOTE AM0141').parentElement!.parentElement!
        expect(within(lote2).getAllByText('40').length).toBeGreaterThanOrEqual(2) // acondicionado, total
        expect(within(lote2).getByText('0')).toBeInTheDocument() // deposito
      })
    }
  })
})
