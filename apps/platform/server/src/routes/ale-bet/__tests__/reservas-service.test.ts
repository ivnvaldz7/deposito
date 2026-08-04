import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@platform/db', () => ({
  Prisma: { sql: (strings: TemplateStringsArray) => strings.join('?') },
  TipoMovimiento: { SALIDA_PEDIDO: 'SALIDA_PEDIDO' },
}))

import {
  StockConflictError,
  consumeActiveReservations,
  releaseActiveReservations,
  reserveFefo,
} from '../reservas-service'

function transaction() {
  return {
    $queryRaw: vi.fn(),
    reservaStock: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    lote: { update: vi.fn() },
    movimientoStock: { create: vi.fn() },
  }
}

describe('ALEBET-01 ReservaStock service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allocates an APROBADO reservation FEFO after excluding active reservations', async () => {
    const tx = transaction()
    tx.$queryRaw.mockResolvedValue([
      { id: 'lote-antiguo', cajas: 0, sueltos: 10, unidadesPorCaja: 12, reservado: 2 },
      { id: 'lote-nuevo', cajas: 0, sueltos: 8, unidadesPorCaja: 12, reservado: 0 },
    ])
    tx.reservaStock.create.mockResolvedValue({})

    await reserveFefo(tx as never, 'pedido-1', [{ id: 'item-1', productoId: 'producto-1', cantidad: 16 }])

    expect(tx.reservaStock.create).toHaveBeenNthCalledWith(1, { data: { pedidoId: 'pedido-1', itemPedidoId: 'item-1', loteId: 'lote-antiguo', cantidad: 8 } })
    expect(tx.reservaStock.create).toHaveBeenNthCalledWith(2, { data: { pedidoId: 'pedido-1', itemPedidoId: 'item-1', loteId: 'lote-nuevo', cantidad: 8 } })
  })

  it('fails atomically before creating a reservation when FEFO availability is insufficient', async () => {
    const tx = transaction()
    tx.$queryRaw.mockResolvedValue([{ id: 'lote-1', cajas: 0, sueltos: 5, unidadesPorCaja: 12, reservado: 2 }])

    await expect(reserveFefo(tx as never, 'pedido-1', [{ id: 'item-1', productoId: 'producto-1', cantidad: 4 }]))
      .rejects.toBeInstanceOf(StockConflictError)
    expect(tx.reservaStock.create).not.toHaveBeenCalled()
  })

  it('releases only active reservations, so a retry cannot double-release consumed history', async () => {
    const tx = transaction()
    tx.reservaStock.updateMany.mockResolvedValue({ count: 1 })

    await releaseActiveReservations(tx as never, 'pedido-1')

    expect(tx.reservaStock.updateMany).toHaveBeenCalledWith({
      where: { pedidoId: 'pedido-1', estado: 'ACTIVA' },
      data: { estado: 'LIBERADA', releasedAt: expect.any(Date) },
    })
  })

  it('consumes the exact active reservations, decrements physical lots and writes auditable movements', async () => {
    const tx = transaction()
    tx.reservaStock.findMany.mockResolvedValue([{ id: 'reserva-1', pedidoId: 'pedido-1', loteId: 'lote-1', cantidad: 6, estado: 'ACTIVA' }])
    tx.$queryRaw.mockResolvedValue([{ id: 'lote-1', productoId: 'producto-1', cajas: 2, sueltos: 3, unidadesPorCaja: 4 }])
    tx.lote.update.mockResolvedValue({})
    tx.reservaStock.update.mockResolvedValue({})
    tx.movimientoStock.create.mockResolvedValue({})

    await consumeActiveReservations(tx as never, 'pedido-1', 'armador-1')

    expect(tx.lote.update).toHaveBeenCalledWith({ where: { id: 'lote-1' }, data: { cajas: 1, sueltos: 1, activo: true } })
    expect(tx.reservaStock.update).toHaveBeenCalledWith({ where: { id: 'reserva-1' }, data: { estado: 'CONSUMIDA', consumedAt: expect.any(Date) } })
    expect(tx.movimientoStock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productoId: 'producto-1', cantidad: -6, tipo: 'SALIDA_PEDIDO', pedidoId: 'pedido-1', loteId: 'lote-1', reservaId: 'reserva-1', usuarioId: 'armador-1' }) })
  })

  it('rejects dispatch when no active reservation remains, preventing a double dispatch from consuming stock', async () => {
    const tx = transaction()
    tx.reservaStock.findMany.mockResolvedValue([])

    await expect(consumeActiveReservations(tx as never, 'pedido-1', 'armador-1')).rejects.toBeInstanceOf(StockConflictError)
    expect(tx.lote.update).not.toHaveBeenCalled()
  })
})
