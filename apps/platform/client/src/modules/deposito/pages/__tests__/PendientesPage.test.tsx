import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import PendientesPage from '../PendientesPage'
import { createPendienteList } from './fixtures/deposito-mock-factories'
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

describe('PendientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><PendientesPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><PendientesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar los pendientes')).toBeInTheDocument())
  })

  it('renders items list with status display', async () => {
    vi.mocked(api.get).mockResolvedValue(createPendienteList())
    render(<MemoryRouter><PendientesPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('PENDIENTES')).toBeInTheDocument()
    })
    expect(screen.getAllByText('En esterilización').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Recibidos')).toBeInTheDocument()
  })
})
