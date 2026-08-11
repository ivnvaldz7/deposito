import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import EtiquetasPage from '../EtiquetasPage'
import { createEtiquetaList } from './fixtures/deposito-mock-factories'
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

describe('EtiquetasPage', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: ReturnType<typeof createMockUser>; token: string }) => unknown) => selector({ user: createMockUser(), token: 'token' }))
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar las etiquetas')).toBeInTheDocument())
  })

  it('renders table with items', async () => {
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Etiquetas' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('ETIQ AMANTINA 250 ML').length).toBeGreaterThanOrEqual(1)
  })

  it('filters by market and synchronizes the URL', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <output aria-label="Current location">{location.search}</output>
    }
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/deposito/etiquetas']}><EtiquetasPage /><LocationProbe /></MemoryRouter>)

    await screen.findByRole('heading', { name: 'Etiquetas' })
    await user.click(screen.getByRole('button', { name: 'México (1)' }))

    expect(screen.queryByText('ETIQ AMANTINA 250 ML')).not.toBeInTheDocument()
    expect(screen.getAllByText('ETIQ AMANTINA 500 ML').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('Current location')).toHaveTextContent('?mercado=mexico')
  })

  it('hides write actions from observers', async () => {
    const observer = createMockUser({ apps: { deposito: { rol: 'observador', activo: true } } })
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: typeof observer; token: string }) => unknown) => selector({ user: observer, token: 'token' }))
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Etiquetas' })
    expect(screen.queryByRole('button', { name: 'Agregar etiqueta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar ETIQ/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar ETIQ/ })).not.toBeInTheDocument()
  })

  it('opens/cancels add and opens edit with the selected item', async () => {
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    const user = userEvent.setup()
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Etiquetas' })

    await user.click(screen.getByRole('button', { name: 'Agregar etiqueta' }))
    expect(screen.getByRole('heading', { name: 'Agregar etiqueta' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const edit = screen.getAllByRole('button', { name: 'Editar ETIQ AMANTINA 250 ML' })[0]
    expect(edit).toHaveClass('size-9')
    await user.click(edit)
    expect(screen.getByRole('heading', { name: 'Editar etiqueta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Artículo')).toHaveValue('ETIQ AMANTINA 250 ML')
  })

  it('deletes the selected item and retains product-focus targets', async () => {
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    vi.mocked(api.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Etiquetas' })
    await user.click(screen.getAllByRole('button', { name: 'Eliminar ETIQ AMANTINA 250 ML' })[0])
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/etiquetas/etiqueta-1'))
    expect(container.querySelectorAll('[data-product-focus-id="etiqueta-1"]')).toHaveLength(2)
  })
  it('renders a selected product despite a conflicting market filter', async () => {
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    render(<MemoryRouter initialEntries={['/deposito/etiquetas?mercado=argentina&producto=ETIQ%20AMANTINA%20500%20ML&focus=1']}><EtiquetasPage /></MemoryRouter>)
    expect((await screen.findAllByText('ETIQ AMANTINA 500 ML')).length).toBeGreaterThan(0)
  })

  it('shows not found for a catalog product absent from inventory', async () => {
    vi.mocked(api.get).mockResolvedValue(createEtiquetaList())
    render(<MemoryRouter initialEntries={['/deposito/etiquetas?productoId=missing&producto=CATALOGO%20SIN%20STOCK&focus=1']}><EtiquetasPage /></MemoryRouter>)
    expect(await screen.findByText(/No se encontr.*etiqueta con los filtros aplicados/)).toBeInTheDocument()
    expect(screen.queryByText('ETIQ AMANTINA 250 ML')).not.toBeInTheDocument()
  })

})
