import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../lib/api'
import ActaDetallePage from '../ActaDetallePage'
import { createActa } from './fixtures/deposito-mock-factories'
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

function renderWithRoute(initialEntry = '/actas/acta-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/actas/:id" element={<ActaDetallePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ActaDetallePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    renderWithRoute()
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    renderWithRoute()
    await waitFor(() => expect(screen.getByText('No se pudo cargar el acta')).toBeInTheDocument())
  })

  it('renders acta detail view', async () => {
    const acta = createActa()
    vi.mocked(api.get).mockResolvedValue(acta)
    renderWithRoute()
    await waitFor(() => {
      expect(screen.getByText(/Acta/)).toBeInTheDocument()
    })
    expect(screen.getByText(/María López/)).toBeInTheDocument()
    expect(screen.getByText('Vitamina B12')).toBeInTheDocument()
  })
})
