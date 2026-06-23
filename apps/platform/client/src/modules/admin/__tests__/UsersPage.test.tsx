import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
