import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithQueryClient as render } from '@/test-utils'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import DrogasPage from '../DrogasPage'
import { createDrogaRecords } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('../../lib/toast', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../lib/catalogo-productos', () => ({
  fetchCatalogoProductos: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ can: vi.fn().mockReturnValue(true) }))

describe('DrogasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText(/no se pudo cargar/i)).toBeInTheDocument())
  })

  it('renders grouped lotes list', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/drogas')) return createDrogaRecords()
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.getByText('Drogas', { selector: 'h1' })).toBeInTheDocument()
    expect(screen.getAllByText(/paracetamol/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Ibuprofeno/i)[0]).toBeInTheDocument()
  })

  it('shows an explicit empty state for a selected catalog product absent from inventory', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/drogas')) return createDrogaRecords()
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    render(<MemoryRouter initialEntries={['/deposito/drogas?productoId=missing&producto=CATALOGO%20SIN%20STOCK&focus=1']}><DrogasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument())
    expect(screen.queryByText(/paracetamol/i)).not.toBeInTheDocument()
  })

  it('is strictly a read-only view with no CRUD actions', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/drogas')) return createDrogaRecords()
      return []
    })
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByTitle(/Eliminar/i)).not.toBeInTheDocument()
  })

  it('inicialmente ninguna fila expandida, click fila A expande solo A, click B expande B y cierra A, click B cierra todas (incluso con filas Sin Lote)', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/drogas')) {
        return [
          { id: '', productoId: 'prod-citrico', nombre: 'ÁCIDO CÍTRICO', lote: null, vencimiento: null, cantidad: 0, updatedAt: '2026-07-17T10:00:00.000Z' },
          { id: '', productoId: 'prod-oleico', nombre: 'ÁCIDO OLEICO', lote: null, vencimiento: null, cantidad: 0, updatedAt: '2026-07-17T10:00:00.000Z' },
        ]
      }
      return []
    })
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })

    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const rowA = rows[0]
    const rowB = rows[1]

    // 1. inicialmente ninguna fila expandida
    expect(rowA).toHaveAttribute('aria-expanded', 'false')
    expect(rowB).toHaveAttribute('aria-expanded', 'false')

    // 2. click fila A → solo A expandida
    fireEvent.click(rowA)
    expect(rowA).toHaveAttribute('aria-expanded', 'true')
    expect(rowB).toHaveAttribute('aria-expanded', 'false')
    
    // Verificamos que el DOM real solo tiene un panel de detalle expandido por vista (2 en total)
    expect(screen.getAllByText(/Fecha de ingreso|Ingreso/).length).toBe(2)

    // 3. click fila B → A cerrada, B expandida
    fireEvent.click(rowB)
    expect(rowA).toHaveAttribute('aria-expanded', 'false')
    expect(rowB).toHaveAttribute('aria-expanded', 'true')
    
    expect(screen.getAllByText(/Fecha de ingreso|Ingreso/).length).toBe(2)

    // 4. click B otra vez → ninguna expandida
    fireEvent.click(rowB)
    expect(rowA).toHaveAttribute('aria-expanded', 'false')
    expect(rowB).toHaveAttribute('aria-expanded', 'false')
    
    expect(screen.queryByText(/Fecha de ingreso|Ingreso/)).not.toBeInTheDocument()
  })

  it('shows Carga inicial button which opens the modal with catalog products', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/drogas')) return []
      return []
    })
    
    // Mock the catalog to return some products
    const fetchCatalogo = vi.mocked(await import('../../lib/catalogo-productos')).fetchCatalogoProductos
    fetchCatalogo.mockResolvedValue([
      { id: 'prod-1', nombreCompleto: 'Droga Catalogada 1', categoria: 'droga' }
    ])
    
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    
    // Wait for button to be enabled (catalog loaded)
    const button = await screen.findByRole('button', { name: 'Carga inicial' })
    expect(button).toBeInTheDocument()
    expect(button).toBeEnabled() // canManage is true by default in mock
    
    // Open modal
    fireEvent.click(button)
    
    // Wait for modal to open
    const modalTitle = await screen.findByRole('heading', { name: 'Carga inicial' })
    expect(modalTitle).toBeInTheDocument()
    
    // Verify catalog items are in the inventario select
    const inventarioSelect = screen.getByLabelText('Producto')
    expect(inventarioSelect).toBeInTheDocument()
    
    const option = await screen.findByRole('option', { name: 'Droga Catalogada 1' })
    expect(option).toBeInTheDocument()
    expect(option).toHaveAttribute('value', 'prod-1')
  })
})
