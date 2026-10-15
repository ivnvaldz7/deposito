import { describe, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithQueryClient as render } from '@/test-utils'
import ZeroxPage from '../ZeroxPage'
import { api } from '../../lib/api'

vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (state: { user: { apps: { deposito: { rol: string; activo: boolean } } } }) => unknown) => selector({ user: { apps: { deposito: { rol: 'encargado', activo: true } } } }) }))
vi.mock('@/lib/permissions', () => ({ can: () => true }))
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), getBlob: vi.fn() }, ApiError: class ApiError extends Error {} }))
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const frasco = { productoId: '11111111-1111-4111-8111-111111111111', nombre: 'PVC 200 ML', codigo: 'ENV001', categoria: 'frasco', activo: true, permiteIngreso: true, saldo: 10 }
const tapa = { productoId: '22222222-2222-4222-8222-222222222222', nombre: 'TAPA VERDE', codigo: 'TAP001', categoria: 'tapa', activo: true, permiteIngreso: true, saldo: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockImplementation((path) => Promise.resolve(path.startsWith('/zerox/saldos') ? path.includes('tapa') ? [tapa] : [frasco] : { items: [], total: 0, pagina: 1, paginas: 0 }) as never)
})

describe('ZEROX', () => {
  it('separa frascos y tapas y permite buscar por producto', async () => {
    render(<ZeroxPage />)
    expect(screen.queryByText('UNIDADES EN ZEROX')).not.toBeInTheDocument()
    expect(screen.queryByText(/Los antiguos «Pendientes»/)).not.toBeInTheDocument()
    expect((await screen.findAllByText('PVC 200 ML')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Tapas' }))
    expect((await screen.findAllByText('TAPA VERDE')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(screen.getByText('Historial auditable · Tapas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar historial' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar producto en saldos' }), { target: { value: 'no existe' } })
    expect(screen.getByText('No hay productos para esta búsqueda.')).toBeInTheDocument()
  })

  it('registra una salida con fecha anterior y bloquea superar el saldo', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'mov-1' } as never)
    render(<ZeroxPage />)
    fireEvent.click(await screen.findByRole('button', { name: '− Salida' }))
    const cantidad = screen.getByRole('spinbutton', { name: 'Cantidad (unidades)' })
    fireEvent.change(cantidad, { target: { value: '11' } })
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled()
    fireEvent.change(cantidad, { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Fecha del movimiento'), { target: { value: '2026-10-10' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' })))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/zerox/movimientos', expect.objectContaining({ productoId: frasco.productoId, tipo: 'salida', cantidad: 4, fechaMovimiento: '2026-10-10' })))
  })

  it('envía los filtros al historial', async () => {
    render(<ZeroxPage />)
    await screen.findAllByText('PVC 200 ML')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(vi.mocked(api.get).mock.calls.some(([path]) => path.startsWith('/zerox/movimientos'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } })
    fireEvent.change(screen.getByLabelText('Cantidad mínima'), { target: { value: '5' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('cantidadMin=5')))
    expect(vi.mocked(api.get).mock.calls.some(([path]) => path.includes('desde=2026-10-01') && path.includes('hasta=2026-10-15'))).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
