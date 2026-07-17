import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
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
      expect(screen.getByText('FRASCOS')).toBeInTheDocument()
    })
    expect(screen.getAllByText('DORADO 250 ML').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('240')).toBeInTheDocument()
  })
})
