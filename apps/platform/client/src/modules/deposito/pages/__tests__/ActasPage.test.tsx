import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    await waitFor(() => expect(screen.getByText('No se pudo cargar las actas')).toBeInTheDocument())
  })

  it('renders empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay actas registradas todavía.')).toBeInTheDocument())
  })

  it('renders table with items', async () => {
    vi.mocked(api.get).mockResolvedValue(createActaList())
    render(<MemoryRouter><ActasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('ACTAS')).toBeInTheDocument()
    })
    expect(screen.getByText('actas')).toBeInTheDocument()
  })
})
