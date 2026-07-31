import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { renderWithQueryClient as render } from '@/test-utils'
import { MemoryRouter } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../lib/toast'
import ProductosPage from '../ProductosPage'
import { createProductoList, createProducto } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('../../lib/toast', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

vi.mock('../../lib/catalogo-productos', () => ({
  fetchCatalogoProductos: vi.fn().mockResolvedValue([]),
}))

const mockProductos = createProductoList()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Setup useAuthStore mock to behave like a real zustand store (selector-aware).
 * useAuthStore(selector) should apply the selector to the state.
 * useAuthStore.getState() should return the raw state (for getAuthHeaders() in useImportDryRun).
 */
function setupAuth(rol: string = 'encargado') {
  const state = {
    user: createMockUser({ apps: { deposito: { rol, activo: true } } }),
    token: 'token',
  }
  const mockFn = useAuthStore as unknown as ReturnType<typeof vi.fn> & { getState: () => typeof state }
  mockFn.getState = () => state
  mockFn.mockImplementation(
    (selector?: (s: typeof state) => unknown) => {
      return selector ? selector(state) : state
    }
  )
}

function renderPage() {
  return render(<MemoryRouter><ProductosPage /></MemoryRouter>)
}

async function waitForLoad() {
  await waitFor(() => {
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
  })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ProductosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth('encargado')
  })

  // ─── 4.1: Page renders LoadingState, EmptyState, table ────────────────────

  describe('4.1: Page render states', () => {
    it('renders loading state', () => {
      vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
      renderPage()
      expect(screen.getByText('Cargando...')).toBeInTheDocument()
    })

    it('renders error state', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Error de conexión'))
      renderPage()
      await waitFor(() => {
        expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument()
      })
    })

    it('renders empty state when no products', async () => {
      vi.mocked(api.get).mockResolvedValue([])
      renderPage()
      await waitForLoad()
      expect(screen.getByText('No hay productos en el catálogo.')).toBeInTheDocument()
    })

    it('renders table with products', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.startsWith('/productos')) return mockProductos
        throw new Error(`Unexpected: ${url}`)
      })
      renderPage()
      await waitForLoad()
      expect(screen.getByText('Productos', { selector: 'h1' })).toBeInTheDocument()
      expect(screen.getByText('AMANTINA')).toBeInTheDocument()
      expect(screen.getByText('VITAMINA B12')).toBeInTheDocument()
      expect(screen.getByText('PARACETAMOL')).toBeInTheDocument()
    })

    it('shows no-results when search yields nothing', async () => {
      vi.mocked(api.get).mockResolvedValue([])
      renderPage()
      await waitForLoad()

      const searchInput = screen.getByPlaceholderText('Buscar por código o nombre...')
      fireEvent.change(searchInput, { target: { value: 'ZZZZ' } })

      await waitFor(() => {
        expect(screen.getByText(/No se encontraron/i)).toBeInTheDocument()
      })
    })
  })

  // ─── 4.2: Role gating ─────────────────────────────────────────────────────

  describe('4.2: Role gating', () => {
    it('encargado sees action buttons', async () => {
      setupAuth('encargado')
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      expect(screen.getByText('Nuevo')).toBeInTheDocument()
      expect(screen.getByText('Importar')).toBeInTheDocument()
    })

    it('solicitante sees read-only table without action buttons', async () => {
      setupAuth('solicitante')
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      expect(screen.getByText('Productos', { selector: 'h1' })).toBeInTheDocument()
      expect(screen.getByText('AMANTINA')).toBeInTheDocument()
      expect(screen.queryByText('Nuevo')).not.toBeInTheDocument()
      expect(screen.queryByText('Importar')).not.toBeInTheDocument()
    })
  })

  // ─── 4.3: Create form conditional fields ───────────────────────────────────

  describe('4.3: Create form conditional fields', () => {
    async function openCreateDialog() {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })
    }

    it('etiqueta category shows market and presentation fields', async () => {
      await openCreateDialog()

      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))

      expect(screen.getByLabelText(/Presentación/)).toBeInTheDocument()
      expect(screen.getByText('Argentina')).toBeInTheDocument()
      expect(screen.getByText('Colombia')).toBeInTheDocument()
    })

    it('frasco category shows presentation but no markets', async () => {
      await openCreateDialog()

      fireEvent.click(screen.getByRole('button', { name: 'Frasco' }))

      expect(screen.getByLabelText(/Presentación/)).toBeInTheDocument()
      expect(screen.queryByText('Argentina')).not.toBeInTheDocument()
    })

    it('droga category hides both presentation and markets', async () => {
      await openCreateDialog()

      // Default is droga — presentation and markets should be hidden
      expect(screen.queryByLabelText(/Presentación/)).not.toBeInTheDocument()
      expect(screen.queryByText('Argentina')).not.toBeInTheDocument()
    })
  })

  // ─── 4.4: Import dry-run shows per-row errors ──────────────────────────────

  describe('4.4: Import dry-run preview (MVP-01)', () => {
    it('handles mixed valid/invalid rows correctly (filters, warnings, partial confirm)', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      setupAuth('encargado')

      vi.mocked(api.postForm).mockResolvedValue({
        filas: [
          { fila: 1, producto: { nombreBase: 'Producto A', nombreCompleto: 'Producto A', categoria: 'droga', codigo: null }, valido: true },
          { fila: 2, producto: { nombreBase: 'Producto B', nombreCompleto: 'Producto B', categoria: 'etiqueta', codigo: 'IGET001' }, valido: true },
          { fila: 3, valido: false, errores: { nombreBase: ['Nombre requerido'] } },
        ],
        validas: 2,
        invalidas: 1,
      })

      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => expect(screen.getByText('Importar productos')).toBeInTheDocument())

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      fireEvent.change(screen.getByLabelText(/Archivo/i), { target: { files: [file] } })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }))

      // 1. mezcla válida/inválida NO muestra error rojo (el de 0 válidas)
      // 9. no existen simultáneamente banner rojo + warning
      await waitFor(() => {
        expect(screen.queryByText(/No hay filas válidas para importar/i)).not.toBeInTheDocument()
      })

      // 2. mezcla válida/inválida muestra warning no bloqueante
      expect(screen.getByText('1 filas serán omitidas.')).toBeInTheDocument()

      // 7. confirm sigue habilitado mientras haya >=1 válida
      const confirmBtn = screen.getByRole('button', { name: /Confirmar importación \(2 productos\)/i })
      expect(confirmBtn).not.toBeDisabled()

      // 8. tabla mantiene las cantidades correctas al filtrar
      // 4. filtro Todas no cambia validRows/invalidRows
      expect(screen.getByText('2 válidas')).toBeInTheDocument()
      expect(screen.getByText('1 inválidas')).toBeInTheDocument()
      expect(screen.getByText('Producto A')).toBeInTheDocument()
      expect(screen.getByText('Producto B')).toBeInTheDocument()
      expect(screen.getByText('Nombre requerido')).toBeInTheDocument()

      // 5. filtro Válidas no cambia estado global
      fireEvent.click(screen.getByRole('button', { name: 'Válidas' }))
      expect(screen.getByText('2 válidas')).toBeInTheDocument() // still visible
      expect(screen.getByText('1 inválidas')).toBeInTheDocument()
      expect(screen.getByText('Producto A')).toBeInTheDocument()
      expect(screen.queryByText('Nombre requerido')).not.toBeInTheDocument() // invalid row hidden

      // 6. filtro Inválidas no cambia estado global
      fireEvent.click(screen.getByRole('button', { name: 'Inválidas' }))
      expect(screen.getByText('2 válidas')).toBeInTheDocument()
      expect(screen.getByText('Nombre requerido')).toBeInTheDocument()
      expect(screen.queryByText('Producto A')).not.toBeInTheDocument() // valid row hidden

      // 10. confirm procesa solo filas válidas
      vi.mocked(api.postForm).mockResolvedValue({ importadas: 2, omitidas: 1 })
      fireEvent.click(confirmBtn)
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2 productos creados')))
    })

    it('shows blocking error when 0 valid rows exist', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      setupAuth('encargado')

      vi.mocked(api.postForm).mockResolvedValue({
        filas: [
          { fila: 1, valido: false, errores: { nombreBase: ['Error 1'] } },
          { fila: 2, valido: false, errores: { nombreBase: ['Error 2'] } },
        ],
        validas: 0,
        invalidas: 2,
      })

      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => expect(screen.getByText('Importar productos')).toBeInTheDocument())

      const file = new File(['test'], 'test.csv', { type: 'text/csv' })
      fireEvent.change(screen.getByLabelText(/Archivo/i), { target: { files: [file] } })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }))

      // 3. 0 válidas sí muestra error bloqueante
      await waitFor(() => {
        expect(screen.getByText(/No hay filas válidas para importar/i)).toBeInTheDocument()
      })
      // 9. no existen simultáneamente banner rojo + warning
      expect(screen.queryByText(/filas serán omitidas/i)).not.toBeInTheDocument()

      const confirmBtn = screen.getByRole('button', { name: /Confirmar importación/i })
      expect(confirmBtn).toBeDisabled()
    })

    it('rejects an unsupported import file before any request is sent', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

      const file = new File(['not a catalog'], 'catalogo.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByLabelText(/Archivo/i), { target: { files: [file] } })

      expect(screen.getByText('Formato no soportado. Use archivos .xls, .xlsx o .csv.')).toBeInTheDocument()
      expect(api.postForm).not.toHaveBeenCalled()
    })
  })

  // ─── 4.5: Delete 409 handling ─────────────────────────────────────────────

  describe('4.5: Delete 409 error handling', () => {
    it('shows toast when trying to delete product with 409', async () => {
      const pendiente = createProducto({
        id: 'prod-pendiente',
        nombreBase: 'TEST',
        estado: 'PENDIENTE_REVISION',
        codigo: null,
        categoria: 'droga',
      })
      vi.mocked(api.get).mockResolvedValue([pendiente])
      renderPage()
      await waitForLoad()

      const deleteButtons = screen.getAllByTitle('Eliminar')
      expect(deleteButtons.length).toBeGreaterThan(0)
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Eliminar producto')).toBeInTheDocument()
      })

      vi.mocked(api.del).mockRejectedValue(
        new ApiError(409, 'No se puede eliminar un producto activo')
      )

      fireEvent.click(screen.getByText('Eliminar'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('No se puede eliminar un producto activo')
      })
    })
  })

  // ─── UAT-1: Search does not unmount the page ───────────────────────────────

  describe('UAT-1: Search preserves content', () => {
    it('typing in search keeps table visible with placeholder data', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      expect(screen.getByText('AMANTINA')).toBeInTheDocument()
      expect(screen.getByText('VITAMINA B12')).toBeInTheDocument()

      const searchInput = screen.getByPlaceholderText('Buscar por código o nombre...')
      fireEvent.change(searchInput, { target: { value: 'AM' } })
      fireEvent.change(searchInput, { target: { value: 'AMT' } })

      // Page should still show data (placeholderData keeps previous)
      expect(screen.getByText('AMANTINA')).toBeInTheDocument()
      // LoadingState should NOT be shown
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    })

    it('search input retains focus while typing', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      const searchInput = screen.getByPlaceholderText('Buscar por código o nombre...') as HTMLInputElement
      searchInput.focus()
      fireEvent.change(searchInput, { target: { value: 'TEST' } })

      expect(document.activeElement).toBe(searchInput)
      expect(searchInput.value).toBe('TEST')
    })
  })

  // ─── UAT-2: Create dialog Cancel closes and resets ─────────────────────────

  describe('UAT-2: Create dialog Cancel', () => {
    async function openCreateDialog() {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })
    }

    it('Cancel button closes the dialog', async () => {
      await openCreateDialog()
      fireEvent.click(screen.getByText('Cancelar'))
      await waitFor(() => {
        expect(screen.queryByText('Nuevo producto')).not.toBeInTheDocument()
      })
    })

    it('Cancel does not trigger any mutation', async () => {
      await openCreateDialog()
      fireEvent.click(screen.getByText('Cancelar'))
      await waitFor(() => {
        expect(screen.queryByText('Nuevo producto')).not.toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  // ─── UAT-3: Edit dialog cancel, payload, locked fields ────────────────────

  describe('UAT-3: Edit dialog', () => {
    async function openEditDialog(index: number = 0) {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()
      const editBtns = screen.getAllByTitle('Editar')
      fireEvent.click(editBtns[index])
      await waitFor(() => {
        expect(screen.getByText('Editar producto')).toBeInTheDocument()
      })
    }

    it('Cancel closes edit dialog', async () => {
      await openEditDialog()
      fireEvent.click(screen.getByText('Cancelar'))
      await waitFor(() => {
        expect(screen.queryByText('Editar producto')).not.toBeInTheDocument()
      })
    })

    it('Cancel does not trigger any mutation', async () => {
      await openEditDialog()
      fireEvent.click(screen.getByText('Cancelar'))
      await waitFor(() => {
        expect(screen.queryByText('Editar producto')).not.toBeInTheDocument()
      })
      expect(api.patch).not.toHaveBeenCalled()
    })

    it('sends correct payload when saving edit', async () => {
      vi.mocked(api.patch).mockResolvedValue(mockProductos[0])
      await openEditDialog()

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'AMANTINA EDITADA' } })

      fireEvent.click(screen.getByText('Guardar cambios'))

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          `/productos/${mockProductos[0].id}`,
          expect.objectContaining({
            nombreBase: 'AMANTINA EDITADA',
            nombreCompleto: 'AMANTINA EDITADA',
          }),
        )
      })
    })

    it('locks code field for ACTIVO products', async () => {
      await openEditDialog(0) // mockProductos[0] is ACTIVO with codigo 'AMT-001'

      const codeInput = screen.getByLabelText(/Código/) as HTMLInputElement
      expect(codeInput).toBeDisabled()
    })

    it('shows error without closing dialog on edit failure', async () => {
      vi.mocked(api.patch).mockRejectedValue(new ApiError(400, 'Datos inválidos'))
      const pendiente = createProducto({ id: 'prod-edit', estado: 'PENDIENTE_REVISION', nombreBase: 'EDITABLE', codigo: null })
      vi.mocked(api.get).mockResolvedValue([pendiente])
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByTitle('Editar'))
      await waitFor(() => {
        expect(screen.getByText('Editar producto')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'UPDATED' } })

      fireEvent.click(screen.getByText('Guardar cambios'))

      await waitFor(() => {
        expect(screen.getByText('Datos inválidos')).toBeInTheDocument()
      })
      // Dialog should still be open
      expect(screen.getByText('Editar producto')).toBeInTheDocument()
    })
  })

  // ─── UAT-4: Values are sent in UPPERCASE ─────────────────────────────────

  describe('UAT-4: Uppercase transformation', () => {
    it('sends nombreBase in uppercase and codigo with IGET prefix when creating etiqueta', async () => {
      vi.mocked(api.post).mockResolvedValue(mockProductos[0])
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'amantina premium' } })

      // Select etiqueta (requires mercados + presentacion + IGET codigo)
      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))
      fireEvent.click(screen.getByText('Argentina'))

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '250' } })

      const codigoInput = screen.getByLabelText(/Código/) as HTMLInputElement
      fireEvent.change(codigoInput, { target: { value: 'iget-001' } })

      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/productos', expect.objectContaining({
          nombreBase: 'AMANTINA PREMIUM',
          nombreCompleto: 'AMANTINA PREMIUM',
          codigo: 'IGET-001',
        }))
      })
    })

    it('allows creating a FRASCO without a code', async () => {
      vi.mocked(api.post).mockResolvedValue(mockProductos[0])
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      // Select frasco (no code required)
      fireEvent.click(screen.getByRole('button', { name: 'Frasco' }))

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'nuevo frasco' } })

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '500' } })

      // Code field is optional — just submit
      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/productos', expect.objectContaining({
          nombreBase: 'NUEVO FRASCO',
          nombreCompleto: 'NUEVO FRASCO',
          categoria: 'frasco',
          presentacion: 500,
        }))
        // codigo should not be in payload (undefined)
        const callPayload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>
        expect(callPayload.codigo).toBeUndefined()
      })
    })

    it('rejects creating ETIQUETA without a code', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))
      fireEvent.click(screen.getByText('Argentina'))

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'NUEVA ETIQUETA' } })

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '250' } })

      // Leave code empty and submit
      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(screen.getByText(/El código es obligatorio para etiquetas y estuches/)).toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
    })

    it('rejects creating ETIQUETA with wrong prefix', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))
      fireEvent.click(screen.getByText('Argentina'))

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'NUEVA ETIQUETA' } })

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '250' } })

      const codigoInput = screen.getByLabelText(/Código/) as HTMLInputElement
      fireEvent.change(codigoInput, { target: { value: 'WRONG-001' } })

      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(screen.getByText(/debe comenzar con IGET/)).toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
    })

    it('rejects creating ESTUCHE without a code', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Estuche' }))
      fireEvent.click(screen.getByText('Argentina'))

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'NUEVO ESTUCHE' } })

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '300' } })

      // Leave code empty and submit
      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(screen.getByText(/El código es obligatorio para etiquetas y estuches/)).toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
    })

    it('rejects creating ESTUCHE with wrong prefix', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Estuche' }))
      fireEvent.click(screen.getByText('Argentina'))

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'NUEVO ESTUCHE' } })

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      fireEvent.change(presentacionInput, { target: { value: '300' } })

      const codigoInput = screen.getByLabelText(/Código/) as HTMLInputElement
      fireEvent.change(codigoInput, { target: { value: 'WRONG-001' } })

      fireEvent.click(screen.getByText('Crear producto'))

      await waitFor(() => {
        expect(screen.getByText(/debe comenzar con IGES/)).toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
    })

    it('shows code as optional for FRASCO category', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      // Default should be droga — code shows as (opcional)
      expect(screen.getByText(/opcional/)).toBeInTheDocument()

      // Switch to frasco — still optional
      fireEvent.click(screen.getByRole('button', { name: 'Frasco' }))
      expect(screen.getByText(/opcional/)).toBeInTheDocument()

      // Switch to etiqueta — should show prefix requirement
      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))
      expect(screen.getByText(/IGET/)).toBeInTheDocument()
    })
  })

  // ─── UAT-5: Create form field order ───────────────────────────────────────

  describe('UAT-5: Form field order', () => {
    it('shows all fields in order categoria < nombre < presentacion < mercados < codigo for etiqueta', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()
      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      // Etiqueta renders the full field set: categoria, nombre, presentacion, mercados, codigo
      fireEvent.click(screen.getByRole('button', { name: 'Etiqueta' }))

      const dialog = screen.getByRole('dialog')
      const labels = dialog.querySelectorAll('.label-field, label')
      const labelTexts = Array.from(labels).map((l) => l.textContent?.trim())

      const indexOf = (text: string) => labelTexts.findIndex((t) => t?.includes(text))
      const categoriaIndex = indexOf('¿Qué es el producto?')
      const nombreIndex = indexOf('Nombre')
      const presentacionIndex = indexOf('Presentación')
      const mercadosIndex = indexOf('País / mercados habilitados')
      const codigoIndex = indexOf('Código')

      ;[categoriaIndex, nombreIndex, presentacionIndex, mercadosIndex, codigoIndex].forEach((i) => {
        expect(i).toBeGreaterThanOrEqual(0)
      })
      expect(categoriaIndex).toBeLessThan(nombreIndex!)
      expect(nombreIndex).toBeLessThan(presentacionIndex!)
      expect(presentacionIndex).toBeLessThan(mercadosIndex!)
      expect(mercadosIndex).toBeLessThan(codigoIndex!)
    })
  })

  // ─── UAT-6: Edit dialog data contract ─────────────────────────────────────

  describe('UAT-6: Edit dialog data contract', () => {
    async function openEditFor(productos: ReturnType<typeof createProducto>[], index: number = 0) {
      vi.mocked(api.get).mockResolvedValue(productos)
      renderPage()
      await waitForLoad()
      const editBtns = screen.getAllByTitle('Editar')
      fireEvent.click(editBtns[index])
      await waitFor(() => {
        expect(screen.getByText('Editar producto')).toBeInTheDocument()
      })
    }

    it('opens with the product data prefilled (defaultValues)', async () => {
      await openEditFor(mockProductos, 0) // AMANTINA, codigo AMT-001, droga ACTIVO

      expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('AMANTINA')
      expect((screen.getByLabelText(/Código/) as HTMLInputElement).value).toBe('AMT-001')
    })

    it('sends the modified presentacion in the edit payload', async () => {
      vi.mocked(api.patch).mockResolvedValue(mockProductos[1])
      // Etiqueta PENDIENTE_REVISION with a valid IGET code so client validation passes
      const etiqueta = createProducto({
        id: 'prod-2',
        nombreBase: 'VITAMINA B12',
        codigo: 'IGET-100',
        categoria: 'etiqueta',
        presentacion: 250,
        mercadosHabilitados: ['argentina', 'colombia'],
        estado: 'PENDIENTE_REVISION',
      })
      await openEditFor([etiqueta])

      const presentacionInput = screen.getByLabelText(/Presentación/) as HTMLInputElement
      expect(presentacionInput.value).toBe('250')
      fireEvent.change(presentacionInput, { target: { value: '300' } })

      fireEvent.click(screen.getByText('Guardar cambios'))

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/productos/prod-2',
          expect.objectContaining({ presentacion: 300 }),
        )
      })
    })

    it('renders immutable category, markets and code for ACTIVO products', async () => {
      const activa = createProducto({
        id: 'prod-etiqueta-activa',
        nombreBase: 'ETIQUETA ACTIVA',
        codigo: 'IGET-100',
        categoria: 'etiqueta',
        presentacion: 250,
        mercadosHabilitados: ['argentina', 'colombia'],
      })
      await openEditFor([activa])

      const dialog = screen.getByRole('dialog')
      // Category is static text, not an editable select
      expect(within(dialog).getByText('Etiqueta')).toBeInTheDocument()
      expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
      // Market chips are not interactive for ACTIVO: canEditMercados is only
      // true for PENDIENTE_REVISION, so the section is not rendered at all
      expect(within(dialog).queryByRole('button', { name: 'Argentina' })).not.toBeInTheDocument()
      expect(within(dialog).queryByText('País / mercados habilitados')).not.toBeInTheDocument()
      // Code input is disabled with the immutable-state hint
      expect(within(dialog).getByLabelText(/Código/)).toBeDisabled()
      expect(within(dialog).getByText(/No se puede modificar en estado Activo/)).toBeInTheDocument()
    })

    it('refetches the products list after a successful edit', async () => {
      vi.mocked(api.patch).mockResolvedValue(mockProductos[0])
      await openEditFor(mockProductos, 0)
      const getCallsBeforeSave = vi.mocked(api.get).mock.calls.length

      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'AMANTINA EDITADA' } })
      fireEvent.click(screen.getByText('Guardar cambios'))

      // Mutation succeeded → useUpdateProducto invalidates productosKeys.all →
      // the active list query refetches (real QueryClient from test-utils)
      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/productos/prod-1', expect.anything())
      })
      await waitFor(() => {
        expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(getCallsBeforeSave)
      })
    })
  })

  // ─── UAT-7: Cancel state-flow dialogs ─────────────────────────────────────

  describe('UAT-7: Cancel state-flow dialogs', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    async function openConfirmDialog(producto: ReturnType<typeof createProducto>, actionTitle: string, dialogTitle: string) {
      vi.mocked(api.get).mockResolvedValue([producto])
      renderPage()
      await waitForLoad()

      // Preserve search + filters across the dialog interaction
      fireEvent.change(screen.getByPlaceholderText('Buscar por código o nombre...'), { target: { value: 'TES' } })
      fireEvent.change(screen.getByLabelText('Filtrar por categoría'), { target: { value: producto.categoria } })
      fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: producto.estado } })

      fireEvent.click(screen.getByTitle(actionTitle))
      await waitFor(() => {
        expect(screen.getByText(dialogTitle)).toBeInTheDocument()
      })
    }

    function expectFiltersPreserved(categoria: string, estado: string) {
      expect((screen.getByPlaceholderText('Buscar por código o nombre...') as HTMLInputElement).value).toBe('TES')
      expect((screen.getByLabelText('Filtrar por categoría') as HTMLSelectElement).value).toBe(categoria)
      expect((screen.getByLabelText('Filtrar por estado') as HTMLSelectElement).value).toBe(estado)
    }

    it('Cancel on the activate dialog closes, triggers no mutation, keeps filters', async () => {
      const pendiente = createProducto({ id: 'prod-pendiente', nombreBase: 'TEST', estado: 'PENDIENTE_REVISION', categoria: 'droga' })
      await openConfirmDialog(pendiente, 'Activar', 'Activar producto')

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Activar producto')).not.toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
      expectFiltersPreserved('droga', 'PENDIENTE_REVISION')
    })

    it('Cancel on the reactivate dialog closes, triggers no mutation, keeps filters', async () => {
      const inactivo = createProducto({ id: 'prod-inactivo', nombreBase: 'TEST', estado: 'INACTIVO', categoria: 'droga' })
      await openConfirmDialog(inactivo, 'Reactivar', 'Reactivar producto')

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Reactivar producto')).not.toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
      expectFiltersPreserved('droga', 'INACTIVO')
    })

    it('Cancel on the deactivate dialog closes, triggers no mutation, keeps filters', async () => {
      const activo = createProducto({ id: 'prod-activo', nombreBase: 'TEST', estado: 'ACTIVO', categoria: 'droga' })
      await openConfirmDialog(activo, 'Desactivar', 'Desactivar producto')

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Desactivar producto')).not.toBeInTheDocument()
      })
      expect(api.post).not.toHaveBeenCalled()
      expectFiltersPreserved('droga', 'ACTIVO')
    })

    it('Cancel on the delete dialog closes, triggers no mutation, keeps filters', async () => {
      const pendiente = createProducto({ id: 'prod-pendiente', nombreBase: 'TEST', estado: 'PENDIENTE_REVISION', categoria: 'droga' })
      await openConfirmDialog(pendiente, 'Eliminar', 'Eliminar producto')

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Eliminar producto')).not.toBeInTheDocument()
      })
      expect(api.del).not.toHaveBeenCalled()
      expectFiltersPreserved('droga', 'PENDIENTE_REVISION')
    })

    it('import Cerrar button resets the error state, closes without any request and keeps filters', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.change(screen.getByPlaceholderText('Buscar por código o nombre...'), { target: { value: 'TES' } })
      fireEvent.change(screen.getByLabelText('Filtrar por categoría'), { target: { value: 'etiqueta' } })
      fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'ACTIVO' } })

      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })

      // Unsupported file → error state
      const fileInput = screen.getByLabelText(/Archivo/i) as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'catalogo.pdf', { type: 'application/pdf' })] } })
      expect(screen.getByText('Formato no soportado. Use archivos .xls, .xlsx o .csv.')).toBeInTheDocument()

      const cerrarButton = screen.getByRole('button', { name: 'Cerrar' })
      expect(cerrarButton).toHaveAttribute('type', 'button')
      fireEvent.click(cerrarButton)

      await waitFor(() => {
        expect(screen.queryByText('Importar productos')).not.toBeInTheDocument()
      })
      expect(api.postForm).not.toHaveBeenCalled()
      expectFiltersPreserved('etiqueta', 'ACTIVO')

      // Reopen → button routes through handleOpenChange → resetState() cleared error and file
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })
      expect(screen.queryByText('Formato no soportado. Use archivos .xls, .xlsx o .csv.')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previsualizar' })).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Archivo/i) as HTMLInputElement).value).toBe('')
    })

    it('import ESC close (handleOpenChange) resets the error state', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })

      // Unsupported file → error state
      const fileInput = screen.getByLabelText(/Archivo/i) as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'catalogo.pdf', { type: 'application/pdf' })] } })
      expect(screen.getByText('Formato no soportado. Use archivos .xls, .xlsx o .csv.')).toBeInTheDocument()

      // Escape routes through handleOpenChange → resetState() clears the error
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => {
        expect(screen.queryByText('Importar productos')).not.toBeInTheDocument()
      })
      expect(api.postForm).not.toHaveBeenCalled()

      // Reopen → error and file state were reset
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })
      expect(screen.queryByText('Formato no soportado. Use archivos .xls, .xlsx o .csv.')).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Archivo/i) as HTMLInputElement).value).toBe('')
    })

    it('import Cancelar button after a preview resets result and file state, closes without confirming and keeps filters', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      vi.mocked(api.postForm).mockResolvedValue({
        filas: [{ fila: 2, producto: { nombreBase: 'DROGA X', nombreCompleto: 'DROGA X', categoria: 'droga', codigo: null }, valido: true }],
        validas: 1,
        invalidas: 0,
      })
      renderPage()
      await waitForLoad()

      fireEvent.change(screen.getByPlaceholderText('Buscar por código o nombre...'), { target: { value: 'TES' } })
      fireEvent.change(screen.getByLabelText('Filtrar por categoría'), { target: { value: 'droga' } })
      fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'PENDIENTE_REVISION' } })

      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })

      const fileInput = screen.getByLabelText(/Archivo/i) as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'ok.csv', { type: 'text/csv' })] } })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }))
      await waitFor(() => {
        expect(screen.getByText('1 válidas')).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Importar productos')).not.toBeInTheDocument()
      })
      // Only the dry-run request may have happened — never the confirm one
      expect(vi.mocked(api.postForm).mock.calls.map((call: any) => String(call[0])).some((url: string) => url.includes('/confirmar'))).toBe(false)
      expectFiltersPreserved('droga', 'PENDIENTE_REVISION')

      // Reopen → button routes through handleOpenChange → resetState() cleared result and file
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })
      expect(screen.queryByText(/1 válidas/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previsualizar' })).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Archivo/i) as HTMLInputElement).value).toBe('')
    })

    it('import ESC close (handleOpenChange) resets result and file state after a preview', async () => {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      vi.mocked(api.postForm).mockResolvedValue({
        filas: [{ fila: 2, producto: { nombreBase: 'DROGA X', nombreCompleto: 'DROGA X', categoria: 'droga', codigo: null }, valido: true }],
        validas: 1,
        invalidas: 0,
      })
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })

      const fileInput = screen.getByLabelText(/Archivo/i) as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [new File(['x'], 'ok.csv', { type: 'text/csv' })] } })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }))
      await waitFor(() => {
        expect(screen.getByText('1 válidas')).toBeInTheDocument()
      })

      // Escape routes through handleOpenChange → resetState() clears file/result/error
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => {
        expect(screen.queryByText('Importar productos')).not.toBeInTheDocument()
      })

      // Reopen → result and file state were reset
      fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
      await waitFor(() => {
        expect(screen.getByText('Importar productos')).toBeInTheDocument()
      })
      expect(screen.queryByText(/1 válidas/)).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Archivo/i) as HTMLInputElement).value).toBe('')
    })
  })

  // ─── UAT-8: Create dialog cancel clears errors ────────────────────────────

  describe('UAT-8: Create dialog cancel clears errors', () => {
    async function openCreateWithServerError() {
      vi.mocked(api.get).mockResolvedValue(mockProductos)
      vi.mocked(api.post).mockRejectedValue(new ApiError(400, 'Datos inválidos'))
      renderPage()
      await waitForLoad()

      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })

      // Trigger a real server error on create
      const nameInput = screen.getByLabelText(/Nombre/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'DROGA CON ERROR' } })
      fireEvent.click(screen.getByText('Crear producto'))
      await waitFor(() => {
        expect(screen.getByText('Datos inválidos')).toBeInTheDocument()
      })
      expect(api.post).toHaveBeenCalledTimes(1)
    }

    it('Cancel button clears the server error and resets the form', async () => {
      await openCreateWithServerError()

      const cancelButton = screen.getByRole('button', { name: 'Cancelar' })
      expect(cancelButton).toHaveAttribute('type', 'button')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Nuevo producto')).not.toBeInTheDocument()
      })
      expect(api.post).toHaveBeenCalledTimes(1)

      // Reopen → button routes through handleOpenChange → reset() + setServerError(null)
      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })
      expect(screen.queryByText('Datos inválidos')).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('')
    })

    it('ESC close (handleOpenChange) clears the server error and resets the form', async () => {
      await openCreateWithServerError()

      // Escape routes through handleOpenChange → reset() + setServerError(null)
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => {
        expect(screen.queryByText('Nuevo producto')).not.toBeInTheDocument()
      })

      // Reopen → serverError reset, form reset
      fireEvent.click(screen.getByText('Nuevo'))
      await waitFor(() => {
        expect(screen.getByText('Nuevo producto')).toBeInTheDocument()
      })
      expect(screen.queryByText('Datos inválidos')).not.toBeInTheDocument()
      expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('')
    })
  })

  // ─── 4.6: State transitions ────────────────────────────────────────────────

  describe('4.6: State transitions', () => {
    it('activates a PENDIENTE_REVISION product', async () => {
      const pendiente = createProducto({
        id: 'prod-pendiente',
        nombreBase: 'TEST',
        estado: 'PENDIENTE_REVISION',
        codigo: 'IGET001',
        categoria: 'etiqueta',
        presentacion: 250,
        mercadosHabilitados: ['argentina', 'colombia'],
      })
      vi.mocked(api.get).mockResolvedValue([pendiente])
      vi.mocked(api.post).mockResolvedValue({ ...pendiente, estado: 'ACTIVO' })

      renderPage()
      await waitForLoad()

      const activarBtn = screen.getByTitle('Activar')
      fireEvent.click(activarBtn)

      await waitFor(() => {
        expect(screen.getByText(/Activar producto/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Activar'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/productos/prod-pendiente/activar')
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('TEST'))
      })
    })

    it('deactivates an ACTIVO product', async () => {
      const activo = createProducto({
        id: 'prod-activo',
        nombreBase: 'TEST',
        estado: 'ACTIVO',
        categoria: 'droga',
      })
      vi.mocked(api.get).mockResolvedValue([activo])
      vi.mocked(api.post).mockResolvedValue({ ...activo, estado: 'INACTIVO' })

      renderPage()
      await waitForLoad()

      const desactivarBtn = screen.getByTitle('Desactivar')
      fireEvent.click(desactivarBtn)

      await waitFor(() => {
        expect(screen.getByText(/Desactivar producto/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Desactivar'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/productos/prod-activo/desactivar')
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('TEST'))
      })
    })

    it('reactivates an INACTIVO product', async () => {
      const inactivo = createProducto({
        id: 'prod-inactivo',
        nombreBase: 'TEST',
        estado: 'INACTIVO',
        categoria: 'droga',
      })
      vi.mocked(api.get).mockResolvedValue([inactivo])
      vi.mocked(api.post).mockResolvedValue({ ...inactivo, estado: 'ACTIVO' })

      renderPage()
      await waitForLoad()

      const reactivarBtn = screen.getByTitle('Reactivar')
      fireEvent.click(reactivarBtn)

      await waitFor(() => {
        expect(screen.getByText(/Reactivar producto/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Reactivar'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/productos/prod-inactivo/reactivar')
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('TEST'))
      })
    })
  })
})
