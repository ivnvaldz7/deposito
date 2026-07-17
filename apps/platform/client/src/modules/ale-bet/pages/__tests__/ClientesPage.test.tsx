import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import ClientesPage from '../ClientesPage'
import { createClienteList } from './fixtures/ale-bet-mock-factories'
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

describe('ClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.clientes.list).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ClientesPage /></MemoryRouter>)
    expect(screen.getByText('Cargando clientes...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.clientes.list).mockRejectedValue(new Error('Error al cargar clientes'))
    render(<MemoryRouter><ClientesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error al cargar clientes')).toBeInTheDocument())
  })

  it('renders clients list', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue(createClienteList())
    render(<MemoryRouter><ClientesPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Clientes')).toBeInTheDocument()
    })
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([])
    render(<MemoryRouter><ClientesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay clientes.')).toBeInTheDocument())
  })
})
