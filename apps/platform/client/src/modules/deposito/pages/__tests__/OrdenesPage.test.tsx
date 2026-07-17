import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import OrdenesPage from '../OrdenesPage'
import { createOrdenList } from './fixtures/deposito-mock-factories'
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

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('OrdenesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar las órdenes')).toBeInTheDocument())
  })

  it('renders orders list with status display', async () => {
    vi.mocked(api.get).mockResolvedValue(createOrdenList())
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('ÓRDENES')).toBeInTheDocument()
    })
    expect(screen.getByText('Vitamina B12')).toBeInTheDocument()
    expect(screen.getAllByText('Solicitada').length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay órdenes registradas.')).toBeInTheDocument())
  })
})
