import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import UsuariosPage from '../UsuariosPage'
import { createUsuarioList } from './fixtures/deposito-mock-factories'
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

describe('UsuariosPage', () => {
  const currentUser = createMockUser()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: currentUser, token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><UsuariosPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><UsuariosPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No se pudo cargar la lista de usuarios')).toBeInTheDocument())
  })

  it('renders users list', async () => {
    vi.mocked(api.get).mockResolvedValue(createUsuarioList())
    render(<MemoryRouter><UsuariosPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('USUARIOS')).toBeInTheDocument()
    })
    expect(screen.getAllByText('María López').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Juan Pérez').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ana García').length).toBeGreaterThanOrEqual(1)
  })
})
