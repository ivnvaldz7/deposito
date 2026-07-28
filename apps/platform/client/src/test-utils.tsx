import { type ReactElement } from 'react'
import { render, renderHook, type RenderOptions, type RenderHookOptions } from '@testing-library/react'
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom'
import { type PlatformUser } from '@/stores/auth-store'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function renderWithQueryClient(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = createTestQueryClient()
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>,
      options
    ),
  }
}

export function renderHookWithQueryClient<Result, Props>(
  renderFn: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>
) {
  const queryClient = createTestQueryClient()
  return {
    queryClient,
    ...renderHook(renderFn, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
      ...options,
    })
  }
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: MemoryRouterProps['initialEntries']
  authUser?: PlatformUser | null
}

/**
 * Render a component inside a MemoryRouter with optional initial entries.
 * Auth store mocking should be done per-test with vi.mocked().
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/'], ...options }: CustomRenderOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  }

  return render(ui, { wrapper: Wrapper, ...options })
}

/**
 * Create a minimal mock user for testing role-based rendering.
 */
export function createMockUser(overrides: Partial<PlatformUser> = {}): PlatformUser {
  return {
    id: 'user-1',
    sub: 'sub-1',
    email: 'test@example.com',
    name: 'Test User',
    apps: {
      deposito: { rol: 'encargado', activo: true },
      'ale-bet': { rol: 'admin', activo: true },
    },
    isPlatformAdmin: true,
    ...overrides,
  }
}

export * from '@testing-library/react'
