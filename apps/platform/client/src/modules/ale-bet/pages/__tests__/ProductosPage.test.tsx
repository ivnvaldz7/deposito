import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import ProductosPage from '../ProductosPage'
import { createProductoList } from './fixtures/ale-bet-mock-factories'
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

describe('ProductosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.productos.list).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ProductosPage /></MemoryRouter>)
    expect(screen.getByText('Cargando productos...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.productos.list).mockRejectedValue(new Error('Error al cargar productos'))
    render(<MemoryRouter><ProductosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error al cargar productos')).toBeInTheDocument())
  })

  it('renders catalog table with products', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    render(<MemoryRouter><ProductosPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })
    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('Producto B')).toBeInTheDocument()
    expect(screen.getByText('SKU-001')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getAllByText('Stock bajo').length).toBeGreaterThanOrEqual(1)
  })
})
