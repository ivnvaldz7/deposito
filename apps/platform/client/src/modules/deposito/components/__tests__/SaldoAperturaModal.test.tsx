import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SaldoAperturaModal } from '../SaldoAperturaModal'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn() },
}))

function renderModal(props: Partial<React.ComponentProps<typeof SaldoAperturaModal>> = {}) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <SaldoAperturaModal
        open={true}
        onOpenChange={vi.fn()}
        categoria="estuche"
        items={[]}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('SaldoAperturaModal', () => {
  it('renders standard layout for frascos without mercado selector', () => {
    renderModal({
      categoria: 'frasco',
      items: [{ id: '1', label: 'Frasco 1' }],
    })
    expect(screen.queryByLabelText('Mercado')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Inventario')).toBeEnabled()
  })

  it('renders mercado selector when items have mercado, and disables product select until market is chosen', () => {
    renderModal({
      categoria: 'estuche',
      items: [
        { id: 'col-1', label: 'Producto 1', mercado: 'colombia' },
        { id: 'arg-1', label: 'Producto 2', mercado: 'argentina' },
      ],
    })
    
    // Mercado should be visible
    const mercadoSelect = screen.getByLabelText('Mercado')
    expect(mercadoSelect).toBeInTheDocument()
    
    // Inventario should be disabled initially
    const inventarioSelect = screen.getByLabelText('Inventario')
    expect(inventarioSelect).toBeDisabled()
    
    // Save button should be disabled
    expect(screen.getByRole('button', { name: 'Guardar saldo de apertura' })).toBeDisabled()
  })

  it('filters products by selected mercado and clears product selection when market changes', async () => {
    const user = userEvent.setup()
    renderModal({
      categoria: 'etiqueta',
      items: [
        { id: 'arg-1', label: 'Etiq ARG', mercado: 'argentina' },
        { id: 'col-1', label: 'Etiq COL', mercado: 'colombia' },
      ],
    })
    
    const mercadoSelect = screen.getByLabelText('Mercado')
    const inventarioSelect = screen.getByLabelText('Inventario')
    
    // Check if Argentina is in the dropdown
    expect(screen.getByRole('option', { name: 'Argentina' })).toBeInTheDocument()
    
    // Select Argentina
    await user.selectOptions(mercadoSelect, 'argentina')
    
    // Now Inventario is enabled and shows Argentina items
    expect(inventarioSelect).toBeEnabled()
    expect(screen.getByText('Etiq ARG [Argentina]')).toBeInTheDocument()
    expect(screen.queryByText('Etiq COL [Colombia]')).not.toBeInTheDocument()
    
    // Select the product
    await user.selectOptions(inventarioSelect, 'arg-1')
    expect(inventarioSelect).toHaveValue('arg-1')
    
    // Change market to Colombia
    await user.selectOptions(mercadoSelect, 'colombia')
    
    // Product should be cleared
    expect(inventarioSelect).toHaveValue('')
    expect(screen.getByText('Etiq COL [Colombia]')).toBeInTheDocument()
    expect(screen.queryByText('Etiq ARG [Argentina]')).not.toBeInTheDocument()
  })

  it('renders Lote input only for droga and requires it for submission', async () => {
    const user = userEvent.setup()
    renderModal({
      categoria: 'droga',
      items: [{ id: 'prod-1', label: 'Droga 1' }],
    })
    
    const inventarioSelect = screen.getByLabelText('Inventario')
    const loteInput = screen.getByLabelText('Lote')
    const cantidadInput = screen.getByLabelText('Cantidad')
    const submitBtn = screen.getByRole('button', { name: 'Guardar saldo de apertura' })
    
    expect(loteInput).toBeInTheDocument()
    
    // Select product and enter quantity, but leave lote empty
    await user.selectOptions(inventarioSelect, 'prod-1')
    await user.type(cantidadInput, '10')
    await user.click(submitBtn)
    
    expect(screen.getByText('El lote es obligatorio para drogas.')).toBeInTheDocument()
    
    // Type lote
    await user.type(loteInput, 'LOTE-123')
    await user.click(submitBtn)
    
    expect(screen.queryByText('El lote es obligatorio para drogas.')).not.toBeInTheDocument()
  })
})
