import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import PedidosPage from '../PedidosPage'
import { createPedidoList, createClienteList, createProductoList } from './fixtures/ale-bet-mock-factories'
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

describe('PedidosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser({ apps: { 'ale-bet': { rol: 'admin', activo: true } } }),
      token: 'token',
    })
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.pedidos.list).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><PedidosPage /></MemoryRouter>)
    expect(screen.getByText('Cargando pedidos...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><PedidosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders orders list with status badges', async () => {
    vi.mocked(aleBetApi.pedidos.list).mockResolvedValue(createPedidoList())
    render(<MemoryRouter><PedidosPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument()
    })
    expect(screen.getByText('P-001')).toBeInTheDocument()
    expect(screen.getByText('P-002')).toBeInTheDocument()
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument()
    expect(screen.getByText('APROBADO')).toBeInTheDocument()
  })
})
