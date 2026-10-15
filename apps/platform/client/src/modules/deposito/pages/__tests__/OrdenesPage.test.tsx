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
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
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
    window.localStorage.clear()
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

  it('muestra Nueva orden fuera del main animado para que no quede recortada', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><main style={{ transform: 'translateY(0)', overflow: 'hidden' }}><OrdenesPage /></main></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeVisible()
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0')
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(screen.getByRole('heading', { name: 'Nueva orden de producción' })).toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Entregando...' })).toBeDisabled()
    await act(async () => resolveApproval({ orden: createOrdenList()[0], cantidadDescontada: 100, cantidadEntregada: 100, pendiente: 0 }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Orden "Vitamina B12" aprobada.'))
  })

  it('permite al solicitante editar una cantidad pendiente y abrir el agregado de productos', async () => {
    const orden = createOrden({ id: 'orden-editable', cantidad: 3, estado: 'solicitada' })
    vi.mocked(api.get).mockResolvedValue([orden])
    vi.mocked(api.patch).mockResolvedValue({ ...orden, cantidad: 7 } as never)
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar cantidad' }))
    fireEvent.change(screen.getByLabelText('Cantidad solicitada'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/ordenes/orden-editable', { cantidad: 7 }))

    fireEvent.click(screen.getByRole('button', { name: 'Agregar productos' }))
    expect(await screen.findByRole('heading', { name: 'Agregar productos a la solicitud' })).toBeInTheDocument()
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
      stockActual: 100,
      stockPorMercado: { argentina: 100 },
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
    expect(screen.getByRole('status')).toHaveTextContent('Seleccionado: Estuche · IGES033 · Argentina · Stock disponible: 100')
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '10' } })
    vi.mocked(api.post).mockResolvedValue({ grupoId: 'grupo-1', ordenes: [{ id: 'orden-1', productoNombre: estuche.nombreCompleto }] } as never)
    fireEvent.keyDown(screen.getByLabelText('Cantidad'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
      items: [expect.objectContaining({ productoId: estuche.id, mercado: 'argentina', cantidad: 10 })],
    })))
  })

  it('incluye el último producto en edición al enviar una solicitud con varios productos', async () => {
    const productos = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        nombreBase: 'OLIVITASAN',
        nombreCompleto: 'OLIVITASAN 500 ML',
        categoria: 'estuche',
        codigo: 'IGES030',
        presentacion: 500,
        unidad: 'ml',
        volumen: null,
        variante: null,
        activo: true,
        estado: 'ACTIVO',
        mercadosHabilitados: ['argentina'],
        stockActual: 6530,
        stockPorMercado: { argentina: 6530 },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        nombreBase: 'OLIVITASAN',
        nombreCompleto: 'OLIVITASAN 250 ML',
        categoria: 'estuche',
        codigo: 'IGES029',
        presentacion: 250,
        unidad: 'ml',
        volumen: null,
        variante: null,
        activo: true,
        estado: 'ACTIVO',
        mercadosHabilitados: ['argentina'],
        stockActual: 3200,
        stockPorMercado: { argentina: 3200 },
      },
    ]
    vi.mocked(api.get).mockImplementation((path) => Promise.resolve(path === '/ordenes' ? [] : productos) as never)
    vi.mocked(api.post).mockResolvedValue({ grupoId: 'grupo-1', ordenes: [{ id: 'orden-1' }, { id: 'orden-2' }] } as never)
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Material de Empaque' }))
    fireEvent.click(screen.getByRole('button', { name: 'estuche' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argentina' }))

    const selector = screen.getByPlaceholderText('Buscá un estuche...')
    await act(async () => selector.focus())
    fireEvent.mouseDown(await screen.findByRole('option', { name: /OLIVITASAN 500 ML/i }))
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2400' } })
    fireEvent.keyDown(screen.getByLabelText('Cantidad'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i })).toBeEnabled())

    const selectorSegundoProducto = screen.getByPlaceholderText('Buscá un estuche...')
    await act(async () => selectorSegundoProducto.focus())
    fireEvent.mouseDown(await screen.findByRole('option', { name: /OLIVITASAN 250 ML/i }))
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
      items: [
        expect.objectContaining({ productoId: productos[0].id, mercado: 'argentina', cantidad: 2400 }),
        expect.objectContaining({ productoId: productos[1].id, mercado: 'argentina', cantidad: 1200 }),
      ],
    })))
  })

  it('acumula la cantidad al confirmar el mismo producto más de una vez', async () => {
    const frasco = {
      id: '33333333-3333-4333-8333-333333333333',
      nombreBase: 'DORADO',
      nombreCompleto: 'DORADO 500 ML',
      categoria: 'frasco',
      codigo: 'ENV073',
      presentacion: 500,
      unidad: 'ml',
      volumen: null,
      variante: null,
      activo: true,
      estado: 'ACTIVO',
      mercadosHabilitados: [],
      stockActual: 5000,
    }
    vi.mocked(api.get).mockImplementation((path) => Promise.resolve(path === '/ordenes' ? [] : [frasco]) as never)
    vi.mocked(api.post).mockResolvedValue({ grupoId: 'grupo-1', ordenes: [{ id: 'orden-1' }] } as never)
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Material de Empaque' }))
    fireEvent.click(screen.getByRole('button', { name: 'frasco' }))

    const selector = screen.getByPlaceholderText('Buscá un frasco...')
    await act(async () => selector.focus())
    fireEvent.mouseDown(await screen.findByRole('option', { name: /DORADO 500 ML/i }))
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2400' } })
    fireEvent.keyDown(screen.getByLabelText('Cantidad'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('DORADO 500 ML')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '600' } })
    fireEvent.keyDown(screen.getByLabelText('Cantidad'), { key: 'Enter' })

    expect(await screen.findByText('Se sumaron 600. Total solicitado: 3000.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes', expect.objectContaining({
      items: [expect.objectContaining({ productoId: frasco.id, cantidad: 3000 })],
    })))
  })

  it('permite solicitar drogas fraccionarias desde 0,001', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Drogas' }))
    const cantidad = screen.getByLabelText('Cantidad')
    expect(cantidad).toHaveAttribute('min', '0.001')
    expect(cantidad).toHaveAttribute('step', 'any')
    expect(screen.getByText(/Confirmá la cantidad para seguir cargando/)).toBeInTheDocument()
  })

  it('permite elegir el lote de una droga antes de aprobarla', async () => {
    const orden = createOrden({ id: 'orden-droga', categoria: 'droga', productoId: 'producto-droga', estado: 'solicitada' })
    vi.mocked(api.get).mockImplementation((path) => {
      if (path === '/ordenes') return Promise.resolve([orden]) as never
      if (path === '/ordenes/orden-droga/lotes-disponibles') {
        return Promise.resolve([
          { id: '11111111-1111-4111-8111-111111111111', lote: 'L-2028', vencimiento: '2028-09-30T00:00:00.000Z', cantidad: 40 },
        ]) as never
      }
      return Promise.resolve([]) as never
    })
    vi.mocked(api.post).mockResolvedValue({ orden, cantidadDescontada: 1, cantidadEntregada: 1, pendiente: 0 } as never)

    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    const selector = await screen.findByLabelText('Lote a descontar primero')
    await screen.findByRole('option', { name: /L-2028.*40 disponibles/i })
    fireEvent.change(selector, { target: { value: '11111111-1111-4111-8111-111111111111' } })
    expect(screen.getByText('Se descontará este lote antes de continuar con los demás.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ordenes/orden-droga/aprobar', {
      loteIdPreferido: '11111111-1111-4111-8111-111111111111',
    }))
  })

  it('restaura un borrador de orden al volver a abrir el formulario', async () => {
    window.localStorage.setItem('deposito:orden-produccion:borrador:v1', JSON.stringify({
      familia: 'droga',
      form: { categoria: 'droga', productoId: '', productoNombre: '', mercado: '', cantidad: '' },
      lineas: [{ key: 'borrador-1', categoria: 'droga', productoId: '11111111-1111-4111-8111-111111111111', productoNombre: 'B2-5 FOSFATO', cantidad: 0.2 }],
    }))
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    expect(await screen.findByText('B2-5 FOSFATO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviar solicitud \(1\)/i })).toBeEnabled()
  })

  it('cancela una solicitud nueva, cierra el modal y descarta su borrador', async () => {
    window.localStorage.setItem('deposito:orden-produccion:borrador:v1', JSON.stringify({
      familia: 'droga',
      form: { categoria: 'droga', productoId: '', productoNombre: 'ÁCIDO OLEICO', mercado: '', cantidad: '26' },
      lineas: [],
    }))
    vi.mocked(api.get).mockResolvedValue([])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva orden' }))
    expect(await screen.findByRole('heading', { name: 'Nueva orden de producción' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Nueva orden de producción' })).not.toBeInTheDocument())
    expect(window.localStorage.getItem('deposito:orden-produccion:borrador:v1')).toBeNull()
  })

  it('groups lines visually and reports partial fulfillment without an urgency label', async () => {
    vi.mocked(api.get).mockResolvedValue([
      createOrden({ id: 'orden-1', grupoId: 'grupo-1', estado: 'aprobada', urgencia: 'urgente' }),
      createOrden({ id: 'orden-2', grupoId: 'grupo-1', productoNombre: 'Amantina 500 ML', estado: 'solicitada' }),
    ])
    render(<MemoryRouter><OrdenesPage /></MemoryRouter>)
    expect(await screen.findByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/2 completos')).toBeInTheDocument()
    expect(screen.getByText('1 pendiente de disponibilidad o aprobación')).toBeInTheDocument()
    expect(screen.queryByText('Urgente')).not.toBeInTheDocument()
  })
})
