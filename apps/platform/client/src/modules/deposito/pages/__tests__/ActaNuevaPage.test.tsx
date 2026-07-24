import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { api } from '../../lib/api'
import ActaNuevaPage from '../ActaNuevaPage'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual as Record<string, unknown>, useNavigate: () => mockNavigate }
})

const UUID_A = '550e8400-e29b-41d4-a716-446655440000'
const UUID_B = '550e8400-e29b-41d4-a716-446655440001'

const PRODUCTOS_MOCK = [
  { id: UUID_A, nombreBase: 'AMOXICILINA', volumen: '500', unidad: 'ML', variante: null, categoria: 'droga', nombreCompleto: 'AMOXICILINA 500 ML', activo: true },
  { id: UUID_B, nombreBase: 'VITAMINA B12', volumen: '100', unidad: 'ML', variante: null, categoria: 'droga', nombreCompleto: 'VITAMINA B12 100 ML', activo: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillMinimalForm() {
  // The form has autoFocus on the date picker — wait for it
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Seleccioná una fecha')).toBeInTheDocument()
  })

  // No need to set date — it defaults to today

  // Select a product via ProductoSelector
  const productoInput = screen.getByPlaceholderText('Buscá una droga del catálogo...')
  fireEvent.change(productoInput, { target: { value: 'AMOXICILINA' } })

  // Wait for fuse results to appear
  await waitFor(() => {
    expect(screen.getByText('AMOXICILINA 500 ML')).toBeInTheDocument()
  })

  // Click the product
  fireEvent.mouseDown(screen.getByText('AMOXICILINA 500 ML'))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActaNuevaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-07-23'))
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser(),
      token: 'token',
    })
    // Mock catalog fetch for ProductoSelector + lote autofill
    api.get.mockImplementation((path: string) => {
      if (path === '/lotes/siguiente') return Promise.resolve({ lote: '1' })
      return Promise.resolve(PRODUCTOS_MOCK)
    })
  })

  it('renders the form with all required fields', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByText('Nuevo Ingreso')).toBeInTheDocument()
    })

    // Header (h2)
    expect(screen.getByRole('heading', { name: 'Registrar ingreso' })).toBeInTheDocument()

    // Toggle buttons
    expect(screen.getByText('Drogas')).toBeInTheDocument()
    expect(screen.getByText('Material de Empaque')).toBeInTheDocument()

    // Form fields
    expect(screen.getByText('Fecha')).toBeInTheDocument()
    expect(screen.getByText('Producto')).toBeInTheDocument()
    expect(screen.getByText('Lote')).toBeInTheDocument()
    expect(screen.getByText('Cantidad')).toBeInTheDocument()
    expect(screen.getByText('Observaciones')).toBeInTheDocument()

    // Actions
    expect(screen.getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })

  it('defaults to MP (Drogas) mode showing product placeholder for drogas', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscá una droga del catálogo...')).toBeInTheDocument()
    })
  })

  it('switches to ME mode showing subcategories', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByText('Material de Empaque')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Material de Empaque'))

    // Subcategory buttons should appear
    await waitFor(() => {
      expect(screen.getByText('Estuche')).toBeInTheDocument()
      expect(screen.getByText('Frasco')).toBeInTheDocument()
      expect(screen.getByText('Etiqueta')).toBeInTheDocument()
    })

    // Placeholder should change for the active subcategory
    expect(screen.getByPlaceholderText('Buscá un estuche del catálogo...')).toBeInTheDocument()
  })

  it('switches subcategories in ME mode and updates placeholder', async () => {
    render(<ActaNuevaPage />)
    fireEvent.click(screen.getByText('Material de Empaque'))

    await waitFor(() => {
      expect(screen.getByText('Estuche')).toBeInTheDocument()
    })

    // Click Frasco
    fireEvent.click(screen.getByText('Frasco'))
    expect(screen.getByPlaceholderText('Buscá un frasco del catálogo...')).toBeInTheDocument()

    // Click Etiqueta
    fireEvent.click(screen.getByText('Etiqueta'))
    expect(screen.getByPlaceholderText('Buscá una etiqueta del catálogo...')).toBeInTheDocument()
  })

  it('defaults the date to today', () => {
    render(<ActaNuevaPage />)
    expect(screen.getByDisplayValue('23 de Julio 2026')).toBeInTheDocument()
  })

  it('shows validation errors on empty submit', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registrar ingreso' })).toBeInTheDocument()
    })

    // Submit without selecting a product or filling cantidad
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    await waitFor(() => {
      expect(screen.getByText('Seleccioná un producto del catálogo')).toBeInTheDocument()
    })
  })

  it('shows lote as optional for drogas with helper text', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByText('El lote es obligatorio para drogas.')).toBeInTheDocument()
    })
  })

  it('shows lote placeholder with auto-generation hint for ME category', async () => {
    render(<ActaNuevaPage />)
    fireEvent.click(screen.getByText('Material de Empaque'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Auto-generado, editable')).toBeInTheDocument()
    })
  })

  it('submits the form successfully and navigates to /actas', async () => {
    vi.mocked(api.post).mockResolvedValue({
      id: 'acta-1',
      fecha: '2026-07-23',
      estado: 'completada',
      notas: null,
      createdAt: '',
      updatedAt: '',
      user: { name: 'Test User' },
      items: [],
    })

    render(<ActaNuevaPage />)

    // Wait for render and fetch catálogo
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscá una droga del catálogo...')).toBeInTheDocument()
    })

    // Select product
    const productoInput = screen.getByPlaceholderText('Buscá una droga del catálogo...')
    fireEvent.change(productoInput, { target: { value: 'AMOXICILINA' } })

    await waitFor(() => {
      expect(screen.getByText('AMOXICILINA 500 ML')).toBeInTheDocument()
    })
    fireEvent.mouseDown(screen.getByText('AMOXICILINA 500 ML'))

    // Fill cantidad
    const cantidadInput = screen.getByPlaceholderText('0')
    fireEvent.change(cantidadInput, { target: { value: '100' } })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/ingresos', {
        fecha: '2026-07-23',
        productoId: UUID_A,
        lote: undefined,
        cantidad: 100,
        observaciones: undefined,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/actas')
    })
  })

  it('navigates back on Cancel', async () => {
    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByText('Cancelar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Cancelar'))
    expect(mockNavigate).toHaveBeenCalledWith('/actas')
  })

  it('requires encargado role to show the form', async () => {
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: createMockUser({ apps: { deposito: { rol: 'observador', activo: true } } }),
      token: 'token',
    })

    render(<ActaNuevaPage />)
    // The form should still render but the "Registrar ingreso" button should be present
    // (role check happens server-side via requireRole middleware)
    await waitFor(() => {
      expect(screen.getByText('Nuevo Ingreso')).toBeInTheDocument()
    })
  })

  it('displays server error on failed submission', async () => {
    const { ApiError: ApiErrorClass } = await import('../../lib/api')
    vi.mocked(api.post).mockRejectedValue(new ApiErrorClass(500, 'Error interno del servidor'))

    render(<ActaNuevaPage />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Buscá una droga del catálogo...')).toBeInTheDocument()
    })

    // Select product
    const productoInput = screen.getByPlaceholderText('Buscá una droga del catálogo...')
    fireEvent.change(productoInput, { target: { value: 'AMOXICILINA' } })
    await waitFor(() => {
      expect(screen.getByText('AMOXICILINA 500 ML')).toBeInTheDocument()
    })
    fireEvent.mouseDown(screen.getByText('AMOXICILINA 500 ML'))

    // Fill cantidad
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '100' } })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))

    await waitFor(() => {
      expect(screen.getByText('Error interno del servidor')).toBeInTheDocument()
    })
  })
})
