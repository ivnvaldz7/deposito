import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../lib/toast'
import OrdenesPage from '../OrdenesPage'
import { createOrden, createOrdenList } from './fixtures/deposito-mock-factories'
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

describe('OrdenesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: { user: ReturnType<typeof createMockUser>; token: string }) => unknown) => selector({ user: createMockUser(), token: 'token' }))
  })

  it('renders loading state', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Error'))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument())
  })

  it('renders orders list with status display', async () => {
    vi.mocked(api.get).mockResolvedValue(createOrdenList())
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => { expect(screen.queryByText(/Cargando/i)).not.toBeInTheDocument() })
    expect(screen.getAllByText(/Vitamina B12/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/solicitada/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the selected country for packaging orders', async () => {
    vi.mocked(api.get).mockResolvedValue([createOrden({ categoria: 'estuche', mercado: 'argentina' })])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    expect(await screen.findByText('Estuche · Argentina')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No hay órdenes registradas.')).toBeInTheDocument())
  })

  it('requests and labels the archive view separately', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage archivadas /></MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/ordenes?archivadas=true'))
    expect(screen.getByRole('heading', { name: 'Órdenes archivadas' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Resumen' })).toBeInTheDocument()
    expect(await screen.findByText('No hay órdenes archivadas.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument()
  })

  it('muestra loading y éxito real al aprobar', async () => {
    vi.mocked(api.get).mockResolvedValue([createOrdenList()[0]])
    let resolveApproval!: (order: unknown) => void
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { resolveApproval = resolve }))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('button', { name: 'Aprobando...' })).toBeDisabled()
    await act(async () => resolveApproval(createOrdenList()[0]))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Orden "Vitamina B12" aprobada.'))
  })

  it('confirma y muestra loading al rechazar sin pedir motivo', async () => {
    vi.mocked(api.get).mockResolvedValue([createOrdenList()[0]])
    let resolveReject!: (order: unknown) => void
    vi.mocked(api.put).mockReturnValue(new Promise((resolve) => { resolveReject = resolve }))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('button', { name: 'Rechazando…' })).toBeDisabled()
    await act(async () => resolveReject(createOrdenList()[0]))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Orden "Vitamina B12" rechazada.'))
  })

  it('restaura los controles y muestra error cuando falla el backend', async () => {
    vi.mocked(api.get).mockResolvedValue([createOrdenList()[0]])
    vi.mocked(api.post).mockRejectedValue(new ApiError(409, 'Stock insuficiente'))
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Stock insuficiente'))
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeEnabled()
  })

  it('filtra estuches por país mediante badges y conserva el país elegido en la orden', async () => {
    const estuche = {
      id: '11111111-1111-4111-8111-111111111111',
      nombreBase: 'OLIVITASAN PLUS',
      nombreCompleto: 'OLIVITASAN PLUS 500 ML',
      categoria: 'estuche',
      codigo: 'IGES033',
      presentacion: 500,
      unidad: 'ml',
      volumen: null,
      variante: null,
      activo: true,
      estado: 'ACTIVO',
      mercadosHabilitados: ['argentina'],
    }
    vi.mocked(api.get).mockImplementation((path) => Promise.resolve(path === '/ordenes' ? [] : [estuche]) as never)
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    expect(screen.getByText('¿Qué necesitás?')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Buscá un/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Material de Empaque' }))
    fireEvent.click(screen.getByRole('button', { name: 'estuche' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/productos?categoria=estuche&activo=true&incluirStock=true'))
    const producto = screen.getByPlaceholderText('Primero seleccioná un país')
    expect(producto).toBeDisabled()
    expect(screen.queryByLabelText('Mercado')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Argentina' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))
    expect(screen.getByRole('button', { name: 'Argentina' })).toHaveAttribute('aria-pressed', 'true')
    const selector = screen.getByPlaceholderText('Buscá un estuche...')
    expect(selector).toBeEnabled()
    await act(async () => selector.focus())
    fireEvent.mouseDown(await screen.findByRole('option', { name: /OLIVITASAN PLUS 500 ML/i }))
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '10' } })
    vi.mocked(api.post).mockResolvedValue({ grupoId: 'grupo-1', ordenes: [{ id: 'orden-1', productoNombre: estuche.nombreCompleto }] } as never)
    fireEvent.click(screen.getByRole('button', { name: /Agregar producto a la solicitud/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
      items: [expect.objectContaining({ productoId: estuche.id, mercado: 'argentina', cantidad: 10 })],
    })))
  })

  it('groups lines visually and reports partial fulfillment without an urgency label', async () => {
    vi.mocked(api.get).mockResolvedValue([
      createOrden({ id: 'orden-1', grupoId: 'grupo-1', estado: 'aprobada', urgencia: 'urgente' }),
      createOrden({ id: 'orden-2', grupoId: 'grupo-1', productoNombre: 'Amantina 500 ML', estado: 'solicitada' }),
    ])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    expect(await screen.findByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/2 confirmados')).toBeInTheDocument()
    expect(screen.getByText('1 pendiente de disponibilidad o aprobación')).toBeInTheDocument()
    expect(screen.queryByText('Urgente')).not.toBeInTheDocument()
  })
})
