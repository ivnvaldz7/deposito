import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ApiError } from '@/lib/api-client'
import { aleBetApi } from '../../lib/api'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/stores/auth-store'
import { createMockUser } from '@/test-utils'
import type { Pedido } from '../../lib/api'
import PedidoDetailPage from '../PedidoDetailPage'
import {
  createCliente,
  createClienteList,
  createClientePendiente,
  createPedido,
  createPedidoItem,
  createPedidoList,
  createProductoList,
  createProductoSearchResult,
  createRemito,
  createTransportista,
} from './fixtures/ale-bet-mock-factories'

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

function mockRol(rol: string) {
  const user = createMockUser({ apps: { 'ale-bet': { rol, activo: true } } })
  ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (state: { user: typeof user; token: string }) => unknown) =>
      selector({ user, token: 'token' }),
  )
}

function renderDetalle() {
  return render(
    <MemoryRouter initialEntries={['/ale-bet/pedidos', '/ale-bet/pedidos/pedido-1']} initialIndex={1}>
      <Routes>
        <Route path="/ale-bet/pedidos" element={<div data-testid="pedidos-route">PedidosRoute</div>} />
        <Route path="/ale-bet/pedidos/:id" element={<PedidoDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function linea(productoId: string) {
  return screen.getByTestId(`linea-${productoId}`)
}

function confirmDialog() {
  return within(screen.getByTestId('confirm-dialog'))
}

function sheet() {
  return screen.getByTestId('bottom-sheet')
}

function barra() {
  return within(screen.getByTestId('armador-action-bar'))
}

describe('PedidoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido())
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue(createClienteList())
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue(createPedidoList())
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue([createTransportista()])
    vi.mocked(aleBetApi.pedidos.update).mockResolvedValue(createPedido())
    vi.mocked(aleBetApi.pedidos.aprobar).mockResolvedValue(createPedido({ estado: 'APROBADO' }))
    vi.mocked(aleBetApi.pedidos.tomar).mockResolvedValue(createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1' }))
    vi.mocked(aleBetApi.pedidos.completarItem).mockResolvedValue(createPedido({ items: [createPedidoItem({ completado: true })] }))
    vi.mocked(aleBetApi.pedidos.preparar).mockResolvedValue(createPedido({ estado: 'PREPARADO' }))
    vi.mocked(aleBetApi.pedidos.cancelar).mockResolvedValue({ pedido: createPedido({ estado: 'CANCELADO' }), requested: false })
    vi.mocked(aleBetApi.pedidos.confirmarCancelacion).mockResolvedValue(createPedido({ estado: 'CANCELADO' }))
    vi.mocked(aleBetApi.pedidos.despachar).mockResolvedValue(createPedido({ estado: 'DESPACHADO', despachadoAt: '2026-07-18T10:00:00.000Z' }))
    vi.mocked(aleBetApi.remitos.emitir).mockResolvedValue(createRemito())
    vi.mocked(aleBetApi.remitos.anular).mockResolvedValue(
      createRemito({ estado: 'INVALIDADO', motivoInvalidacion: 'Error de carga', invalidadoAt: '2026-07-17T12:00:00.000Z' }),
    )
    vi.mocked(aleBetApi.remitos.pdf).mockResolvedValue(new Blob(['pdf']))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra el detalle: número, estado, vendedor y acciones del BORRADOR', async () => {
    renderDetalle()
    expect(await screen.findByTestId('pedido-numero')).toHaveTextContent('Pedido P-001')
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Vendedor: Vendedor 1')).toBeInTheDocument()
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(linea('prod-1')).toHaveTextContent('10 unidades')
    expect(screen.getByRole('button', { name: 'Cambiar cliente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Agregar producto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('muestra navegación contextual "Pedidos" y navega correctamente', async () => {
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    const backBtn = screen.getByRole('button', { name: /Pedidos/i })
    expect(backBtn).toBeInTheDocument()
    fireEvent.click(backBtn)
    expect(screen.getByTestId('pedidos-route')).toBeInTheDocument()
  })

  it('edita cantidades, agrega un producto y guarda los cambios', async () => {
    vi.mocked(aleBetApi.productos.search).mockResolvedValue([
      createProductoSearchResult({ id: 'prod-2', nombre: 'Producto B', sku: 'SKU-002' }),
    ])
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    fireEvent.click(within(linea('prod-1')).getByRole('button', { name: 'Sumar cajas' }))
    expect(linea('prod-1')).toHaveTextContent('1 caja · 10 sueltos · 25 unidades')

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar producto' }))
    await screen.findByTestId('bottom-sheet')
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'prod' } })
    const resultados = await screen.findByRole('region', { name: 'Resultados de búsqueda' })
    fireEvent.click(await within(resultados).findByRole('button', { name: /Producto B/ }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cerrar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.update).toHaveBeenCalledWith('pedido-1', {
        clienteId: 'cliente-1',
        items: [
          { productoId: 'prod-1', cantidad: 25 },
          { productoId: 'prod-2', cantidad: 15 },
        ],
        expectedVersion: 1,
      }),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido P-001 actualizado')
  })

  it('cambia el cliente desde el sheet y guarda', async () => {
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await screen.findByTestId('bottom-sheet')
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'cliente b' } })
    fireEvent.click(await screen.findByRole('button', { name: /Cliente B/ }))
    expect(screen.getByText('Cambio de cliente sin guardar')).toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.update).toHaveBeenCalledWith(
        'pedido-1',
        expect.objectContaining({ clienteId: 'cliente-2' }),
      ),
    )
  })

  it('crea un cliente nuevo con validaciones', async () => {
    vi.mocked(aleBetApi.clientes.create).mockResolvedValue(
      createClientePendiente({ id: 'cliente-nuevo', nombre: 'Nuevo Cliente' }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await screen.findByTestId('bottom-sheet')
    fireEvent.click(screen.getByRole('button', { name: '+ Cliente nuevo' }))
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
    await waitFor(() => expect(screen.getByText('Cambio de cliente sin guardar')).toBeInTheDocument())
  })

  it('cancela un BORRADOR con confirmación', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ vendedorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirmDialog().getByText('Se descartará el pedido')).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.cancelar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1, motivo: undefined },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido cancelado')
  })

  it('APROBADO: advertencia de disponibilidad y guardar con confirmación', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'APROBADO', vendedorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(
      screen.getByText('Editar puede cambiar la disponibilidad y liberar la reserva actual'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Al guardar se liberará la reserva actual y se volverá a reservar según la disponibilidad'),
    ).toBeInTheDocument()

    fireEvent.click(within(linea('prod-1')).getByRole('button', { name: 'Sumar cajas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(
      confirmDialog().getByText('Esto puede cambiar la disponibilidad y liberará la reserva actual. ¿Continuar?'),
    ).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Continuar' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.update).toHaveBeenCalledWith(
        'pedido-1',
        expect.objectContaining({ items: [{ productoId: 'prod-1', cantidad: 25 }], expectedVersion: 1 }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido P-001 actualizado')
  })

  it('APROBADO: cancelar advierte que libera la reserva', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'APROBADO', vendedorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(confirmDialog().getByText('Se liberará la reserva de stock')).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.cancelar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1, motivo: undefined },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido cancelado y reserva liberada')
  })

  it('cliente pendiente bloquea aprobar y avisa a facturación', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([createCliente(), createClientePendiente()])
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({ clienteId: 'cliente-2', cliente: createClientePendiente() }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.getByText('Cliente pendiente de validación')).toBeInTheDocument()
    expect(screen.getByText('Facturación debe completar los datos')).toBeInTheDocument()
    expect(screen.getByText('El cliente debe ser validado por Facturación antes de aprobar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled()
  })

  it('admin aprueba un BORRADOR y confirma', async () => {
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(confirmDialog().getByText(/Se reservará el stock/)).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Aprobar' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.aprobar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido P-001 aprobado')
  })
  it('ARMADOR toma un APROBADO: confirm exacto, PUT tomar y pasa a EN_ARMADO asignado', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get)
      .mockResolvedValueOnce(createPedido({ estado: 'APROBADO' }))
      .mockResolvedValue(createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    fireEvent.click(screen.getByRole('button', { name: 'Tomar' }))
    expect(confirmDialog().getByText('Tomar pedido')).toBeInTheDocument()
    expect(confirmDialog().getByText(/Quedará asignado a vos para el armado/)).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Tomar' }))

    await waitFor(() =>
      expect(aleBetApi.pedidos.tomar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido P-001 tomado')
    await waitFor(() => expect(screen.getByText('En armado')).toBeInTheDocument())
  })

  it('EN_ARMADO vendedor: solicita cancelación con motivo obligatorio', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.cancelar).mockResolvedValue({ pedido: createPedido(), requested: true })
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'EN_ARMADO', vendedorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar cancelación' }))
    expect(screen.getByText('El armador deberá confirmar. La reserva no se libera hasta entonces.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo es obligatorio')
    expect(aleBetApi.pedidos.cancelar).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo debe tener al menos 3 caracteres')

    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Falta stock' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.cancelar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1, motivo: 'Falta stock' },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Solicitud enviada')
  })

  it('EN_ARMADO armador asignado: marca items, espera todos y prepara', async () => {
    mockRol('armador')
    const enArmado = createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1', items: [createPedidoItem({ completado: false })] })
    const completo = createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1', version: 2, items: [createPedidoItem({ completado: true })] })
    const preparado = createPedido({ estado: 'PREPARADO', armadorId: 'sub-1', version: 3, items: [createPedidoItem({ completado: true })] })
    const fixtures = [enArmado, completo, completo, preparado, preparado, preparado, preparado]
    let call = 0
    vi.mocked(aleBetApi.pedidos.get).mockImplementation(() =>
      Promise.resolve(fixtures[Math.min(call++, fixtures.length - 1)]),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    expect(screen.getByText('0 de 1 items preparados')).toBeInTheDocument()
    expect(screen.getByText('Faltan 1 items para poder preparar')).toBeInTheDocument()
    expect(barra().getByText('0/1')).toBeInTheDocument()
    expect(barra().getByRole('button', { name: 'Preparar' })).toBeDisabled()
    expect(barra().getByText('Faltan 1 items')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar preparado' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.completarItem).toHaveBeenCalledWith(
        'pedido-1',
        'item-1',
        { expectedVersion: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    await waitFor(() => expect(screen.getByText('1 de 1 items preparados')).toBeInTheDocument())
    expect(screen.queryByText('Faltan 1 items para poder preparar')).not.toBeInTheDocument()
    expect(barra().getByText('1/1')).toBeInTheDocument()
    expect(barra().getByRole('button', { name: 'Preparar' })).toBeEnabled()

    fireEvent.click(barra().getByRole('button', { name: 'Preparar' }))
    expect(confirmDialog().getByText(/¿Marcar P-001 como preparado\?/)).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Preparar' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.preparar).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 2 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    await waitFor(() => expect(screen.getByText('Preparado')).toBeInTheDocument())
  })

  it('EN_ARMADO armador no asignado no ve acciones de armado', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'EN_ARMADO' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.queryByText('Armado')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preparar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar preparado' })).not.toBeInTheDocument()
  })

  it('PREPARADO sin remito espera a facturación', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'PREPARADO', armadorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.getByText('Esperando remito — Facturación debe emitirlo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).not.toBeInTheDocument()
  })

  it('PREPARADO con remito: despacha una sola vez', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({ estado: 'PREPARADO', armadorId: 'sub-1', remitos: [createRemito()] }),
    )
    let resolveDespacho!: (value: Pedido) => void
    vi.mocked(aleBetApi.pedidos.despachar).mockImplementation(
      () => new Promise<Pedido>((resolve) => { resolveDespacho = resolve }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(barra().getByRole('button', { name: 'Confirmar despacho' }))
    expect(confirmDialog().getByText('Esta acción descontará definitivamente el stock.')).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Despachar' }))
    await waitFor(() => expect(barra().getByRole('button', { name: 'Confirmar despacho' })).toBeDisabled())
    resolveDespacho(createPedido({ estado: 'DESPACHADO', despachadoAt: '2026-07-18T10:00:00.000Z' }))
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido despachado'))
    expect(aleBetApi.pedidos.despachar).toHaveBeenCalledTimes(1)
    expect(aleBetApi.pedidos.despachar).toHaveBeenCalledWith(
      'pedido-1',
      { expectedVersion: 1 },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('DESPACHADO: muestra fecha y no ofrece acciones', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({ estado: 'DESPACHADO', armadorId: 'sub-1', despachadoAt: '2026-07-18T10:00:00.000Z' }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.getByText('Pedido despachado')).toBeInTheDocument()
    expect(screen.getByText(/El 18\/07\/2026/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).not.toBeInTheDocument()
  })

  it('facturación emite remito con transporte habitual', async () => {
    mockRol('facturacion')
    vi.mocked(aleBetApi.pedidos.get)
      .mockResolvedValueOnce(createPedido({ estado: 'APROBADO' }))
      .mockResolvedValueOnce(createPedido({ estado: 'APROBADO', remitos: [createRemito()] }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.queryByRole('button', { name: 'Tomar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Seleccioná un transporte habitual o indicá un transporte ocasional')
    expect(aleBetApi.remitos.emitir).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Seleccionar transporte'), { target: { value: 'trans-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    await waitFor(() =>
      expect(aleBetApi.remitos.emitir).toHaveBeenCalledWith(
        'pedido-1',
        { transportistaId: 'trans-1', expectedVersion: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Remito emitido')
    await waitFor(() => expect(screen.getByText('Remito R-001')).toBeInTheDocument())
    expect(screen.getByText(/Transporte: Transporte A/)).toBeInTheDocument()
  })

  it('facturación valida y emite transporte ocasional', async () => {
    mockRol('facturacion')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'APROBADO' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.change(screen.getByLabelText('Seleccionar transporte'), { target: { value: '__ocasional__' } })

    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El transporte ocasional requiere nombre y dirección de al menos 2 caracteres')

    fireEvent.change(screen.getByLabelText('Nombre del transporte ocasional'), { target: { value: 'Flete Z' } })
    fireEvent.change(screen.getByLabelText('Dirección del transporte ocasional'), { target: { value: 'Ruta 8 km 60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    await waitFor(() =>
      expect(aleBetApi.remitos.emitir).toHaveBeenCalledWith(
        'pedido-1',
        { transporteOcasional: { nombre: 'Flete Z', direccion: 'Ruta 8 km 60' }, expectedVersion: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Remito emitido')
  })

  it('facturación descarga y anula el remito vigente', async () => {
    mockRol('facturacion')
    const vigente = createPedido({ estado: 'PREPARADO', remitos: [createRemito()] })
    const invalidado = createPedido({
      estado: 'PREPARADO',
      remitos: [createRemito({ estado: 'INVALIDADO', motivoInvalidacion: 'Error de carga', invalidadoAt: '2026-07-17T12:00:00.000Z' })],
    })
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValueOnce(vigente).mockResolvedValueOnce(invalidado)
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:mock') })
    vi.spyOn(window, 'open').mockReturnValue(null)
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    expect(screen.getByText('Remito R-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    await waitFor(() => expect(aleBetApi.remitos.pdf).toHaveBeenCalledWith('pedido-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Anular' }))
    expect(screen.getByText('El remito dejará de estar vigente y podrá emitirse uno nuevo.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Anular remito' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo es obligatorio')
    expect(aleBetApi.remitos.anular).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Error de carga' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anular remito' }))
    await waitFor(() =>
      expect(aleBetApi.remitos.anular).toHaveBeenCalledWith(
        'pedido-1',
        'remito-1',
        { motivo: 'Error de carga' },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Remito anulado')
    await waitFor(() => expect(screen.getByText('Remitos anteriores')).toBeInTheDocument())
    expect(screen.getByText('Anulado')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Error de carga')).toBeInTheDocument()
  })

  it('409 stock: conserva el carrito y muestra el mensaje del servidor', async () => {
    vi.mocked(aleBetApi.pedidos.update).mockRejectedValue(
      new ApiError(409, 'Stock insuficiente para reservar producto prod-1. Disponible: 5u, solicitado: 25u'),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(within(linea('prod-1')).getByRole('button', { name: 'Sumar cajas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Stock insuficiente para reservar producto prod-1. Disponible: 5u, solicitado: 25u',
      ),
    )
    expect(linea('prod-1')).toHaveTextContent('25 unidades')
    await waitFor(() => expect(aleBetApi.productos.list).toHaveBeenCalledTimes(2))
  })

  it('409 versión: recarga el pedido con el toast del spec', async () => {
    vi.mocked(aleBetApi.pedidos.get)
      .mockResolvedValueOnce(createPedido())
      .mockResolvedValueOnce(createPedido({ version: 2 }))
    vi.mocked(aleBetApi.pedidos.update).mockRejectedValue(
      new ApiError(409, 'La versión del pedido cambió; actualizá antes de reintentar'),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.click(within(linea('prod-1')).getByRole('button', { name: 'Sumar cajas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('La versión del pedido cambió; se recargó. Reintentá.'),
    )
    await waitFor(() => expect(aleBetApi.pedidos.get).toHaveBeenCalledTimes(2))
  })

  it('banner de cancelación: armador asignado confirma con motivo precargado', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({
        estado: 'EN_ARMADO',
        armadorId: 'sub-1',
        cancelacionSolicitadaAt: '2026-07-17T09:00:00.000Z',
        cancelacionSolicitadaPor: 'vendedor-1',
        motivoCancelacion: 'Falta producto',
      }),
    )
    renderDetalle()
    const banner = await screen.findByTestId('banner-cancelacion')
    expect(within(banner).getByText('Cancelación solicitada')).toBeInTheDocument()
    expect(within(banner).getByText('Motivo: Falta producto')).toBeInTheDocument()

    fireEvent.click(within(banner).getByRole('button', { name: 'Confirmar cancelación' }))
    expect(within(sheet()).getByLabelText('Motivo')).toHaveValue('Falta producto')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Confirmar cancelación' }))
    await waitFor(() =>
      expect(aleBetApi.pedidos.confirmarCancelacion).toHaveBeenCalledWith(
        'pedido-1',
        { expectedVersion: 1, motivo: 'Falta producto' },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido cancelado')
  })

  it('banner de cancelación: vendedor ve espera de confirmación', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({
        estado: 'EN_ARMADO',
        vendedorId: 'sub-1',
        cancelacionSolicitadaAt: '2026-07-17T09:00:00.000Z',
        cancelacionSolicitadaPor: 'vendedor-1',
        motivoCancelacion: 'Falta producto',
      }),
    )
    renderDetalle()
    const banner = await screen.findByTestId('banner-cancelacion')
    expect(within(banner).getByText('Esperando confirmación del armador')).toBeInTheDocument()
    expect(within(banner).queryByRole('button', { name: 'Confirmar cancelación' })).not.toBeInTheDocument()
  })

  it('barra sticky del armador (mobile): APROBADO → Tomar pedido sin duplicar en desktop', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'APROBADO' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    const bar = screen.getByTestId('armador-action-bar')
    expect(bar.className).toMatch(/\bfixed\b/)
    expect(bar.className).toContain('lg:hidden')
    expect(bar.className).toMatch(/z-40/)
    expect(barra().getByRole('button', { name: 'Tomar pedido' }).className).toContain('min-h-11')

    const tomarDesktop = screen.getByTestId('accion-tomar-desktop')
    expect(tomarDesktop.className).toContain('hidden')
    expect(tomarDesktop.className).toContain('lg:block')
  })

  it('barra sticky del armador (mobile): EN_ARMADO → progreso compacto y Preparar con faltantes', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1', items: [createPedidoItem({ completado: false })] }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    expect(barra().getByText('0/1')).toBeInTheDocument()
    expect(barra().getByRole('button', { name: 'Preparar' })).toBeDisabled()
    expect(barra().getByText('Faltan 1 items')).toBeInTheDocument()

    const armadoDesktop = screen.getByText('Armado').closest('section')
    expect(armadoDesktop?.className).toContain('hidden')
    expect(armadoDesktop?.className).toContain('lg:block')
  })

  it('barra sticky del armador (mobile): PREPARADO con remito → Confirmar despacho', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({ estado: 'PREPARADO', armadorId: 'sub-1', remitos: [createRemito()] }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    expect(barra().getByRole('button', { name: 'Confirmar despacho' })).toBeInTheDocument()
    const despacharDesktop = screen.getByTestId('accion-despachar-desktop')
    expect(despacharDesktop.className).toContain('hidden')
    expect(despacharDesktop.className).toContain('lg:block')
  })

  it('barra sticky del armador (mobile): cancelación solicitada → Confirmar cancelación', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(
      createPedido({
        estado: 'EN_ARMADO',
        armadorId: 'sub-1',
        cancelacionSolicitadaAt: '2026-07-17T09:00:00.000Z',
        cancelacionSolicitadaPor: 'vendedor-1',
        motivoCancelacion: 'Falta producto',
      }),
    )
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    expect(barra().getByRole('button', { name: 'Confirmar cancelación' })).toBeInTheDocument()
    const cancelarDesktop = screen.getByTestId('accion-cancelacion-desktop')
    expect(cancelarDesktop.className).toContain('hidden')
    expect(cancelarDesktop.className).toContain('lg:block')
  })

  it('barra sticky del armador: Tomar pedido desde la barra confirma y llama a la API', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.get)
      .mockResolvedValueOnce(createPedido({ estado: 'APROBADO' }))
      .mockResolvedValue(createPedido({ estado: 'EN_ARMADO', armadorId: 'sub-1' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')

    fireEvent.click(barra().getByRole('button', { name: 'Tomar pedido' }))
    expect(confirmDialog().getByText(/Quedará asignado a vos para el armado/)).toBeInTheDocument()
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Tomar' }))
    await waitFor(() => expect(aleBetApi.pedidos.tomar).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('En armado')).toBeInTheDocument())
  })

  it('transporte ocasional inválido: toast global, foco en el primer campo y no emite', async () => {
    mockRol('facturacion')
    vi.mocked(aleBetApi.pedidos.get).mockResolvedValue(createPedido({ estado: 'APROBADO' }))
    renderDetalle()
    await screen.findByTestId('pedido-numero')
    fireEvent.change(screen.getByLabelText('Seleccionar transporte'), { target: { value: '__ocasional__' } })

    fireEvent.change(screen.getByLabelText('Nombre del transporte ocasional'), { target: { value: 'F' } })
    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El transporte ocasional requiere nombre y dirección de al menos 2 caracteres',
    )
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Completá nombre y dirección del transporte ocasional')
    expect(screen.getByLabelText('Nombre del transporte ocasional')).toHaveFocus()
    expect(aleBetApi.remitos.emitir).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Nombre del transporte ocasional'), { target: { value: 'Flete Z' } })
    fireEvent.change(screen.getByLabelText('Dirección del transporte ocasional'), { target: { value: 'R' } })
    fireEvent.click(screen.getByRole('button', { name: 'Emitir remito' }))
    expect(screen.getByLabelText('Dirección del transporte ocasional')).toHaveFocus()
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(2)
    expect(aleBetApi.remitos.emitir).not.toHaveBeenCalled()
  })
})
