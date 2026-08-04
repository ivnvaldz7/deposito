import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { ApiError } from '@/lib/api-client'
import { aleBetApi } from '../../lib/api'
import { toast } from '@/lib/toast'
import NuevoPedidoPage from '../NuevoPedidoPage'
import {
  createClienteList,
  createClientePendiente,
  createPedido,
  createPedidoList,
  createProducto,
  createProductoList,
  createProductoSearchResult,
} from './fixtures/ale-bet-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), search: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn(), update: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), preparar: vi.fn(), cancelar: vi.fn(), confirmarCancelacion: vi.fn(), despachar: vi.fn() },
    transportistas: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    remitos: { emitir: vi.fn(), anular: vi.fn(), pdf: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

function DetalleStub() {
  const params = useParams<{ id: string }>()
  return <div>Detalle:{params.id}</div>
}

function renderNuevoPedido() {
  return render(
    <MemoryRouter initialEntries={['/ale-bet/pedidos/nuevo']}>
      <Routes>
        <Route path="/ale-bet/pedidos/nuevo" element={<NuevoPedidoPage />} />
        <Route path="/ale-bet/pedidos/:id" element={<DetalleStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function seleccionarCliente(nombre: string) {
  const card = await screen.findByRole('button', { name: new RegExp(nombre) })
  fireEvent.click(card)
  await waitFor(() => expect(screen.getByRole('button', { name: /Cambiar/ })).toBeInTheDocument())
}

function bottomBar() {
  return screen.getByTestId('cart-bottom-bar')
}

function sheet() {
  return screen.getByTestId('bottom-sheet')
}

async function abrirResumen() {
  fireEvent.click(within(bottomBar()).getByRole('button', { name: /Ver pedido/ }))
  await waitFor(() => expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument())
}

async function agregarProducto(nombre: string, veces = 1) {
  const frecuentes = await screen.findByRole('region', { name: 'Frecuentes' })
  const card = within(frecuentes).getByRole('button', { name: new RegExp(nombre) })
  for (let i = 0; i < veces; i++) fireEvent.click(card)
}

describe('NuevoPedidoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser({ apps: { 'ale-bet': { rol: 'admin', activo: true } } }),
      token: 'token',
    })
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue(createClienteList())
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue(createPedidoList())
    vi.mocked(aleBetApi.pedidos.create).mockResolvedValue(createPedido())
    vi.mocked(aleBetApi.pedidos.aprobar).mockResolvedValue(createPedido({ estado: 'APROBADO' }))
    vi.mocked(aleBetApi.clientes.create).mockResolvedValue(createClientePendiente({ id: 'cliente-nuevo', nombre: 'Nuevo Cliente' }))
  })

  it('inicia en el selector de cliente con foco en el buscador', async () => {
    renderNuevoPedido()
    const input = screen.getByLabelText('Buscar cliente')
    expect(input).toHaveFocus()
    await waitFor(() => expect(screen.getByText('Cliente A')).toBeInTheDocument())
    expect(screen.getByText('¿Para quién es el pedido?')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar producto')).not.toBeInTheDocument()

    const contenedor = screen.getByRole('heading', { name: 'Nuevo pedido' }).closest('.max-w-lg')
    expect(contenedor?.className).toContain('env(safe-area-inset-bottom)')
  })

  it('filtra clientes por búsqueda y permite cambiar de cliente', async () => {
    renderNuevoPedido()
    await waitFor(() => expect(screen.getAllByText('Cliente A').length).toBeGreaterThan(0))

    const input = screen.getByLabelText('Buscar cliente')
    fireEvent.change(input, { target: { value: 'cliente b' } })
    await waitFor(() => expect(screen.queryByText('Cliente A')).not.toBeInTheDocument())
    expect(screen.getByText('Cliente B')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(screen.getAllByText('Cliente A').length).toBeGreaterThan(0))

    await seleccionarCliente('Cliente A')
    expect(screen.getByTestId('cliente-chip')).toHaveTextContent('Cliente A')

    fireEvent.click(screen.getByRole('button', { name: /Cambiar/ }))
    await waitFor(() => expect(screen.getByText('¿Para quién es el pedido?')).toBeInTheDocument())
    expect(screen.queryByLabelText('Buscar producto')).not.toBeInTheDocument()
  })

  it('muestra clientes recientes derivados de los pedidos del vendedor', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p1', clienteId: 'cliente-1', updatedAt: '2026-07-15T10:00:00.000Z' }),
      createPedido({ id: 'p2', clienteId: 'cliente-2', cliente: createClientePendiente(), updatedAt: '2026-07-16T10:00:00.000Z' }),
    ])
    renderNuevoPedido()
    const recientes = await screen.findByRole('region', { name: 'Clientes recientes' })
    expect(within(recientes).getByText('Cliente B')).toBeInTheDocument()
    expect(within(recientes).getByText('Cliente A')).toBeInTheDocument()
  })

  it('crea un cliente provisional y lo selecciona con badge pendiente', async () => {
    renderNuevoPedido()
    await waitFor(() => expect(screen.getByText('Cliente A')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Cliente nuevo/ }))
    expect(screen.getByText('NUEVO CLIENTE')).toBeInTheDocument()
    expect(screen.getByText(/Cargá lo mínimo. Facturación completará los datos fiscales/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio')

    fireEvent.change(screen.getByLabelText('Nombre del cliente *'), { target: { value: 'Nuevo Cliente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Debe informar un contacto o referencia'),
    )
    expect(aleBetApi.clientes.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Contacto o referencia *'), { target: { value: '11 5555-0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() =>
      expect(aleBetApi.clientes.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Nuevo Cliente', contacto: '11 5555-0000' }),
      ),
    )
    await waitFor(() => expect(screen.getByTestId('cliente-chip')).toHaveTextContent('Nuevo Cliente'))
    expect(screen.getByText('Pendiente de validación por Facturación')).toBeInTheDocument()
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it('producto con solo sueltos: badge "En pedido" con sueltos y stepper inline en la tarjeta', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')

    const frecuentes = await screen.findByRole('region', { name: 'Frecuentes' })
    const card = within(frecuentes).getByTestId('product-card-prod-1')
    expect(within(card).getByText('En pedido · 1 caja')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Sumar sueltos' }))
    expect(within(card).getByText('En pedido · 1 caja · 1 suelto')).toBeInTheDocument()
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 16 unidades')).toBeInTheDocument())

    await abrirResumen()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Quitar cajas' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cerrar' }))

    expect(within(card).getByText('En pedido · 1 suelto')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Sumar sueltos' })).toBeInTheDocument()
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 1 unidades')).toBeInTheDocument())
  })

  it('desde la tarjeta se pueden sumar sueltos hasta el máximo y volver a bajar', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')

    const frecuentes = await screen.findByRole('region', { name: 'Frecuentes' })
    const card = within(frecuentes).getByTestId('product-card-prod-1')
    for (let i = 0; i < 14; i++) fireEvent.click(within(card).getByRole('button', { name: 'Sumar sueltos' }))
    expect(within(card).getByRole('button', { name: 'Sumar sueltos' })).toBeDisabled()
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 29 unidades')).toBeInTheDocument())

    fireEvent.click(within(card).getByRole('button', { name: 'Quitar sueltos' }))
    expect(within(card).getByRole('button', { name: 'Sumar sueltos' })).toBeEnabled()
    expect(within(card).getByText('En pedido · 1 caja · 13 sueltos')).toBeInTheDocument()
  })

  it('permite escribir la cantidad de sueltos directamente desde la tarjeta', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')

    const frecuentes = await screen.findByRole('region', { name: 'Frecuentes' })
    const card = within(frecuentes).getByTestId('product-card-prod-1')
    const inputSueltos = within(card).getByLabelText('sueltos')

    fireEvent.change(inputSueltos, { target: { value: '7' } })
    fireEvent.blur(inputSueltos)

    expect(within(card).getByText('En pedido · 1 caja · 7 sueltos')).toBeInTheDocument()
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 22 unidades')).toBeInTheDocument())

    fireEvent.change(inputSueltos, { target: { value: '99' } })
    fireEvent.blur(inputSueltos)

    expect(within(card).getByText('En pedido · 1 caja · 14 sueltos')).toBeInTheDocument()
  })

  it('busca productos con debounce y agrega al tocar sin perder la búsqueda', async () => {
    vi.mocked(aleBetApi.productos.search).mockResolvedValue([
      createProductoSearchResult({ id: 'prod-3', nombre: 'Producto Z', sku: 'SKU-003' }),
    ])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'prod' } })
    await waitFor(() => expect(aleBetApi.productos.search).toHaveBeenCalledWith('prod'))

    const resultados = await screen.findByRole('region', { name: 'Resultados de búsqueda' })
    const cardZ = within(resultados).getByRole('button', { name: /Producto Z/ })
    fireEvent.click(cardZ)

    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument())
    expect(screen.getByLabelText('Buscar producto')).toHaveValue('prod')
    expect(within(resultados).getByText('En pedido · 1 caja')).toBeInTheDocument()
  })

  it('muestra frecuentes del cliente y excluye esos productos de recientes', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p1', clienteId: 'cliente-1', updatedAt: '2026-07-15T10:00:00.000Z' }),
      createPedido({ id: 'p2', clienteId: 'cliente-1', updatedAt: '2026-07-16T10:00:00.000Z' }),
      createPedido({
        id: 'p3',
        clienteId: 'cliente-2',
        cliente: createClientePendiente(),
        updatedAt: '2026-07-17T10:00:00.000Z',
        items: [
          { id: 'i3', productoId: 'prod-2', cantidad: 15, completado: false, producto: { id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002' } },
        ],
      }),
    ])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')

    const frecuentes = await screen.findByRole('region', { name: 'Frecuentes' })
    expect(within(frecuentes).getByText('Producto A')).toBeInTheDocument()

    const recientes = screen.getByRole('region', { name: 'Recientes' })
    expect(within(recientes).getByText('Producto B')).toBeInTheDocument()
    expect(within(recientes).queryByText('Producto A')).not.toBeInTheDocument()
  })

  it('steppers de cajas/sueltos: suma, resta, input numérico, sin negativos y total', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Sumar cajas' }))
    expect(within(sheet()).getByText('30 unidades')).toBeInTheDocument()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Quitar cajas' }))
    expect(within(sheet()).getByText('15 unidades')).toBeInTheDocument()

    const inputCajas = within(sheet()).getByLabelText('cajas')
    fireEvent.change(inputCajas, { target: { value: '3' } })
    fireEvent.blur(inputCajas)
    expect(within(sheet()).getByText('45 unidades')).toBeInTheDocument()

    const inputSueltos = within(sheet()).getByLabelText('sueltos')
    fireEvent.change(inputSueltos, { target: { value: '20' } })
    fireEvent.blur(inputSueltos)
    expect(within(sheet()).getByText('59 unidades')).toBeInTheDocument()

    fireEvent.change(inputSueltos, { target: { value: '0' } })
    fireEvent.blur(inputSueltos)
    expect(within(sheet()).getByRole('button', { name: 'Quitar sueltos' })).toBeDisabled()

    fireEvent.change(inputCajas, { target: { value: '-4' } })
    fireEvent.blur(inputCajas)
    expect(within(sheet()).getByText('60 unidades')).toBeInTheDocument()
    expect(within(sheet()).getByLabelText('cajas')).toHaveValue('4')
  })

  it('edita cantidades, elimina líneas y excluye líneas en cero', async () => {
    vi.mocked(aleBetApi.productos.search).mockResolvedValue([
      createProductoSearchResult({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002' }),
    ])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'prod' } })
    const resultados = await screen.findByRole('region', { name: 'Resultados de búsqueda' })
    fireEvent.click(await within(resultados).findByRole('button', { name: /Producto B/ }))
    await waitFor(() => expect(within(bottomBar()).getByText('2 productos · 30 unidades')).toBeInTheDocument())
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Eliminar Producto B' }))
    await waitFor(() => expect(within(sheet()).queryByTestId('linea-prod-2')).not.toBeInTheDocument())
    expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Quitar cajas' }))
    expect(within(sheet()).getByText('0 unidades — la línea se excluye del pedido al guardar')).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Eliminar del pedido' })).toBeInTheDocument()
    expect(within(bottomBar()).getByText('0 productos · 0 unidades')).toBeInTheDocument()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Eliminar del pedido' }))
    await waitFor(() => expect(within(sheet()).getByText('El pedido está vacío. Tocá un producto para agregarlo.')).toBeInTheDocument())
  })

  it('conserva el carrito y la búsqueda al cerrar y reabrir el resumen', async () => {
    vi.mocked(aleBetApi.productos.search).mockResolvedValue([
      createProductoSearchResult({ id: 'prod-3', nombre: 'Producto Z', sku: 'SKU-003' }),
    ])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'prod' } })
    const resultados = await screen.findByRole('region', { name: 'Resultados de búsqueda' })
    fireEvent.click(await within(resultados).findByRole('button', { name: /Producto Z/ }))
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument())
    expect(screen.getByLabelText('Buscar producto')).toHaveValue('prod')

    await abrirResumen()
    expect(within(sheet()).getByText('15 unidades')).toBeInTheDocument()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cerrar' }))

    expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument()
    await abrirResumen()
    expect(within(sheet()).getByText('15 unidades')).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar producto')).toHaveValue('prod')
  })

  it('guarda un borrador: POST /pedidos, toast y navegación al detalle', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A', 2)
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 30 unidades')).toBeInTheDocument())
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() =>
      expect(aleBetApi.pedidos.create).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: 'cliente-1', items: [{ productoId: 'prod-1', cantidad: 30 }] }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Detalle:pedido-1')).toBeInTheDocument())
  })

  it('aprueba y envía: POST + PUT aprobar con expectedVersion y navega', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Aprobar y enviar' }))

    await waitFor(() => expect(aleBetApi.pedidos.create).toHaveBeenCalled())
    await waitFor(() =>
      expect(aleBetApi.pedidos.aprobar).toHaveBeenCalledWith(
        'pedido-1',
        expect.objectContaining({ expectedVersion: 1 }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Detalle:pedido-1')).toBeInTheDocument())
  })

  it('409 cliente pendiente: mensaje claro, conserva el carrito y navega al borrador', async () => {
    vi.mocked(aleBetApi.pedidos.aprobar).mockRejectedValue(
      new ApiError(409, 'El cliente está PENDIENTE_CLIENTE y debe validarse antes de aprobar'),
    )
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A', 2)
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 30 unidades')).toBeInTheDocument())
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Aprobar y enviar' }))

    await waitFor(() =>
      expect(aleBetApi.pedidos.create).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ productoId: 'prod-1', cantidad: 30 }] }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining('validado por Facturación')),
    )
    await waitFor(() => expect(screen.getByText('Detalle:pedido-1')).toBeInTheDocument())
  })

  it('409 stock: marca los productos conflictivos, refetch de stock, conserva el carrito y no navega', async () => {
    vi.mocked(aleBetApi.pedidos.aprobar).mockRejectedValue(
      new ApiError(409, 'Stock insuficiente para reservar producto prod-1. Disponible: 5u, solicitado: 15u'),
    )
    vi.mocked(aleBetApi.productos.list)
      .mockResolvedValueOnce(createProductoList())
      .mockResolvedValueOnce([createProducto({ id: 'prod-1', disponible: 5, fisico: 5, stock: 5, stockBajo: true })])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')
    await abrirResumen()

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Aprobar y enviar' }))

    const banner = await screen.findByTestId('stock-error-banner')
    expect(banner).toHaveTextContent('Stock insuficiente')
    expect(banner).toHaveTextContent('prod-1')
    await waitFor(() => expect(aleBetApi.productos.list).toHaveBeenCalledTimes(2))

    await waitFor(() => expect(within(sheet()).getByText('Faltan 10u')).toBeInTheDocument())
    expect(within(sheet()).getByText('Stock insuficiente según el servidor')).toBeInTheDocument()
    expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument()
    expect(screen.queryByText(/Detalle:/)).not.toBeInTheDocument()

    fireEvent.click(within(banner).getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(screen.queryByTestId('stock-error-banner')).not.toBeInTheDocument())
    expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument()
  })

  it('estructura mobile: búsqueda arriba, resumen en sheet scrollable y bottom bar fija solo en mobile', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')

    const input = screen.getByLabelText('Buscar producto')
    const bar = bottomBar()
    expect(input.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(bar.className).toMatch(/\bfixed\b/)
    expect(bar.className).toMatch(/\binset-x-0\b/)
    expect(bar.className).toContain('lg:hidden')

    await abrirResumen()
    const sheetEl = sheet()
    expect(sheetEl.className).toContain('max-h-[85dvh]')
    expect(sheetEl.querySelector('[class*="overflow-y-auto"]')).not.toBeNull()
  })

  it('desktop split: el resumen es un panel visible en lg sin abrir el sheet móvil', async () => {
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')
    await waitFor(() => expect(within(bottomBar()).getByText('1 productos · 15 unidades')).toBeInTheDocument())

    const panel = screen.getByTestId('cart-panel')
    expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
    expect(panel).toHaveTextContent('Resumen del pedido')
    expect(within(panel).getByTestId('linea-prod-1')).toHaveTextContent('15 unidades')
    expect(within(panel).getByRole('button', { name: 'Guardar borrador' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Aprobar y enviar' })).toBeInTheDocument()
    expect(panel.parentElement?.className).toContain('hidden')
    expect(panel.parentElement?.className).toContain('lg:flex')
  })

  it('semáforo por línea y bloqueo de aprobar cuando hay stock rojo', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue([
      createProducto(),
      createProducto({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002', stock: 10, fisico: 10, reservado: 0, disponible: 10, stockBajo: true }),
    ])
    vi.mocked(aleBetApi.productos.search).mockResolvedValue([
      createProductoSearchResult({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002', fisico: 10, disponible: 10 }),
    ])
    renderNuevoPedido()
    await seleccionarCliente('Cliente A')
    await agregarProducto('Producto A')

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'prod' } })
    const resultados = await screen.findByRole('region', { name: 'Resultados de búsqueda' })
    fireEvent.click(await within(resultados).findByRole('button', { name: /Producto B/ }))
    await abrirResumen()

    expect(within(sheet()).getByLabelText('Stock verde')).toBeInTheDocument()
    expect(within(sheet()).getByLabelText('Stock rojo')).toBeInTheDocument()
    expect(within(sheet()).getByText('Faltan 5u')).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'Aprobar y enviar' })).toBeDisabled()
    expect(
      within(sheet()).getByText('Hay líneas con stock insuficiente: ajustá las cantidades antes de aprobar.'),
    ).toBeInTheDocument()
  })
})
