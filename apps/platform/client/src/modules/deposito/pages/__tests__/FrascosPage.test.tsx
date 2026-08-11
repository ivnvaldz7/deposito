import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import FrascosPage from '../FrascosPage'
import { createFrascoList } from './fixtures/deposito-mock-factories'
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

describe('FrascosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: ReturnType<typeof createMockUser>; token: string }) => unknown) => selector({ user: createMockUser(), token: 'token' }))
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar los frascos')).toBeInTheDocument())
  })

  it('renders table with units/cajas display', async () => {
    vi.mocked(api.get).mockResolvedValue(createFrascoList())
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Frascos' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('DORADO 250 ML').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('240')).toBeInTheDocument()
  })

  it('shows not found for a selected catalog product absent from inventory', async () => {
    vi.mocked(api.get).mockResolvedValue(createFrascoList())
    render(
      <MemoryRouter initialEntries={['/deposito/frascos?productoId=missing&producto=CATALOGO%20SIN%20STOCK&focus=1']}>
        <FrascosPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/No se encontr.*frasco en inventario/)).toBeInTheDocument()
    expect(screen.queryByText('DORADO 250 ML')).not.toBeInTheDocument()
  })

  it('opens the edit dialog from an accessible row action', async () => {
    vi.mocked(api.get).mockResolvedValue(createFrascoList())
    const user = userEvent.setup()
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Frascos' })

    const actions = screen.getAllByRole('button', { name: 'Editar DORADO 250 ML' })
    expect(actions[0]).toHaveClass('size-9')
    await user.click(actions[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Editar frasco' })).toBeInTheDocument()
    expect(screen.getByLabelText('Artículo')).toHaveValue('DORADO 250 ML')
  })

  it('deletes the selected row through the mutation', async () => {
    vi.mocked(api.get).mockResolvedValue(createFrascoList())
    vi.mocked(api.del).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Frascos' })
    await user.click(screen.getAllByRole('button', { name: 'Eliminar DORADO 250 ML' })[0])
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/frascos/frasco-1'))
  })
})
