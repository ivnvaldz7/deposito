import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AutomationPage from '../AutomationPage'
import { useAutomationAliases, useConfirmDraft, useCreateDraft, useDeleteAutomationAlias, useDraft, useUpdateDraft } from '../../../queries/use-automation'

const { createClienteMock, updateDraftMock } = vi.hoisted(() => ({
  createClienteMock: vi.fn(),
  updateDraftMock: vi.fn(),
}))

const AUTOMATION_WORK_STORAGE_KEY = 'ale-bet:automation:work:v1'

vi.mock('../../../queries/use-automation', () => ({
  useAutomationAliases: vi.fn(),
  useConfirmDraft: vi.fn(),
  useCreateDraft: vi.fn(),
  useDeleteAutomationAlias: vi.fn(),
  useDraft: vi.fn(),
  useUpdateDraft: vi.fn(),
}))

vi.mock('../../../queries', () => ({
  useClientes: () => ({ data: [] }),
  useCreateCliente: () => ({ mutateAsync: createClienteMock, isPending: false }),
  useProductos: () => ({ data: [{ id: 'p1', nombre: 'Prod 1', sku: 'P1', unidadesPorCaja: 10 }] }),
  useProductosSearch: () => ({ data: [] }),
}))

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AutomationPage />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('AutomationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    ;(useAutomationAliases as any).mockReturnValue({
      data: {
        productAliases: [{ id: 'p1', alias: 'prod alias', type: 'product', producto: { nombre: 'Prod A' } }],
        clientAliases: []
      }
    })
    ;(useDeleteAutomationAlias as any).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false })
    ;(useCreateDraft as any).mockReturnValue({ mutateAsync: vi.fn() })
    vi.mocked(useUpdateDraft).mockReturnValue({ mutateAsync: updateDraftMock } as never)
    ;(useConfirmDraft as any).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) })
    ;(useDraft as any).mockReturnValue({ data: null, refetch: vi.fn() })
    createClienteMock.mockResolvedValue({ id: 'cliente-nuevo', nombre: 'Veterinaria Campo' })
    updateDraftMock.mockResolvedValue({})
  })

  it('restaura el mensaje al desmontar y volver a Automation', async () => {
    const user = userEvent.setup()
    const first = renderComponent()

    await user.type(screen.getByPlaceholderText(/Veterinaria/i), 'Veterinaria Centro\n20 Amantina')
    await waitFor(() => expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).toContain('20 Amantina'))

    first.unmount()
    renderComponent()

    expect(screen.getByPlaceholderText(/Veterinaria/i)).toHaveValue('Veterinaria Centro\n20 Amantina')
  })

  it('restaura el draft interpretado y sus correcciones desde el id persistido', () => {
    localStorage.setItem(AUTOMATION_WORK_STORAGE_KEY, JSON.stringify({
      version: 1,
      originalText: 'CAMPO\n20 Amantina',
      draftId: 'draft-restaurado',
    }))
    vi.mocked(useDraft).mockReturnValue({
      data: {
        draft: { id: 'draft-restaurado', estado: 'READY', version: 4 },
        effectiveSnapshot: {
          customerCandidate: { customerId: 'cliente-nuevo', nombre: 'Veterinaria Campo' },
          customerCandidateText: 'CAMPO',
          lines: [{
            lineId: 'line-1',
            originalText: '20 Amantina',
            productCandidate: { productId: 'p1' },
            warnings: [],
            requiresReview: false,
            quantity: { totalUnits: 20, mode: 'UNITS' },
          }],
          warnings: [],
          requiresReview: false,
        },
        availability: [],
      },
      refetch: vi.fn(),
    } as never)

    renderComponent()

    expect(useDraft).toHaveBeenCalledWith('draft-restaurado')
    expect(screen.getByText('Veterinaria Campo')).toBeInTheDocument()
    expect(screen.getByText('Prod 1')).toBeInTheDocument()
  })

  it('Limpiar elimina el mensaje persistido', async () => {
    const user = userEvent.setup()
    const first = renderComponent()

    await user.type(screen.getByPlaceholderText(/Veterinaria/i), 'Pedido temporal')
    await waitFor(() => expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).toBeNull()
    first.unmount()
    renderComponent()
    expect(screen.getByPlaceholderText(/Veterinaria/i)).toHaveValue('')
  })

  it('eliminar alias abre modal propio', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByText(/Equivalencias aprendidas/i))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText(/¿Eliminar "prod alias"\?/i)).toBeInTheDocument()
  })

  it('cancelar eliminación cierra el modal', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByText(/Equivalencias aprendidas/i))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })

  it('confirmar eliminación llama a mutate y cierra modal', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    ;(useDeleteAutomationAlias as any).mockReturnValue({ mutateAsync, isPending: false })
    
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByText(/Equivalencias aprendidas/i))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    
    // El modal usa "Eliminar" en la accion, asi que hay dos botones "Eliminar" en pantalla
    // uno del dialog y otro de la lista
    const confirmButtons = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ type: 'product', id: 'p1' })
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    })
  })

  describe('Flujo de Confirmar pedido', () => {
    beforeEach(() => {
      ;(useDraft as any).mockReturnValue({
        data: {
          draft: { id: 'd1', estado: 'READY', version: 1 },
          effectiveSnapshot: {
            customerCandidate: { customerId: 'c1' },
            lines: [],
            warnings: [],
            requiresReview: false
          },
          availability: []
        },
        refetch: vi.fn()
      })
      // setDraftId to 'd1' implicitly by simulating an interpret
      // Wait, draft is fetched if draftId is set. In the test, we mock useDraft to return it directly.
      // But AutomationPage state draftId is null. We need to mock createDraft to set it, or just use useDraft directly?
      // AutomationPage passes draftId to useDraft. If draftId is null, it might still return data if we mock it, but the component checks `if (draftId && draftData)`.
      // Let's trigger a draft creation to set draftId.
    })

    async function triggerDraftCreation(user: ReturnType<typeof userEvent.setup>) {
      ;(useCreateDraft as any).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ id: 'd1' }) })
      const input = screen.getByPlaceholderText(/Veterinaria/i)
      await user.type(input, 'pedido de prueba')
      await user.click(screen.getByRole('button', { name: 'Interpretar pedido' }))
    }

    it('Confirmar pedido abre modal', async () => {
      const user = userEvent.setup()
      renderComponent()
      await triggerDraftCreation(user)
      
      const btn = await screen.findByRole('button', { name: 'Confirmar pedido' })
      await user.click(btn)
      
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      expect(screen.getAllByText('Confirmar pedido').length).toBeGreaterThan(0)
      expect(screen.getByText('¿Confirmar pedido y descontar stock físico?')).toBeInTheDocument()
    })

    it('cliente desconocido permite crearlo, seleccionarlo y preservar las líneas', async () => {
      vi.mocked(useDraft).mockReturnValue({
        data: {
          draft: { id: 'd1', estado: 'DRAFT', version: 1 },
          effectiveSnapshot: {
            customerCandidate: null,
            customerCandidateText: 'CAMPO',
            lines: [{
              lineId: 'line-1',
              originalText: '20 Amantina',
              productCandidate: { productId: 'p1' },
              warnings: [],
              requiresReview: false,
              quantity: { explicitUnits: 20, totalUnits: 20, mode: 'UNITS' },
            }],
            warnings: [],
            requiresReview: true,
          },
          availability: [],
        },
        refetch: vi.fn(),
      } as never)
      const user = userEvent.setup()
      renderComponent()
      await triggerDraftCreation(user)

      await user.click(screen.getByRole('button', { name: 'Cambiar' }))
      expect(screen.getByRole('button', { name: '+ Crear cliente' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '+ Crear cliente' }))
      await user.type(screen.getByLabelText('Nombre / Razón social'), 'Veterinaria Campo')
      await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

      await waitFor(() => {
        expect(createClienteMock).toHaveBeenCalledWith({ nombre: 'Veterinaria Campo' })
        expect(updateDraftMock).toHaveBeenCalledWith({
          id: 'd1',
          data: { expectedVersion: 1, clienteId: 'cliente-nuevo', rememberClientAlias: true },
        })
      })
      expect(screen.getByText('Prod 1')).toBeInTheDocument()
      expect(screen.getByText((_, element) => element?.textContent === 'Total: 20 unidades')).toBeInTheDocument()
    })

    it('un error al crear cliente mantiene intacto el draft actual', async () => {
      createClienteMock.mockRejectedValueOnce(new Error('Nombre duplicado'))
      vi.mocked(useDraft).mockReturnValue({
        data: {
          draft: { id: 'd1', estado: 'DRAFT', version: 1 },
          effectiveSnapshot: {
            customerCandidate: null,
            customerCandidateText: 'CAMPO',
            lines: [{
              lineId: 'line-1',
              originalText: '20 Amantina',
              productCandidate: { productId: 'p1' },
              warnings: [],
              requiresReview: false,
              quantity: { explicitUnits: 20, totalUnits: 20, mode: 'UNITS' },
            }],
            warnings: [],
            requiresReview: true,
          },
          availability: [],
        },
        refetch: vi.fn(),
      } as never)
      const user = userEvent.setup()
      renderComponent()
      await triggerDraftCreation(user)

      await user.click(screen.getByRole('button', { name: 'Cambiar' }))
      await user.click(screen.getByRole('button', { name: '+ Crear cliente' }))
      await user.type(screen.getByLabelText('Nombre / Razón social'), 'Veterinaria Campo')
      await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Nombre duplicado')
      expect(updateDraftMock).not.toHaveBeenCalled()
      expect(screen.getByText('Prod 1')).toBeInTheDocument()
      expect(screen.getByText((_, element) => element?.textContent === 'Total: 20 unidades')).toBeInTheDocument()
    })

    it('Cancelar / Volver descarta la persistencia explícitamente', async () => {
      const user = userEvent.setup()
      const view = renderComponent()
      await triggerDraftCreation(user)
      await waitFor(() => expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).not.toBeNull())

      await user.click(screen.getByRole('button', { name: 'Cancelar / Volver' }))
      expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).toBeNull()

      view.unmount()
      renderComponent()
      expect(screen.getByPlaceholderText(/Veterinaria/i)).toHaveValue('')
    })

    it('confirmar exitosamente elimina la persistencia', async () => {
      const user = userEvent.setup()
      const view = renderComponent()
      await triggerDraftCreation(user)
      await waitFor(() => expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).not.toBeNull())

      await user.click(await screen.findByRole('button', { name: 'Confirmar pedido' }))
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))
      await waitFor(() => expect(localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)).toBeNull())

      view.unmount()
      renderComponent()
      expect(screen.getByPlaceholderText(/Veterinaria/i)).toHaveValue('')
    })

    it('estado procesando bloquea y luego muestra success animado, permitiendo Processar otro pedido y Ver pedido', async () => {
      const mutateAsync = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)))
      ;(useConfirmDraft as any).mockReturnValue({ mutateAsync })
      
      const user = userEvent.setup()
      const { rerender } = renderComponent()
      await triggerDraftCreation(user)
      
      const btn = await screen.findByRole('button', { name: 'Confirmar pedido' })
      await user.click(btn)
      
      // Confirmar en el modal
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))
      
      expect(screen.getByText('Procesando pedido...')).toBeInTheDocument()
      
      // Update useDraft mock to return CONFIRMED
      ;(useDraft as any).mockReturnValue({
        data: {
          draft: { id: 'd1', estado: 'CONFIRMED', version: 2, pedidoId: 'ped1' },
        },
        refetch: vi.fn()
      })
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BrowserRouter>
            <AutomationPage />
          </BrowserRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Pedido confirmado')).toBeInTheDocument()
        expect(screen.getByText('Stock actualizado correctamente.')).toBeInTheDocument()
      })

      expect(screen.getByRole('button', { name: 'Procesar otro pedido' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ver pedido' })).toBeInTheDocument()
    })

    it('error contextual muestra mensaje en el modal sin cerrarlo', async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error('Stock insuficiente según el servidor'))
      ;(useConfirmDraft as any).mockReturnValue({ mutateAsync })
      
      const user = userEvent.setup()
      renderComponent()
      await triggerDraftCreation(user)
      
      const btn = await screen.findByRole('button', { name: 'Confirmar pedido' })
      await user.click(btn)
      
      await user.click(screen.getByRole('button', { name: 'Confirmar' }))
      
      await waitFor(() => {
        expect(screen.getByText('No se pudo confirmar el pedido')).toBeInTheDocument()
        expect(screen.getByText('El stock cambió desde la última revisión.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      })
    })
  })
})
