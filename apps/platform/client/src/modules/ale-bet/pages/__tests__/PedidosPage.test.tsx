import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import { toast } from '@/lib/toast'
import PedidosPage from '../PedidosPage'
import {
  createClientePendiente,
  createPedido,
  createPedidoItem,
  createPedidoList,
  createRemito,
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

function mockRol(rol: string) {
  const user = createMockUser({ apps: { 'ale-bet': { rol, activo: true } } })
  ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (state: { user: typeof user; token: string }) => unknown) =>
      selector({ user, token: 'token' }),
  )
}

function renderPedidos() {
  return render(
    <MemoryRouter initialEntries={['/ale-bet/pedidos']}>
      <Routes>
        <Route path="/ale-bet/pedidos" element={<PedidosPage />} />
        <Route path="/ale-bet/pedidos/nuevo" element={<div>NuevoPedido</div>} />
        <Route path="/ale-bet/pedidos/:id" element={<DetalleStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PedidosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue(createPedidoList())
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.pedidos.list).mockReturnValue(new Promise(() => {}))
    renderPedidos()
    expect(screen.getByText('Cargando pedidos...')).toBeInTheDocument()
  })

  it('navigates to new order page when clicking Nuevo pedido CTA', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByText('P-001')).toBeInTheDocument())

    const btn = screen.getByRole('button', { name: '+ Nuevo pedido' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)

    expect(screen.getByText('NuevoPedido')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockRejectedValue(new Error('Error'))
    renderPedidos()
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders orders list with status badges', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByText('P-001')).toBeInTheDocument())
    expect(screen.getByText('P-002')).toBeInTheDocument()
    expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Aprobado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 items · 10 unidades').length).toBeGreaterThan(0)
  })

  it('shows card with estado badge, cliente pendiente badge and items/units summary', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ cliente: createClientePendiente(), items: [createPedidoItem({ cantidad: 25 })] }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(within(card).getByText('Borrador')).toBeInTheDocument()
    expect(within(card).getByText('Cliente pendiente')).toBeInTheDocument()
    expect(within(card).getByText('1 items · 25 unidades')).toBeInTheDocument()
    expect(within(card).getByText('Cliente')).toBeInTheDocument()
    expect(within(card).getByText('Vendedor')).toBeInTheDocument()
    expect(within(card).getByText(/^Actualizado \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument()
  })

  it('filters by estado chip (BORRADOR shows only BORRADOR)', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByText('P-001')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Borrador' }))

    expect(screen.getByText('P-001')).toBeInTheDocument()
    expect(screen.queryByText('P-002')).not.toBeInTheDocument()
  })

  it('ARMADOR: orders APROBADO, own EN_ARMADO, PREPARADO, rest and shows only allowed actions', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p-prep', numero: 'P-PREP', estado: 'PREPARADO', remitos: [createRemito()], updatedAt: '2026-07-16T10:00:00.000Z' }),
      createPedido({ id: 'p-otro-arm', numero: 'P-OTRO', estado: 'EN_ARMADO', armadorId: 'otro-user', updatedAt: '2026-07-18T10:00:00.000Z' }),
      createPedido({ id: 'p-propio', numero: 'P-PROPIO', estado: 'EN_ARMADO', armadorId: 'sub-1', items: [createPedidoItem({ completado: true })], updatedAt: '2026-07-15T10:00:00.000Z' }),
      createPedido({ id: 'p-aprobado', numero: 'P-APROB', estado: 'APROBADO', updatedAt: '2026-07-14T10:00:00.000Z' }),
    ])
    renderPedidos()

    const cards = await screen.findAllByTestId(/^pedido-card-/)
    expect(cards).toHaveLength(4)
    expect(cards[0]).toHaveTextContent('P-APROB')
    expect(cards[1]).toHaveTextContent('P-PROPIO')
    expect(cards[2]).toHaveTextContent('P-PREP')
    expect(cards[3]).toHaveTextContent('P-OTRO')

    const cardAprobado = screen.getByTestId('pedido-card-p-aprobado')
    expect(within(cardAprobado).getByRole('button', { name: 'Tomar' })).toBeInTheDocument()

    const cardPropio = screen.getByTestId('pedido-card-p-propio')
    const botonPreparar = within(cardPropio).getByRole('button', { name: 'Preparar' })
    expect(botonPreparar).toBeEnabled()

    const cardPrep = screen.getByTestId('pedido-card-p-prep')
    expect(within(cardPrep).getByRole('button', { name: 'Confirmar despacho' })).toBeInTheDocument()
    expect(within(cardPrep).getByText('Remito vigente')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Emitir remito' })).not.toBeInTheDocument()
  })

  it('ARMADOR: PREPARAR disabled with hint when items are pending', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p-propio', numero: 'P-PROPIO', estado: 'EN_ARMADO', armadorId: 'sub-1', items: [createPedidoItem()] }),
    ])
    renderPedidos()

    const card = await screen.findByTestId('pedido-card-p-propio')
    const botonPreparar = within(card).getByRole('button', { name: 'Preparar' })
    expect(botonPreparar).toBeDisabled()
    expect(within(card).getByText('Faltan 1 items')).toBeInTheDocument()
  })

  it('VENDEDOR: APROBAR on own BORRADOR (disabled if cliente pendiente) and CANCELAR, no armado actions', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p-borrador', numero: 'P-BORR', estado: 'BORRADOR', vendedorId: 'sub-1' }),
      createPedido({ id: 'p-pendiente', numero: 'P-PEND', estado: 'BORRADOR', vendedorId: 'sub-1', cliente: createClientePendiente() }),
      createPedido({ id: 'p-aprobado', numero: 'P-APROB', estado: 'APROBADO', vendedorId: 'sub-1' }),
    ])
    renderPedidos()

    await screen.findByTestId('pedido-card-p-borrador')

    const cardBorrador = screen.getByTestId('pedido-card-p-borrador')
    const botonAprobar = within(cardBorrador).getByRole('button', { name: 'Aprobar' })
    expect(botonAprobar).toBeEnabled()
    expect(within(cardBorrador).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

    const cardPendiente = screen.getByTestId('pedido-card-p-pendiente')
    expect(within(cardPendiente).getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(within(cardPendiente).getByText('Facturación debe validar el cliente')).toBeInTheDocument()

    const cardAprobado = screen.getByTestId('pedido-card-p-aprobado')
    expect(within(cardAprobado).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Tomar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preparar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Emitir remito' })).not.toBeInTheDocument()
  })

  it('FACTURACION: sees EMITIR REMITO (navigates to detail), no other actions', async () => {
    mockRol('facturacion')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p-aprobado', numero: 'P-APROB', estado: 'APROBADO' }),
    ])
    renderPedidos()

    const card = await screen.findByTestId('pedido-card-p-aprobado')
    const botonEmitir = within(card).getByRole('button', { name: 'Emitir remito' })
    fireEvent.click(botonEmitir)

    await waitFor(() => expect(screen.getByText('Detalle:p-aprobado')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Tomar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preparar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar despacho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  it('tap on card navigates to /ale-bet/pedidos/:id', async () => {
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')

    fireEvent.click(card)

    await waitFor(() => expect(screen.getByText('Detalle:pedido-1')).toBeInTheDocument())
  })

  it('despacho confirmation shows exact warning and calls despachar once with expectedVersion', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'p-prep', numero: 'P-PREP', estado: 'PREPARADO', remitos: [createRemito()] }),
    ])
    vi.mocked(aleBetApi.pedidos.despachar).mockResolvedValue(createPedido({ estado: 'DESPACHADO' }))
    renderPedidos()

    const card = await screen.findByTestId('pedido-card-p-prep')
    fireEvent.click(within(card).getByRole('button', { name: 'Confirmar despacho' }))

    const dialog = screen.getByTestId('confirm-dialog')
    expect(dialog).toHaveTextContent('Esta acción descontará definitivamente el stock.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }))

    await waitFor(() => expect(aleBetApi.pedidos.despachar).toHaveBeenCalledTimes(1))
    expect(aleBetApi.pedidos.despachar).toHaveBeenCalledWith('p-prep', { expectedVersion: 1 }, undefined)
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Pedido despachado'))
  })
})
