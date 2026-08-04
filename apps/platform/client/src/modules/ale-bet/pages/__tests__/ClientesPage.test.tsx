import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/lib/api-client'
import { aleBetApi } from '../../lib/api'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/stores/auth-store'
import { createMockUser } from '@/test-utils'
import ClientesPage from '../ClientesPage'
import { createCliente, createClienteList, createClientePendiente } from './fixtures/ale-bet-mock-factories'

vi.mock('../../lib/api', () => ({
  aleBetApi: {
    dashboard: vi.fn(),
    productos: { list: vi.fn(), search: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), lotes: { list: vi.fn(), create: vi.fn(), update: vi.fn() } },
    clientes: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    pedidos: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), aprobar: vi.fn(), tomar: vi.fn(), completarItem: vi.fn(), preparar: vi.fn(), cancelar: vi.fn(), confirmarCancelacion: vi.fn(), despachar: vi.fn() },
    transportistas: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    remitos: { emitir: vi.fn(), anular: vi.fn(), pdf: vi.fn() },
    stock: { get: vi.fn(), movimientos: vi.fn() },
    historial: { list: vi.fn(), exportDownload: vi.fn() },
  },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

function mockRol(rol: string) {
  const user = createMockUser({ apps: { 'ale-bet': { rol, activo: true } } })
  ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (state: { user: typeof user; token: string }) => unknown) =>
      selector({ user, token: 'token' }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientesPage />
    </MemoryRouter>,
  )
}

function pendientesSection() {
  return within(screen.getByTestId('clientes-pendientes'))
}

function tabla() {
  return within(screen.getByTestId('clientes-table'))
}

describe('ClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.clientes.list).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Cargando clientes...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.clientes.list).mockRejectedValue(new Error('Error al cargar clientes'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Error al cargar clientes')).toBeInTheDocument())
  })

  it('renders clients list', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue(createClienteList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Clientes')).toBeInTheDocument()
    })
    expect(tabla().getByText('Cliente A')).toBeInTheDocument()
    expect(tabla().getByText('Cliente B')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No hay clientes.')).toBeInTheDocument())
  })

  it('shows pending clients queue highlighted with counter for admin/facturacion', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([createClientePendiente(), createCliente()])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('clientes-pendientes')).toBeInTheDocument())

    const section = pendientesSection()
    expect(section.getByText('Clientes pendientes')).toBeInTheDocument()
    expect(section.getByText('1')).toBeInTheDocument()
    expect(section.getByText('Cliente B')).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Editar' })).toBeInTheDocument()

    expect(tabla().queryByText('Cliente B')).not.toBeInTheDocument()
    expect(tabla().getByText('Cliente A')).toBeInTheDocument()
    expect(tabla().getByText('Validado')).toBeInTheDocument()
  })

  it('completes fiscal data and VALIDAR CLIENTE sends PUT with estado VALIDADO and shows toast', async () => {
    const pendiente = createClientePendiente()
    const validado = createCliente({ id: 'cliente-2', nombre: 'Cliente B', contacto: 'fiscal@test.com', cuit: '20123456789', condicionIva: 'Responsable Inscripto', estado: 'VALIDADO' })
    vi.mocked(aleBetApi.clientes.list)
      .mockResolvedValueOnce([pendiente, createCliente()])
      .mockResolvedValueOnce([validado, createCliente()])
    vi.mocked(aleBetApi.clientes.update).mockResolvedValue(validado)
    renderPage()

    await waitFor(() => expect(screen.getByTestId('clientes-pendientes')).toBeInTheDocument())
    fireEvent.click(pendientesSection().getByRole('button', { name: 'Editar' }))

    const modal = within(screen.getByTestId('cliente-form-modal'))
    fireEvent.change(modal.getByLabelText('CUIT'), { target: { value: '20123456789' } })
    fireEvent.change(modal.getByLabelText('Condición IVA'), { target: { value: 'Responsable Inscripto' } })
    fireEvent.change(modal.getByLabelText('Localidad'), { target: { value: 'Rosario' } })
    fireEvent.click(modal.getByRole('button', { name: 'VALIDAR CLIENTE' }))

    await waitFor(() => {
      expect(aleBetApi.clientes.update).toHaveBeenCalledWith(
        'cliente-2',
        expect.objectContaining({ estado: 'VALIDADO', cuit: '20123456789', condicionIva: 'Responsable Inscripto', localidad: 'Rosario' }),
      )
    })
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Cliente validado'))

    await waitFor(() => expect(screen.queryByTestId('clientes-pendientes')).not.toBeInTheDocument())
    expect(tabla().getByText('Cliente B')).toBeInTheDocument()
    expect(tabla().getAllByText('Validado').length).toBeGreaterThanOrEqual(1)
  })

  it('rejects invalid CUIT format locally and does not call the API', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([createClientePendiente()])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('clientes-pendientes')).toBeInTheDocument())
    fireEvent.click(pendientesSection().getByRole('button', { name: 'Editar' }))

    const modal = within(screen.getByTestId('cliente-form-modal'))
    fireEvent.change(modal.getByLabelText('CUIT'), { target: { value: '12345' } })
    fireEvent.click(modal.getByRole('button', { name: 'VALIDAR CLIENTE' }))

    await waitFor(() => expect(screen.getByText('El CUIT debe tener 11 dígitos')).toBeInTheDocument())
    expect(aleBetApi.clientes.update).not.toHaveBeenCalled()
  })

  it('toggles activo/inactivo with confirmation dialog', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([createCliente()])
    vi.mocked(aleBetApi.clientes.update).mockResolvedValue(createCliente({ activo: false }))
    renderPage()

    await waitFor(() => expect(tabla().getByText('Cliente A')).toBeInTheDocument())
    fireEvent.click(tabla().getByRole('button', { name: 'Editar' }))

    const modal = within(screen.getByTestId('cliente-form-modal'))
    fireEvent.click(modal.getByRole('button', { name: 'Desactivar' }))

    const dialog = within(screen.getByTestId('confirm-dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(aleBetApi.clientes.update).toHaveBeenCalledWith('cliente-1', { activo: false }))
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Cliente desactivado'))
  })

  it('vendedor sees read-only list with pending hint and no edit/validate buttons', async () => {
    mockRol('vendedor')
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([createClientePendiente(), createCliente()])
    renderPage()

    await waitFor(() => expect(screen.getByTestId('clientes-pendientes')).toBeInTheDocument())
    expect(pendientesSection().getByText(/Facturación completará los datos/)).toBeInTheDocument()
    expect(pendientesSection().queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /Nuevo cliente/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'VALIDAR CLIENTE' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('shows server 400 error when creating a client without contacto or referencia', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([])
    vi.mocked(aleBetApi.clientes.create).mockRejectedValue(
      new ApiError(400, 'Debe informar un contacto o referencia para crear un cliente'),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('No hay clientes.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }))
    const modal = within(screen.getByTestId('cliente-form-modal'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Cliente Nuevo' } })
    fireEvent.click(modal.getByRole('button', { name: 'Crear' }))

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Debe informar un contacto o referencia para crear un cliente'),
    )
    expect(aleBetApi.clientes.create).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('cliente-form-modal')).toBeInTheDocument()
  })

  it('creates a client with contacto: POST called and success toast', async () => {
    vi.mocked(aleBetApi.clientes.list).mockResolvedValue([])
    vi.mocked(aleBetApi.clientes.create).mockResolvedValue(createCliente({ nombre: 'Cliente Nuevo', contacto: 'nuevo@test.com' }))
    renderPage()
    await waitFor(() => expect(screen.getByText('No hay clientes.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }))
    const modal = within(screen.getByTestId('cliente-form-modal'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(modal.getByLabelText('Contacto'), { target: { value: 'nuevo@test.com' } })
    fireEvent.click(modal.getByRole('button', { name: 'Crear' }))

    await waitFor(() =>
      expect(aleBetApi.clientes.create).toHaveBeenCalledWith({ nombre: 'Cliente Nuevo', contacto: 'nuevo@test.com' }),
    )
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Cliente creado'))
  })
})
