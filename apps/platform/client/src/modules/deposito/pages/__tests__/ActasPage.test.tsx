import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import ActasPage from '../ActasPage'
import { createActaList } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('ActasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText(/no se pudieron cargar/i)).toBeInTheDocument())
  })

  it('renders empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay actas registradas todavía.')).toBeInTheDocument())
  })

  it('renders table with items', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/actas')) return createActaList()
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.getByText('Actas', { selector: 'h1' })).toBeInTheDocument()
  })
})
