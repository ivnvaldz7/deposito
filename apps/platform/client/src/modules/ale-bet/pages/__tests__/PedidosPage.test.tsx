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
    await waitFor(() => expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument())

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

  it('filters by estado chip (BORRADOR shows only BORRADOR)', async () => {
    renderPedidos()
    await waitFor(() => expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Borrador' }))

    expect(screen.getByTestId('pedido-card-pedido-1')).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-card-pedido-2')).not.toBeInTheDocument()
  })


})
