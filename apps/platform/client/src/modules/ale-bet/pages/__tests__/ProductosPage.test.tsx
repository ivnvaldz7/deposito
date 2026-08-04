import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { createMockUser } from '@/test-utils'
import ProductosPage from '../ProductosPage'
import { createLote, createProductoList } from './fixtures/ale-bet-mock-factories'

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

  it('renders catalog with products and stock breakdown', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })
    const table = within(screen.getByTestId('productos-table'))
    expect(table.getByText('Producto A')).toBeInTheDocument()
    expect(table.getByText('Producto B')).toBeInTheDocument()

    expect(screen.getAllByText(/Disponible/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Reservado \d+/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Físico 500/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Stock bajo').length).toBeGreaterThanOrEqual(1)
  })

  it('vendedor: read-only, no create/edit/delete/lotes actions', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })

    expect(screen.getAllByText(/Disponible/).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('button', { name: '+ Nuevo producto' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'Editar' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Eliminar' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Configurar Lotes' })).toHaveLength(0)
  })

  it('admin: sees create/edit/delete/lotes actions and opens the lotes modal', async () => {
    vi.mocked(aleBetApi.productos.list).mockResolvedValue(createProductoList())
    vi.mocked(aleBetApi.productos.lotes.list).mockResolvedValue([createLote()])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Productos')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: '+ Nuevo producto' })).toBeInTheDocument()

    // Expand row to see action buttons
    fireEvent.click(screen.getAllByText('Producto A')[0])

    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: 'Eliminar' }).length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Configurar Lotes' })[0])
    await waitFor(() => expect(screen.getByText('L-2024-001')).toBeInTheDocument())
  })
})
