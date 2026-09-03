import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AutomationPage from '../AutomationPage'

const mockCreateDraft = vi.fn()
const mockUpdateDraft = vi.fn()
const mockConfirmDraft = vi.fn()

let mockedDraftId: string | null = null
let mockedDraftData: any = null

vi.mock('../../../queries/use-automation', () => ({
  useCreateDraft: () => ({ mutateAsync: mockCreateDraft }),
  useUpdateDraft: () => ({ mutateAsync: mockUpdateDraft }),
  useConfirmDraft: () => ({ mutateAsync: mockConfirmDraft }),
  useDraft: () => ({
    data: mockedDraftId ? mockedDraftData : null,
    refetch: vi.fn()
  })
}))

vi.mock('../../../queries', () => ({
  useClientes: () => ({ data: [{ id: 'c1', nombre: 'Cliente 1' }] }),
  useProductosSearch: () => ({ data: [] }),
  useProductos: () => ({ data: [{ id: 'p1', nombre: 'Prod 1', unidadesPorCaja: 12 }] })
}))

describe('AutomationPage - Rules of Hooks', () => {
  it('does not violate rules of hooks across transitions', async () => {
    const queryClient = new QueryClient()

    const ui = (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AutomationPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const { unmount } = render(ui)
    expect(screen.getByText('Procesar pedido')).toBeInTheDocument()

    // 2. Interpretar pedido
    const textarea = screen.getByPlaceholderText(/Veterinaria Centro/i)
    fireEvent.change(textarea, { target: { value: 'ZENON\n12 cetri' } })
    
    mockCreateDraft.mockImplementation(async () => {
      mockedDraftId = 'draft-1'
      mockedDraftData = {
        draft: { id: 'draft-1', estado: 'READY', version: 1 },
        effectiveSnapshot: {
          customerCandidate: { customerId: 'c1' },
          warnings: [],
          lines: [
            {
              productCandidate: { productId: 'p1' },
              warnings: [],
              quantity: { totalUnits: 12, mode: 'UNITS', originalExpression: '12 cetri', normalizedBoxes: 1, normalizedLooseUnits: 0 }
            }
          ]
        },
        availability: []
      }
      return { id: 'draft-1' }
    })

    const interpretBtn = screen.getByText('Interpretar pedido')
    fireEvent.click(interpretBtn)

    // 3. Draft pasa a preview con 1 producto
    await waitFor(() => {
      expect(screen.getByText('Confirmar pedido')).toBeInTheDocument()
    })

    // 4. Preview con varios productos (simular cambio en cache de React Query / estado de backend)
    act(() => {
      mockedDraftData.effectiveSnapshot.lines.push({
        productCandidate: { productId: 'p1' },
        warnings: [],
        quantity: { totalUnits: 24, mode: 'UNITS', originalExpression: '24 cetri', normalizedBoxes: 2, normalizedLooseUnits: 0 }
      })
    })

    // Forzar re-render con los nuevos datos (en la vida real lo causa React Query refetch)
    const render2 = render(ui)

    // 5. Editar cantidad
    // Esto disparará la renderización del editor y el PUT, el cual no debe explotar por hooks
    const changeBtn = render2.getAllByText('+')[0] // Cajas del primer prod
    fireEvent.click(changeBtn)

    // 6. Volver al estado inicial
    const cancelBtn = render2.getByText('Cancelar / Volver')
    fireEvent.click(cancelBtn)
    
    expect(render2.getAllByText('Procesar pedido').length).toBeGreaterThan(0)

    // Si llegamos hasta acá sin que salte el Error Boundary (o el error global de Hooks de React), el test es exitoso.
    unmount()
  })
})
