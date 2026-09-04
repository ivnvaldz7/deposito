import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AutomationPage from '../AutomationPage'
import { useAutomationAliases, useConfirmDraft, useCreateDraft, useDeleteAutomationAlias, useDraft, useUpdateDraft } from '../../../queries/use-automation'

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
  useProductos: () => ({ data: [] }),
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
    ;(useAutomationAliases as any).mockReturnValue({
      data: {
        productAliases: [{ id: 'p1', alias: 'prod alias', type: 'product', producto: { nombre: 'Prod A' } }],
        clientAliases: []
      }
    })
    ;(useDeleteAutomationAlias as any).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false })
    ;(useCreateDraft as any).mockReturnValue({ mutateAsync: vi.fn() })
    ;(useUpdateDraft as any).mockReturnValue({ mutateAsync: vi.fn() })
    ;(useConfirmDraft as any).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) })
    ;(useDraft as any).mockReturnValue({ data: null, refetch: vi.fn() })
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
