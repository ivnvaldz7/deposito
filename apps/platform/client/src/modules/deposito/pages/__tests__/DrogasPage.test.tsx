import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import DrogasPage from '../DrogasPage'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]) }, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/catalogo-productos', () => ({ fetchCatalogoProductos: vi.fn().mockResolvedValue([]) }))

describe('DrogasPage', () => {
  it('keeps inventory read-only and exposes no initial-load or opening-edit action', async () => {
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    expect(await screen.findByText('No hay drogas cargadas todavía.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /carga inicial|apertura/i })).not.toBeInTheDocument()
  })
})
