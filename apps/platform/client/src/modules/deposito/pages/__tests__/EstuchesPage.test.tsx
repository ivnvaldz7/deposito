import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import EstuchesPage from '../EstuchesPage'
import { createEstucheList } from './fixtures/deposito-mock-factories'
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

describe('EstuchesPage', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: ReturnType<typeof createMockUser>; token: string }) => unknown) => selector({ user: createMockUser(), token: 'token' }))
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar los estuches')).toBeInTheDocument())
  })

  it('renders table with items', async () => {
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Estuches' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('AMANTINA PREMIUM 250 ML').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the selected market filter in the URL', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <output aria-label="Current location">{location.search}</output>
    }

    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/deposito/estuches']}>
        <EstuchesPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Estuches' })
    await user.click(screen.getByRole('button', { name: 'Colombia (1)' }))

    expect(screen.queryByText('AMANTINA PREMIUM 250 ML')).not.toBeInTheDocument()
    expect(screen.getAllByText('AMANTINA PREMIUM 500 ML').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('Current location')).toHaveTextContent('?mercado=colombia')
  })

  it('opens, cancels and submits the add dialog', async () => {
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    vi.mocked(api.post).mockResolvedValue({ ...createEstucheList()[0], id: 'created', articulo: 'NUEVO ESTUCHE', cantidad: 80 })
    const user = userEvent.setup()
    render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Estuches' })

    await user.click(screen.getByRole('button', { name: 'Agregar estuche' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar estuche' }))
    await user.type(screen.getByLabelText('Artículo'), 'NUEVO ESTUCHE')
    await user.type(screen.getByLabelText('Cantidad inicial'), '80')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/estuches', {
      articulo: 'NUEVO ESTUCHE', mercado: 'argentina', cantidad: 80,
    }))
  })

  it('opens edit, deletes, and exposes product focus targets', async () => {
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    vi.mocked(api.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Estuches' })

    const edit = screen.getAllByRole('button', { name: 'Editar AMANTINA PREMIUM 250 ML' })[0]
    expect(edit).toHaveClass('size-9')
    await user.click(edit)
    expect(screen.getByRole('heading', { name: 'Editar estuche' })).toBeInTheDocument()
    expect(screen.getByLabelText('Artículo')).toHaveValue('AMANTINA PREMIUM 250 ML')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    await user.click(screen.getAllByRole('button', { name: 'Eliminar AMANTINA PREMIUM 250 ML' })[0])
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/estuches/estuche-1'))
    expect(container.querySelectorAll('[data-product-focus-id="estuche-1"]')).toHaveLength(2)
  })

  it('hides all write controls from observers', async () => {
    const observer = createMockUser({ apps: { deposito: { rol: 'observador', activo: true } } })
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: typeof observer; token: string }) => unknown) => selector({ user: observer, token: 'token' }))
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    render(<MemoryRouter><EstuchesPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Estuches' })
    expect(screen.queryByRole('button', { name: 'Agregar estuche' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar AMANTINA/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar AMANTINA/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar cantidad' })).not.toBeInTheDocument()
  })
  it('renders and focuses a selected product despite a conflicting market filter', async () => {
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    render(<MemoryRouter initialEntries={['/deposito/estuches?mercado=argentina&producto=AMANTINA%20PREMIUM%20500%20ML&focus=1']}><EstuchesPage /></MemoryRouter>)
    expect((await screen.findAllByText('AMANTINA PREMIUM 500 ML')).length).toBeGreaterThan(0)
  })

  it('shows not found instead of the full list when the selected catalog product has no inventory', async () => {
    vi.mocked(api.get).mockResolvedValue(createEstucheList())
    render(<MemoryRouter initialEntries={['/deposito/estuches?productoId=missing&producto=CATALOGO%20SIN%20STOCK&focus=1']}><EstuchesPage /></MemoryRouter>)
    expect(await screen.findByText(/No se encontr.*estuche con los filtros aplicados/)).toBeInTheDocument()
    expect(screen.queryByText('AMANTINA PREMIUM 250 ML')).not.toBeInTheDocument()
  })

})
