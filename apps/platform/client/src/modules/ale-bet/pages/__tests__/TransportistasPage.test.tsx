import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { aleBetApi } from '../../lib/api'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/stores/auth-store'
import { createMockUser } from '@/test-utils'
import TransportistasPage from '../TransportistasPage'
import { createTransportista, createTransportistaList } from './fixtures/ale-bet-mock-factories'

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
      <TransportistasPage />
    </MemoryRouter>,
  )
}

function tabla() {
  return within(screen.getByTestId('transportistas-table'))
}

describe('TransportistasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRol('admin')
  })

  it('renders loading state', () => {
    vi.mocked(aleBetApi.transportistas.list).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Cargando transportistas...')).toBeInTheDocument()
  })

  it('renders error state', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockRejectedValue(new Error('Error al cargar transportistas'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Error al cargar transportistas')).toBeInTheDocument())
  })

  it('lists transportistas with active/inactive badges', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue(createTransportistaList())
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Transportistas')).toBeInTheDocument()
    })
    expect(tabla().getByText('Transporte A')).toBeInTheDocument()
    expect(tabla().getByText('Transporte B')).toBeInTheDocument()
    expect(tabla().getByText('Activo')).toBeInTheDocument()
    expect(tabla().getByText('Inactivo')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('No hay transportistas.')).toBeInTheDocument())
  })

  it('creates a transportista: local validation then POST and toast', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue([])
    vi.mocked(aleBetApi.transportistas.create).mockResolvedValue(createTransportista({ nombre: 'Transporte Nuevo' }))
    renderPage()
    await waitFor(() => expect(screen.getByText('No hay transportistas.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Nuevo transportista/ }))
    const modal = within(screen.getByTestId('transportista-form-modal'))

    fireEvent.click(modal.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(screen.getByText('El nombre debe tener al menos 2 caracteres')).toBeInTheDocument())
    expect(aleBetApi.transportistas.create).not.toHaveBeenCalled()

    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Transporte Nuevo' } })
    fireEvent.click(modal.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(screen.getByText('La dirección debe tener al menos 2 caracteres')).toBeInTheDocument())
    expect(aleBetApi.transportistas.create).not.toHaveBeenCalled()

    fireEvent.change(modal.getByLabelText('Dirección'), { target: { value: 'Calle 3 890' } })
    fireEvent.click(modal.getByRole('button', { name: 'Crear' }))

    await waitFor(() =>
      expect(aleBetApi.transportistas.create).toHaveBeenCalledWith({ nombre: 'Transporte Nuevo', direccion: 'Calle 3 890' }),
    )
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Transportista creado'))
  })

  it('edits a transportista: PATCH and toast', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue(createTransportistaList())
    vi.mocked(aleBetApi.transportistas.update).mockResolvedValue(createTransportista({ nombre: 'Transporte A2' }))
    renderPage()

    await waitFor(() => expect(tabla().getByText('Transporte A')).toBeInTheDocument())
    const filaA = within(tabla().getByRole('row', { name: /Transporte A/ }))
    fireEvent.click(filaA.getByRole('button', { name: 'Editar' }))

    const modal = within(screen.getByTestId('transportista-form-modal'))
    fireEvent.change(modal.getByLabelText('Nombre'), { target: { value: 'Transporte A2' } })
    fireEvent.click(modal.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(aleBetApi.transportistas.update).toHaveBeenCalledWith('trans-1', { nombre: 'Transporte A2', direccion: 'Calle 1 234' }),
    )
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Transportista actualizado'))
  })

  it('toggles activo/inactivo with confirmation dialog', async () => {
    vi.mocked(aleBetApi.transportistas.list).mockResolvedValue(createTransportistaList())
    vi.mocked(aleBetApi.transportistas.update).mockResolvedValue(createTransportista({ activo: false }))
    renderPage()

    await waitFor(() => expect(tabla().getByText('Transporte A')).toBeInTheDocument())
    const filaA = within(tabla().getByRole('row', { name: /Transporte A/ }))
    fireEvent.click(filaA.getByRole('button', { name: 'Editar' }))

    const modal = within(screen.getByTestId('transportista-form-modal'))
    fireEvent.click(modal.getByRole('button', { name: 'Desactivar' }))

    const dialog = within(screen.getByTestId('confirm-dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(aleBetApi.transportistas.update).toHaveBeenCalledWith('trans-1', { activo: false }))
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Transportista desactivado'))
  })

  it('vendedor sees "Sin acceso" and the list is not fetched', async () => {
    mockRol('vendedor')
    renderPage()
    await waitFor(() => expect(screen.getByText('Sin acceso a esta sección.')).toBeInTheDocument())
    expect(aleBetApi.transportistas.list).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Nuevo transportista/ })).not.toBeInTheDocument()
  })
})
