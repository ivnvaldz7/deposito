import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { api } from '../../lib/api'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import FrascosPage from '../FrascosPage'

vi.mock('../../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), del: vi.fn() }, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/catalogo-productos', () => ({ fetchCatalogoProductos: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/permissions', () => ({ can: () => true }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn(() => ({ user: null, token: null })) }))

describe('FrascosPage', () => {
  it('does not render an initial-load action', async () => {
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Frascos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /carga inicial|apertura/i })).not.toBeInTheDocument()
  })
  it('keeps the linked name and total when only the box size changes', async () => {
    const frasco = { id: 'f1', productoId: 'p1', articulo: 'FRASCO 100 ML', unidadesPorCaja: 100, cantidadCajas: 10, unidadesSueltas: 0, total: 1000, updatedAt: '' }
    vi.mocked(api.get).mockResolvedValue([frasco])
    vi.mocked(api.put).mockResolvedValue({ ...frasco, unidadesPorCaja: 50, cantidadCajas: 20 })
    render(<MemoryRouter><FrascosPage /></MemoryRouter>)
    const buttons = await screen.findAllByRole('button', { name: /Editar FRASCO 100 ML/ })
    fireEvent.click(buttons[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Artículo')).toHaveAttribute('readonly')
    fireEvent.change(within(dialog).getByLabelText('Unidades / Caja'), { target: { value: '50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/frascos/f1', { unidadesPorCaja: 50 }))
  })
})
