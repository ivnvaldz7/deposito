import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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
})
