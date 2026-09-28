import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import EtiquetasPage from '../EtiquetasPage'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), del: vi.fn() }, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/catalogo-productos', () => ({ fetchCatalogoProductos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn(() => ({ user: null, token: null })) }))

describe('EtiquetasPage', () => {
  it('does not render an initial-load action', async () => {
    render(<MemoryRouter><EtiquetasPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Etiquetas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /carga inicial|apertura/i })).not.toBeInTheDocument()
  })
})
