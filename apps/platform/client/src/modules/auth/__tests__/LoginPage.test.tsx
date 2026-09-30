import { renderWithQueryClient as render } from '@/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'

const mockNavigate = vi.fn()
const mockLogin = vi.fn()
const mockSetLastApp = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const store = { login: mockLogin }
    return sel ? sel(store) : store
  },
}))

vi.mock('@/stores/app-store', () => ({
  useAppStore: (sel?: (s: unknown) => unknown) => {
    const store = { setLastApp: mockSetLastApp }
    return sel ? sel(store) : store
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { href: '', assign: vi.fn() },
      writable: true,
    })
    // Mock fetch
    vi.stubGlobal('fetch', vi.fn())
  })

  // ────────────────────────────────────────────────
  // Existing tests (preserved and updated)
  // ────────────────────────────────────────────────

  it('renders the login title', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByAltText('Logística')).toBeInTheDocument()
  })

  it('shows error message when error=unauthorized is in URL', () => {
    render(
      <MemoryRouter initialEntries={['/login?error=unauthorized']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no autorizado/i)).toBeInTheDocument()
  })

  it('shows disabled account message when error=disabled in URL', () => {
    render(
      <MemoryRouter initialEntries={['/login?error=disabled']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/deshabilitada/i)).toBeInTheDocument()
  })

  it('does not show error when no error param', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ────────────────────────────────────────────────
  // New tests: local login form
  // ────────────────────────────────────────────────

  it('renders email input field', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const emailInput = screen.getByLabelText(/email/i)
    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')
  })

  it('renders password input field', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const passwordInput = screen.getByLabelText(/contraseña/i)
    expect(passwordInput).toBeInTheDocument()
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('renders submit button with login text', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })
    expect(submitButton).toBeInTheDocument()
  })

  it('does not render Google login, dev buttons, or redundant text', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/Iniciar sesión con Google/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Admin/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Inicio rápido/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DEV/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ale-Bet Plataforma/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Iniciá sesión para continuar/i)).not.toBeInTheDocument()
  })

  it('submits form and calls API on valid submission', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'jwt-token',
          user: {
            sub: 'user_123',
            email: 'test@test.com',
            name: 'Test User',
            apps: { deposito: { rol: 'encargado', activo: true } },
            isPlatformAdmin: false,
          },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/contraseña/i)
    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })

    fireEvent.change(emailInput, { target: { value: 'test@test.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test@test.com'),
        }),
      )
      expect(mockLogin).toHaveBeenCalledWith(
        'jwt-token',
        expect.objectContaining({ email: 'test@test.com' }),
      )
      expect(mockNavigate).toHaveBeenCalledWith('/deposito', { replace: true })
    })
  })

  it('shows generic error on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Email o contraseña incorrectos' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/contraseña/i)
    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })

    fireEvent.change(emailInput, { target: { value: 'test@test.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrong' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/email o contraseña incorrectos/i)).toBeInTheDocument()
    })
  })

  it('shows disabled account error when server returns disabled', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Cuenta deshabilitada' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/contraseña/i)
    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })

    fireEvent.change(emailInput, { target: { value: 'disabled@test.com' } })
    fireEvent.change(passwordInput, { target: { value: 'any' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/cuenta deshabilitada/i)).toBeInTheDocument()
    })
  })

  it('shows field error when email is empty on submit', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })
    fireEvent.click(submitButton)

    expect(screen.getByText(/email requerido/i)).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('shows field error when password is empty on submit', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/email/i)
    const submitButton = screen.getByRole('button', { name: /^Iniciar sesión$/i })

    fireEvent.change(emailInput, { target: { value: 'test@test.com' } })
    fireEvent.click(submitButton)

    expect(screen.getByText(/contraseña requerida/i)).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('uses Stitch design tokens (no bg-obsidian classes)', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const container = screen.getByAltText('Logística').closest('div')
    expect(container?.parentElement?.innerHTML).not.toContain('bg-obsidian')
  })

  it('navigates to /app-selector when user has multiple active apps', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'jwt-token',
          user: {
            sub: 'user_123',
            email: 'multi@test.com',
            name: 'Multi App User',
            apps: {
              deposito: { rol: 'encargado', activo: true },
              'ale-bet': { rol: 'observador', activo: true },
            },
            isPlatformAdmin: false,
          },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'multi@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Iniciar sesión$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/app-selector', { replace: true })
    })
  })

  it('navigates to /no-access when user has no active apps', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'jwt-token',
          user: {
            sub: 'user_123',
            email: 'no-access@test.com',
            name: 'No Access User',
            apps: {},
            isPlatformAdmin: false,
          },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'no-access@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Iniciar sesión$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/no-access', { replace: true })
    })
  })
})
