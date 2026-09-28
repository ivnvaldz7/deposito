import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import FrascosPage from '../FrascosPage'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), del: vi.fn() }, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/catalogo-productos', () => ({ fetchCatalogoProductos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn(() => ({ user: null, token: null })) }))

describe('FrascosPage', () => {
  it('does not render an initial-load action', async () => {
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Frascos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /carga inicial|apertura/i })).not.toBeInTheDocument()
  })
})
