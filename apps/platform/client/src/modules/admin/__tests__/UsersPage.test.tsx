import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UsersPage from '../pages/UsersPage'
import { adminApi } from '../lib/api'
import type { PlatformUser } from '../lib/api'

// Mock the admin API
vi.mock('../lib/api', () => ({
  adminApi: {
    list: vi.fn(),
    create: vi.fn(),
    updateAccess: vi.fn(),
    updateStatus: vi.fn(),
    deleteAccess: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

// Mock the auth store (needed by api-client)
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: unknown) => unknown) => {
      const state = {
        token: 'mock-token',
        user: {
          sub: 'admin_xyz789',
          email: 'admin@plataforma.com',
          name: 'Admin',
          apps: { admin: { rol: 'admin', activo: true } },
          isPlatformAdmin: true,
        },
        authResolved: true,
      }
      return selector ? selector(state) : state
    },
    { getState: vi.fn() },
  ),
}))

// Mock api-client's ApiError
vi.mock('@/lib/api-client', () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message)
      this.name = 'ApiError'
    }
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}))

const mockUsers: PlatformUser[] = [
  {
    id: 'user_001',
    email: 'encargado@deposito.com',
    nombre: 'Juan Encargado',
    activo: true,
    estado: 'active',
    isPlatformAdmin: false,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    appAccess: [
      {
        id: 'acc_001',
        userId: 'user_001',
        app: 'deposito',
        rol: 'encargado',
        activo: true,
        createdAt: '2026-01-15T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'user_002',
    email: 'operador@alebet.com',
    nombre: 'María Operador',
    activo: false,
    estado: 'disabled',
    isPlatformAdmin: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    appAccess: [
      {
        id: 'acc_002',
        userId: 'user_002',
        app: 'ale_bet',
        rol: 'operador',
        activo: false,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ],
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  )
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the admin page title', async () => {
    vi.mocked(adminApi.list).mockResolvedValue([])

    renderPage()

    expect(screen.getByText('Plataforma Admin')).toBeInTheDocument()
    expect(
      screen.getByText(/Gestioná usuarios, accesos y permisos/),
    ).toBeInTheDocument()
  })

  it('loads and displays users from the API', async () => {
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Juan Encargado')).toBeInTheDocument()
    })

    expect(screen.getByText('María Operador')).toBeInTheDocument()
    expect(screen.getByText('encargado@deposito.com')).toBeInTheDocument()
    expect(screen.getByText('operador@alebet.com')).toBeInTheDocument()
  })

  it('displays user status badges', async () => {
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Activo')).toBeInTheDocument()
    })

    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('displays app access badges for users', async () => {
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Depósito/)).toBeInTheDocument()
    })

    expect(screen.getByText('Depósito · encargado')).toBeInTheDocument()
    expect(screen.getByText('Ale-Bet · operador')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    vi.mocked(adminApi.list).mockResolvedValue([])

    renderPage()

    expect(screen.getByText('Cargando usuarios...')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    vi.mocked(adminApi.list).mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('renders "Nuevo usuario" button', async () => {
    vi.mocked(adminApi.list).mockResolvedValue([])

    renderPage()

    expect(
      screen.getByRole('button', { name: 'Nuevo usuario' }),
    ).toBeInTheDocument()
  })

  it('opens create user modal when clicking "Nuevo usuario"', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue([])

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }))

    expect(screen.getByText('Creá credenciales y accesos por app.')).toBeInTheDocument()
  })

  it('renders edit buttons for each user', async () => {
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    await waitFor(() => {
      const editButtons = screen.getAllByRole('button', { name: 'Editar' })
      expect(editButtons).toHaveLength(2)
    })
  })

  it('displays "Sin accesos" for users without app access', async () => {
    const userWithNoAccess: PlatformUser[] = [
      {
        id: 'user_003',
        email: 'sin-acceso@test.com',
        nombre: 'Sin Acceso',
        activo: true,
        estado: 'active',
        isPlatformAdmin: false,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
        appAccess: [],
      },
    ]
    vi.mocked(adminApi.list).mockResolvedValue(userWithNoAccess)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sin accesos')).toBeInTheDocument()
    })
  })

  it('offers encargado for Ale-Bet in the access panel and hides stale roles (ADMIN-UI-1)', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    const editButtons = await screen.findAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    const aleBetTitle = screen.getByText('Ale-Bet / Logística')
    const aleBetSection = aleBetTitle.closest('.rounded-xl.border') as HTMLElement
    expect(aleBetSection).not.toBeNull()

    const section = aleBetSection
    expect(
      within(section).getByRole('option', { name: 'encargado' }),
    ).toBeInTheDocument()
    expect(
      within(section).queryByRole('option', { name: 'operador' }),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByRole('option', { name: 'supervisor' }),
    ).not.toBeInTheDocument()
  })

  it('saves changes using the single Guardar cambios button', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    const editButtons = await screen.findAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    // Toggle global status
    const statusCheckbox = screen.getAllByRole('checkbox')[0] // First checkbox is global status
    await user.click(statusCheckbox)

    // Save
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(adminApi.updateStatus).toHaveBeenCalledWith('user_001', { activo: false })
      expect(adminApi.updateAccess).toHaveBeenCalled()
    })
  })

  it('allows platform admin to reset password and displays temporary password once', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)
    vi.mocked(adminApi.resetPassword).mockResolvedValue({ temporaryPassword: 'new-temp-pwd' })

    renderPage()

    const editButtons = await screen.findAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    const resetBtn = screen.getByRole('button', { name: 'Restablecer contraseña' })
    await user.click(resetBtn)

    // Wait for the confirmation modal
    const confirmModalTitle = await screen.findByRole('heading', { name: 'Restablecer contraseña' })
    const confirmModalContainer = confirmModalTitle.closest('.fixed') as HTMLElement

    // Confirm reset
    await user.click(
      within(confirmModalContainer).getByRole('button', { name: 'Restablecer' }),
    )

    await waitFor(() => {
      expect(adminApi.resetPassword).toHaveBeenCalledWith('user_001')
      expect(adminApi.resetPassword).toHaveBeenCalledTimes(1)
    })

    // Wait for generated password modal
    const generatedModalTitle = await screen.findByRole('heading', { name: 'Contraseña generada' })
    const generatedModalContainer = generatedModalTitle.closest('.fixed') as HTMLElement

    // Verify temp password is shown
    expect(within(generatedModalContainer).getByText('new-temp-pwd')).toBeInTheDocument()

    // Click Entendido
    await user.click(
      within(generatedModalContainer).getByRole('button', { name: 'Entendido' }),
    )

    // Verify modal is closed
    expect(screen.queryByRole('heading', { name: 'Contraseña generada' })).not.toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
  })

  it('shows reset errors without closing the confirmation flow', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)
    vi.mocked(adminApi.resetPassword).mockRejectedValue(new Error('No autorizado'))

    renderPage()
    await user.click((await screen.findAllByRole('button', { name: 'Editar' }))[0])
    await user.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    const confirmModal = (await screen.findByRole('heading', { name: 'Restablecer contraseña' })).closest('.fixed') as HTMLElement
    await user.click(within(confirmModal).getByRole('button', { name: 'Restablecer' }))

    expect(await screen.findByText('No autorizado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Restablecer contraseña' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Contraseña generada' })).not.toBeInTheDocument()
  })

  it('removes an app access through the panel and refetches the list', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)

    renderPage()

    const editButtons = await screen.findAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    const depositoTitle = screen.getByText('Depósito')
    const depositoSection = depositoTitle.closest('.rounded-xl.border') as HTMLElement
    await user.click(
      within(depositoSection).getByRole('button', { name: /quitar acceso/i }),
    )

    // Wait for the confirmation modal
    const modalTitle = await screen.findByText('Quitar acceso a Depósito')
    const modalContainer = modalTitle.closest('.fixed') as HTMLElement

    // Confirm deletion
    await user.click(
      within(modalContainer).getByRole('button', { name: 'Quitar acceso' }),
    )

    await waitFor(() => {
      expect(adminApi.deleteAccess).toHaveBeenCalledWith('user_001', 'deposito')
    })
    // initial load + refetch after removal
    expect(adminApi.list).toHaveBeenCalledTimes(2)
  })

  it('creates a user without sending password and displays temporary password (FASE 1A)', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.list).mockResolvedValue([])
    vi.mocked(adminApi.create).mockResolvedValue({ 
      user: mockUsers[0], 
      temporaryPassword: 'temp-created-pwd' 
    })

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }))

    // Fill form
    await user.type(screen.getByLabelText('Nombre'), 'Test User')
    await user.type(screen.getByLabelText('Email'), 'test@deposito.com')
    
    // Ensure no password field exists
    expect(screen.queryByText('Password')).not.toBeInTheDocument()

    // Save
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    // Wait for API call
    await waitFor(() => {
      expect(adminApi.create).toHaveBeenCalledWith({
        nombre: 'Test User',
        email: 'test@deposito.com',
        appAccess: []
      })
    })

    // Assert success modal with temp password
    expect(await screen.findByText('Usuario creado correctamente')).toBeInTheDocument()
    expect(screen.getByText('temp-created-pwd')).toBeInTheDocument()

    // Click Entendido
    await user.click(screen.getByRole('button', { name: 'Entendido' }))

    // Modal closed
    expect(screen.queryByText('Usuario creado correctamente')).not.toBeInTheDocument()
  })
})
