import { renderWithQueryClient as render } from '@/test-utils'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LotAllocationSelector } from '../LotAllocationSelector'

describe('LotAllocationSelector', () => {
  it('muestra una sola vez un lote compartido y descuenta solamente desde Depósito', () => {
    const onConfirm = vi.fn()

    render(
      <LotAllocationSelector
        items={[{ id: 'item-1', productoId: 'producto-1', nombre: 'COMPLEJO B B12 B15 100 ML', cantidad: 24 }]}
        disponibilidad={{
          status: 'DISPONIBLE',
          stockTotal: 4_575,
          stockDeposito: 3_693,
          stockAcondicionado: 882,
          stockDisponiblePedido: 4_575,
          allocations: [{ itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-cb0096', cantidad: 24 }],
          lotes: [
            { itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-cb0096', numero: 'CB0096', fechaVencimiento: null, ubicacion: 'ACONDICIONADO', disponible: 882, vencido: false },
            { itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-cb0094', numero: 'CB0094', fechaVencimiento: null, ubicacion: 'DEPOSITO', disponible: 0, vencido: false },
            { itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-cb0096', numero: 'CB0096', fechaVencimiento: null, ubicacion: 'DEPOSITO', disponible: 3_693, vencido: false },
          ],
          transferencias: [],
          shortfall: 0,
          fingerprint: 'availability',
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getAllByText('Lote CB0096')).toHaveLength(1)
    expect(screen.getByText('Depósito · 3693 un disponibles')).toBeInTheDocument()
    expect(screen.getByText('Acondicionado · 882 un disponibles · no se descuentan desde aquí')).toBeInTheDocument()
    expect(screen.queryByText(/Se trasladará a Depósito/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reservar lotes y confirmar' }))
    expect(onConfirm).toHaveBeenCalledWith([
      { itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-cb0096', cantidad: 24 },
    ])
  })
})
