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
import { ESTADO_META } from '../../lib/estados'

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

  it('does not expose legacy new-order CTA', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: '+ Nuevo pedido' })).not.toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockRejectedValue(new Error('Error'))
    renderPedidos()
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders orders list with status badges', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument())
    expect(screen.getByTestId('pedido-card-pedido-2')).toBeInTheDocument()
    expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Aprobado').length).toBeGreaterThan(0)
  })

  it('shows card with estado badge, cliente pendiente badge and items/units summary', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ cliente: createClientePendiente(), items: [createPedidoItem({ cantidad: 25 })] }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(within(card).getByText('Borrador')).toBeInTheDocument()
    expect(within(card).getByText('Pendiente de validación')).toBeInTheDocument()
  })

  it('does not render legacy state filters', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Borrador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solo hoy' })).not.toBeInTheDocument()
  })
})

// =============================================================================
// SEMANTIC CARD STYLES — UI-01
// We test observable behavior: data-estado attribute, badge presence, operative
// label text. We do NOT assert specific hex colors (pixel-perfect rule).
// =============================================================================

describe('PedidoCard — semantic state styles (UI-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
  })

  it('APROBADO: card has data-estado APROBADO, badge visible, operative label visible', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'APROBADO' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'APROBADO')
    // Badge (secondary indicator — accessibility must remain)
    expect(within(card).getByText('Aprobado')).toBeInTheDocument()
    // Operative label
    expect(within(card).getByText('Pendiente de armado')).toBeInTheDocument()
    // Client name still readable (high contrast — not hidden or zeroed)
    expect(within(card).getByText('Cliente A')).toBeInTheDocument()
  })

  it('AUTOMATION APROBADO is confirmed/documentary, never pending Armador or missing seller', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'APROBADO', origen: 'AUTOMATION', vendedorId: null, vendedorNombre: undefined, remitos: [] }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(within(card).getByText('Automation · Confirmado')).toBeInTheDocument()
    expect(within(card).getByText('Pendiente de remito')).toBeInTheDocument()
    expect(within(card).queryByText('Pendiente de armado')).not.toBeInTheDocument()
    expect(within(card).queryByText('Vendedor sin asignar')).not.toBeInTheDocument()
    expect(within(card).queryByText('Aprobado')).not.toBeInTheDocument()
  })

  it('Facturación uses the pending-remito tray without legacy filters or Nuevo pedido', async () => {
    mockRol('facturacion')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'APROBADO', origen: 'AUTOMATION', vendedorId: null, remitos: [] }),
    ])
    renderPedidos()
    await screen.findByTestId('pedido-card-pedido-1')
    expect(aleBetApi.pedidos.list).toHaveBeenCalledWith({ bandeja: 'FACTURACION' })
    expect(screen.getByText('Pendientes de remito')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Nuevo pedido' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobado' })).not.toBeInTheDocument()
  })

  it('Armador only sees manual workflow orders', async () => {
    mockRol('armador')
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ id: 'manual', estado: 'APROBADO', origen: 'MANUAL' }),
      createPedido({ id: 'automation', estado: 'APROBADO', origen: 'AUTOMATION', vendedorId: null }),
    ])
    renderPedidos()
    expect(await screen.findByTestId('pedido-card-manual')).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-card-automation')).not.toBeInTheDocument()
  })

  it('EN_ARMADO: card has data-estado EN_ARMADO, badge visible, operative label visible', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'EN_ARMADO' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'EN_ARMADO')
    expect(within(card).getByText('En armado')).toBeInTheDocument()
    expect(within(card).getByText('En preparación')).toBeInTheDocument()
    expect(within(card).getByText('Cliente A')).toBeInTheDocument()
  })

  it('PREPARADO sin remito: card has data-estado PREPARADO, badge visible, "Esperando remito" label', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'PREPARADO' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'PREPARADO')
    expect(within(card).getByText('Preparado')).toBeInTheDocument()
    expect(within(card).getByText('Esperando remito')).toBeInTheDocument()
    expect(within(card).getByText('Cliente A')).toBeInTheDocument()
  })

  it('PREPARADO con remito vigente: label is "Listo para despacho"', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'PREPARADO', remitos: [createRemito()] }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(within(card).getByText('Listo para despacho')).toBeInTheDocument()
  })

  it('DESPACHADO: card has data-estado DESPACHADO, badge visible, no cancelled styling', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'DESPACHADO' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'DESPACHADO')
    expect(within(card).getByText('Despachado')).toBeInTheDocument()
    // DESPACHADO is NOT cancelled — should not have grayscale class
    expect(card.className).not.toContain('grayscale')
  })

  it('CANCELADO: card has data-estado CANCELADO, badge visible, grayscale+opacity applied', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'CANCELADO' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'CANCELADO')
    expect(within(card).getByText('Cancelado')).toBeInTheDocument()
    // Cancelled orders get muted visual treatment
    expect(card.className).toContain('grayscale')
    expect(card.className).toContain('opacity-60')
  })

  it('BORRADOR: card has data-estado BORRADOR, badge visible, no operative label', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue([
      createPedido({ estado: 'BORRADOR' }),
    ])
    renderPedidos()
    const card = await screen.findByTestId('pedido-card-pedido-1')
    expect(card).toHaveAttribute('data-estado', 'BORRADOR')
    expect(within(card).getByText('Borrador')).toBeInTheDocument()
    expect(within(card).getByText('Cliente A')).toBeInTheDocument()
    // Borrador has no operative label
    expect(within(card).queryByText('Pendiente de armado')).not.toBeInTheDocument()
    expect(within(card).queryByText('En preparación')).not.toBeInTheDocument()
  })

  it('ESTADO_META has card style defined for all states', () => {
    const states = ['BORRADOR', 'APROBADO', 'EN_ARMADO', 'PREPARADO', 'DESPACHADO', 'CANCELADO'] as const
    for (const estado of states) {
      const meta = ESTADO_META[estado]
      expect(meta.card, `${estado} must have card style`).toBeDefined()
      expect(meta.card.bg, `${estado}.card.bg must be set`).toBeTruthy()
      expect(meta.card.border, `${estado}.card.border must be set`).toBeTruthy()
      expect(meta.card.accent, `${estado}.card.accent must be set`).toBeTruthy()
      expect(meta.card.bgHover, `${estado}.card.bgHover must be set`).toBeTruthy()
      expect(meta.card.borderHover, `${estado}.card.borderHover must be set`).toBeTruthy()
    }
  })
})

