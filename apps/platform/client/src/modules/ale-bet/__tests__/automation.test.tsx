import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AutomationPage from '../pages/automation/AutomationPage'
import { aleBetApi } from '../lib/api'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  aleBetApi: {
    automation: {
      createDraft: vi.fn(),
      getDraft: vi.fn(),
      updateDraft: vi.fn(),
      confirmDraft: vi.fn(),
      getAliases: vi.fn(),
      deleteProductAlias: vi.fn(),
      deleteClientAlias: vi.fn(),
    },
    clientes: {
      list: vi.fn()
    },
    productos: {
      list: vi.fn()
    }
  }
}))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AutomationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('ale-bet:automation:work:v1')
    ;(aleBetApi.clientes.list as any).mockResolvedValue([{ id: 'c1', nombre: 'Veterinaria Centro' }])
    ;(aleBetApi.productos.list as any).mockResolvedValue([
      { id: 'p1', nombre: 'Olivitasan 500 ML', sku: 'OLI-500', unidadesPorCaja: 20 },
      { id: 'p2', nombre: 'Amantina', sku: 'AMA-001', unidadesPorCaja: 1 }
    ])
    ;(aleBetApi.automation.getAliases as any).mockResolvedValue({ productAliases: [], clientAliases: [] })
  })

  it('renders input area and can submit', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-1' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-1', estado: 'READY', version: 1 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: false,
        warnings: [],
        lines: [
          {
            originalText: '3 cajas Olivitasan',
            productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 },
            warnings: [],
            quantity: { mode: 'BOXES', explicitBoxes: 3, explicitUnits: null, totalUnits: 60 }
          }
        ]
      },
      availability: [
        { productId: 'p1', availableUnits: 340, status: 'DISPONIBLE' }
      ]
    })

    render(<AutomationPage />, { wrapper: createWrapper() })
    
    const textarea = screen.getByPlaceholderText(/Veterinaria Centro/)
    fireEvent.change(textarea, { target: { value: '3 cajas Olivitasan' } })
    
    const interpretBtn = screen.getByText('Interpretar pedido')
    fireEvent.click(interpretBtn)
    
    await waitFor(() => {
      expect(aleBetApi.automation.createDraft).toHaveBeenCalledWith({ originalText: '3 cajas Olivitasan' })
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Veterinaria Centro/)).toBeInTheDocument()
    })
    
    expect(screen.getByText('Olivitasan 500 ML')).toBeInTheDocument()
    expect(screen.getByText(/Total: 60 unidades/)).toBeInTheDocument()
    expect(screen.getByText(/Disponible: 340/)).toBeInTheDocument()
    
    const confirmBtn = screen.getByText('Confirmar pedido')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('handles warnings and blocks confirmation', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-2' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-2', estado: 'READY', version: 1 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: true,
        warnings: [],
        lines: [
          {
            originalText: 'Olivitasan ambiguo',
            productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 0.5 },
            warnings: ['Encontré más de una coincidencia.'],
            requiresReview: true,
            quantity: { mode: 'UNITS', explicitBoxes: null, explicitUnits: 5, totalUnits: 5 }
          }
        ]
      },
      availability: [
        { productId: 'p1', availableUnits: 340, status: 'DISPONIBLE' }
      ]
    })

    render(<AutomationPage />, { wrapper: createWrapper() })
    
    const textarea = screen.getByPlaceholderText(/Veterinaria Centro/)
    fireEvent.change(textarea, { target: { value: 'Olivitasan ambiguo' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))
    
    await waitFor(() => {
      expect(screen.getByText('⚠ Revisar producto')).toBeInTheDocument()
    })
    expect(screen.getByText('Encontré más de una coincidencia.')).toBeInTheDocument()
    
    const confirmBtn = screen.getByText('Confirmar pedido')
    expect(confirmBtn).toBeDisabled()
  })

  it('edits one unresolved product through the semantic line contract', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-unresolved' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-unresolved', estado: 'DRAFT', version: 1 },
      effectiveSnapshot: {
        customerCandidate: null,
        requiresReview: true,
        warnings: ['CUSTOMER_UNRESOLVED'],
        lines: [{
          lineId: 'line-oli',
          originalText: '48 oli 300',
          productCandidate: null,
          warnings: ['PRODUCT_UNRESOLVED'],
          requiresReview: true,
          quantity: { mode: 'UNITS', explicitBoxes: null, explicitUnits: 48, totalUnits: null }
        }]
      },
      availability: []
    })
    ;(aleBetApi.automation.updateDraft as any).mockResolvedValue({ id: 'draft-unresolved', estado: 'DRAFT', version: 2 })

    render(<AutomationPage />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByPlaceholderText(/Veterinaria Centro/), { target: { value: 'PROVET\n48 oli 300' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))

    const search = await screen.findByPlaceholderText('Buscar producto para asignar...')
    fireEvent.change(search, { target: { value: 'oli' } })
    fireEvent.click(screen.getByText('Olivitasan 500 ML'))

    await waitFor(() => expect(aleBetApi.automation.updateDraft).toHaveBeenCalledWith(
      'draft-unresolved',
      {
        expectedVersion: 1,
        line: {
          lineId: 'line-oli',
          productId: 'p1',
          cajas: 0,
          unidades: 48,
          mode: 'UNITS',
          rememberAlias: true,
        }
      }
    ))
  })

  it('ofrece descartar explícitamente una línea sin coincidencia', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-discard' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-discard', estado: 'DRAFT', version: 1 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: true,
        warnings: [],
        lines: [
          { lineId: 'line-valid-a', originalText: '2 Olivitasan', lineState: 'VALID', productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 }, warnings: [], requiresReview: false, quantity: { mode: 'UNITS', totalUnits: 2 } },
          { lineId: 'line-unresolved', originalText: 'Sin cargo', lineState: 'NEEDS_REVIEW', productCandidate: null, warnings: ['PRODUCT_UNRESOLVED'], requiresReview: true, quantity: { mode: 'AMBIGUOUS', totalUnits: null } },
        ],
      },
      availability: [{ productId: 'p1', availableUnits: 340, status: 'DISPONIBLE' }],
    })
    ;(aleBetApi.automation.updateDraft as any).mockResolvedValue({ id: 'draft-discard', estado: 'READY', version: 2 })

    render(<AutomationPage />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByPlaceholderText(/Veterinaria Centro/), { target: { value: '2 Olivitasan\nSin cargo' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))

    const discard = await screen.findByRole('button', { name: 'No es un producto' })
    expect(screen.getByText('Desconocido · Sin cargo')).toBeInTheDocument()
    expect(screen.getByText('Confirmar pedido')).toBeDisabled()
    fireEvent.click(discard)
    await waitFor(() => expect(aleBetApi.automation.updateDraft).toHaveBeenCalledWith(
      'draft-discard',
      { expectedVersion: 1, line: { lineId: 'line-unresolved', action: 'DISCARD' } },
    ))
  })

  it('muestra una línea descartada fuera de los warnings y permite deshacerla', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-undiscard' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-undiscard', estado: 'READY', version: 2 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: false,
        warnings: [],
        lines: [
          { lineId: 'line-valid-a', originalText: '2 Olivitasan', lineState: 'VALID', productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 }, warnings: [], requiresReview: false, quantity: { mode: 'UNITS', totalUnits: 2 } },
          { lineId: 'line-unresolved', originalText: 'Sin cargo', lineState: 'DISCARDED', productCandidate: null, warnings: ['PRODUCT_UNRESOLVED'], requiresReview: true, quantity: { mode: 'AMBIGUOUS', totalUnits: null } },
        ],
      },
      availability: [{ productId: 'p1', availableUnits: 340, status: 'DISPONIBLE' }],
    })
    ;(aleBetApi.automation.updateDraft as any).mockResolvedValue({ id: 'draft-undiscard', estado: 'DRAFT', version: 3 })

    render(<AutomationPage />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByPlaceholderText(/Veterinaria Centro/), { target: { value: '2 Olivitasan\nSin cargo' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))

    expect(await screen.findByText('Línea desestimada · Sin cargo')).toBeInTheDocument()
    expect(screen.queryByText('PRODUCT_UNRESOLVED')).not.toBeInTheDocument()
    expect(screen.getByText('Confirmar pedido')).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(aleBetApi.automation.updateDraft).toHaveBeenCalledWith(
      'draft-undiscard',
      { expectedVersion: 2, line: { lineId: 'line-unresolved', action: 'RESTORE' } },
    ))
  })

  it('resume el effectiveSnapshot actual y confirma con su versión', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-summary' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-summary', estado: 'READY', version: 2 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: false,
        warnings: [],
        lines: [{
          lineId: 'line-oli',
          originalText: '48 oli 300',
          productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 },
          warnings: [],
          quantity: { mode: 'UNITS', explicitBoxes: null, explicitUnits: 48, totalUnits: 48 }
        }]
      },
      availability: [{ productId: 'p1', availableUnits: 48, status: 'DISPONIBLE' }]
    })
    ;(aleBetApi.automation.confirmDraft as any).mockResolvedValue({ draftId: 'draft-summary' })

    render(<AutomationPage />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByPlaceholderText(/Veterinaria Centro/), { target: { value: 'PROVET\n48 oli 300' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))

    await waitFor(() => expect(screen.getByText('Olivitasan 500 ML')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Confirmar pedido'))

    expect(screen.getAllByText('Veterinaria Centro').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1 productos')).toBeInTheDocument()
    expect(screen.getByText('48 unidades')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar', exact: true }))
    await waitFor(() => expect(aleBetApi.automation.confirmDraft).toHaveBeenCalledWith(
      'draft-summary',
      { expectedVersion: 2, selecciones: [], transferencias: [] },
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    ))
  })

  it('handles insufficient stock', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-3' })
    ;(aleBetApi.automation.getDraft as any).mockResolvedValue({
      draft: { id: 'draft-3', estado: 'READY', version: 1 },
      effectiveSnapshot: {
        customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
        requiresReview: false,
        warnings: [],
        lines: [
          {
            originalText: '1000 cajas Olivitasan',
            productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 },
            warnings: [],
            quantity: { mode: 'BOXES', explicitBoxes: 1000, explicitUnits: null, totalUnits: 20000 }
          }
        ]
      },
      availability: [
        { productId: 'p1', availableUnits: 340, status: 'INSUFICIENTE' }
      ]
    })

    render(<AutomationPage />, { wrapper: createWrapper() })
    
    const textarea = screen.getByPlaceholderText(/Veterinaria Centro/)
    fireEvent.change(textarea, { target: { value: '1000 cajas Olivitasan' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))
    
    await waitFor(() => {
      expect(screen.getByText(/Sin stock/)).toBeInTheDocument()
    })
    
    const confirmBtn = screen.getByText('Confirmar pedido')
    // Automation now creates the commercial order even when it cannot be
    // fulfilled today; billing emits partial remitos as stock becomes ready.
    expect(confirmBtn).toBeEnabled()
  })

  it('persists a quantity edit and renders the refetched draft', async () => {
    ;(aleBetApi.automation.createDraft as any).mockResolvedValue({ id: 'draft-edit' })
    ;(aleBetApi.automation.getDraft as any)
      .mockResolvedValueOnce({
        draft: { id: 'draft-edit', estado: 'READY', version: 1 },
        effectiveSnapshot: {
          customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
          requiresReview: false,
          warnings: [],
          lines: [{
            lineId: 'line-cetri',
            originalText: '12 cetri',
            productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 },
            warnings: [],
            quantity: { mode: 'UNITS', explicitBoxes: null, explicitUnits: 12, normalizedBoxes: 0, normalizedLooseUnits: 12, totalUnits: 12 }
          }]
        },
        availability: [{ productId: 'p1', availableUnits: 340, status: 'DISPONIBLE' }]
      })
      .mockResolvedValue({
        draft: { id: 'draft-edit', estado: 'READY', version: 2 },
        effectiveSnapshot: {
          customerCandidate: { customerId: 'c1', nombre: 'Veterinaria Centro', confidence: 1 },
          requiresReview: false,
          warnings: [],
          lines: [{
            lineId: 'line-cetri',
            originalText: '12 cetri',
            productCandidate: { productId: 'p1', nombre: 'Olivitasan 500 ML', confidence: 1 },
            warnings: [],
            quantity: { mode: 'BOXES', explicitBoxes: 1, explicitUnits: null, normalizedBoxes: 1, normalizedLooseUnits: 0, totalUnits: 20 }
          }]
        },
        availability: [{ productId: 'p1', availableUnits: 332, status: 'DISPONIBLE' }]
      })
    ;(aleBetApi.automation.updateDraft as any).mockResolvedValue({ id: 'draft-edit', version: 2 })

    render(<AutomationPage />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByPlaceholderText(/Veterinaria Centro/), { target: { value: 'ZENON\n12 cetri 1lt' } })
    fireEvent.click(screen.getByText('Interpretar pedido'))

    await waitFor(() => expect(screen.getByText('Olivitasan 500 ML')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

    await waitFor(() => expect(aleBetApi.automation.updateDraft).toHaveBeenCalledWith(
      'draft-edit',
      {
        expectedVersion: 1,
        line: { lineId: 'line-cetri', productId: 'p1', cajas: 1, unidades: 12, mode: 'UNITS' }
      }
    ))
    await waitFor(() => expect(aleBetApi.automation.getDraft).toHaveBeenCalledTimes(2))
    expect(screen.getByText(/Total: 20 unidades/)).toBeInTheDocument()
  })
})
