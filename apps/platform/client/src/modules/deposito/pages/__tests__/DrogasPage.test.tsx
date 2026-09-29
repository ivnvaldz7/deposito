import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import DrogasPage from '../DrogasPage'

const apiMock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))

vi.mock('../../lib/api', () => ({ api: apiMock, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/catalogo-productos', () => ({ fetchCatalogoProductos: vi.fn().mockResolvedValue([]) }))

describe('DrogasPage', () => {
  it('does not expose historical opening edits when inventory is empty', async () => {
    apiMock.get.mockResolvedValue([])
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)
    expect(await screen.findByText('No hay drogas cargadas todavía.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /carga inicial|apertura/i })).not.toBeInTheDocument()
  })

  it('shows an audited quantity adjustment for an existing drug lot', async () => {
    apiMock.get.mockResolvedValue([{
      productoId: 'product-1', nombre: 'VITAMINA A', stockMinimo: null,
      lotes: [{ id: 'lot-1', lote: 'APERTURA', vencimiento: null, cantidad: 240, createdAt: '2026-09-24T00:00:00.000Z' }],
    }])
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)

    fireEvent.click((await screen.findAllByRole('button', { name: /vitamina a/i }))[0])
    expect((await screen.findAllByRole('button', { name: 'Ajustar cantidad' })).length).toBeGreaterThan(0)
  })
})
