import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithQueryClient as render } from '@/test-utils'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import MovimientosPage from '../MovimientosPage'
import { createMovimientoList } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('MovimientosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><MovimientosPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><MovimientosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText('Error')).toBeInTheDocument())
  })

  it('renders movements list', async () => {
    vi.mocked(api.get).mockImplementation(async url => {
      if (url.startsWith('/movimientos')) return createMovimientoList()
      throw new Error(`Endpoint inesperado en test: ${url}`)
    })
    render(<MemoryRouter><MovimientosPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument()
    })
    expect(screen.getByText('Auditoría de Movimientos')).toBeInTheDocument()
    expect(screen.getAllByText(/Vitamina B12/i).length).toBeGreaterThan(0)
  })

  it('shows empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><MovimientosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Sin movimientos para los filtros aplicados.')).toBeInTheDocument())
  })
})
