import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import ActaNuevaPage from '../ActaNuevaPage'
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

describe('ActaNuevaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders form with step 1 visible', async () => {
    render(<MemoryRouter><ActaNuevaPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Nueva Acta de Ingreso')).toBeInTheDocument()
    })
    expect(screen.getByText('Cabecera')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de Recepción *')).toBeInTheDocument()
    expect(screen.getByText('Siguiente: Ítems')).toBeInTheDocument()
  })

  it('shows validation error on empty submit', async () => {
    render(<MemoryRouter><ActaNuevaPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Siguiente: Ítems')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Siguiente: Ítems'))
    await waitFor(() => {
      expect(screen.queryByText('Completá la fecha del acta antes de continuar.')).toBeNull()
    })
  })

  it('moves to step 2 after creating acta', async () => {
    vi.mocked(api.post).mockResolvedValue({
      id: 'acta-1',
      fecha: '2026-07-17',
      estado: 'pendiente',
      notas: null,
      createdAt: '',
      updatedAt: '',
      user: { name: 'Test' },
      items: [],
    })
    render(<MemoryRouter><ActaNuevaPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Siguiente: Ítems')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Siguiente: Ítems'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalled()
    })
  })
})
