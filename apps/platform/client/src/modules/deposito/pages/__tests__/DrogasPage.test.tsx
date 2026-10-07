import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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

  it('sends the adjustment to the deposit API', async () => {
    apiMock.get.mockResolvedValue([{
      productoId: 'product-1', nombre: 'VITAMINA A', stockMinimo: null,
      lotes: [{ id: 'lot-1', lote: 'APERTURA', vencimiento: null, cantidad: 240, createdAt: '2026-09-24T00:00:00.000Z' }],
    }])
    apiMock.patch.mockResolvedValue({ diferencia: -60 })
    render(<MemoryRouter><DrogasPage /></MemoryRouter>)

    fireEvent.click((await screen.findAllByRole('button', { name: /vitamina a/i }))[0])
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ajustar cantidad' }))[0])
    fireEvent.change(screen.getByLabelText('Cantidad final'), { target: { value: '180' } })
    fireEvent.change(screen.getByLabelText('Motivo del ajuste'), { target: { value: 'Recuento físico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }))

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/drogas/lot-1/cantidad', {
      cantidad: 180,
      motivo: 'Recuento físico',
    }))
  })
})
