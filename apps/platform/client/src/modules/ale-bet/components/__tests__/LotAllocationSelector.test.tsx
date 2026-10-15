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

  it('permite escribir una cantidad exacta sin superar lo solicitado ni lo disponible', () => {
    const onConfirm = vi.fn()
    render(
      <LotAllocationSelector
        items={[{ id: 'item-1', productoId: 'producto-1', nombre: 'OLIVITASAN PLUS 500 ML', cantidad: 800 }]}
        disponibilidad={{
          status: 'DISPONIBLE', stockTotal: 820, stockDeposito: 820, stockAcondicionado: 0, stockDisponiblePedido: 820,
          allocations: [],
          lotes: [{ itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-pl0618', numero: 'PL0618', fechaVencimiento: '2028-09-30', ubicacion: 'DEPOSITO', disponible: 820, vencido: false }],
          transferencias: [], shortfall: 0, fingerprint: 'availability',
        }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    const input = screen.getByLabelText('Cantidad para lote PL0618')
    fireEvent.change(input, { target: { value: '800' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: 'Reservar lotes y confirmar' }))

    expect(onConfirm).toHaveBeenCalledWith([
      { itemPedidoId: 'item-1', productoId: 'producto-1', loteId: 'lote-pl0618', cantidad: 800 },
    ])
  })
})
