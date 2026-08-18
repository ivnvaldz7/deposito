import { describe, expect, it, vi } from 'vitest'

vi.mock('@platform/db', () => ({
  Prisma: { sql: () => undefined },
  TipoMovimiento: { SALIDA_PEDIDO: 'SALIDA_PEDIDO' },
}))

import { consumeActiveReservations, reserveFefo } from '../reservas-service'

describe('consumeActiveReservations', () => {
  it('records the exact reservation location on the SALIDA_PEDIDO movement', async () => {
    const movimientoCreate = vi.fn().mockResolvedValue({ id: 'movement-1' })
    const tx = {
      reservaStock: {
        findMany: vi.fn().mockResolvedValue([{ id: 'reservation-1', loteId: 'lot-1', ubicacionId: 'deposito-id', cantidad: 3 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'lot-1', productoId: 'product-1', cajas: 1, sueltos: 5, unidadesPorCaja: 12, cantidad: 17, saldoId: 'balance-1' }]),
      saldoStock: { update: vi.fn().mockResolvedValue({}) },
      lote: { update: vi.fn().mockResolvedValue({}) },
      movimientoStock: { create: movimientoCreate },
    }

    await consumeActiveReservations(tx as never, 'order-1', 'actor-1')

    expect(movimientoCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'SALIDA_PEDIDO',
        loteId: 'lot-1',
        reservaId: 'reservation-1',
        origenUbicacionId: 'deposito-id',
      }),
    }))
  })
})

describe('reserveFefo', () => {
  it('creates reservations through all required Prisma relations', async () => {
    const reservaCreate = vi.fn().mockResolvedValue({ id: 'reservation-1' })
    const tx = {
      ubicacionStock: { findUnique: vi.fn().mockResolvedValue({ id: 'deposito-id' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'lot-1', cantidad: 5, reservado: 0 }]),
      reservaStock: { create: reservaCreate },
    }

    await reserveFefo(tx as never, 'order-1', [{ id: 'item-1', productoId: 'product-1', cantidad: 5 }])

    expect(reservaCreate).toHaveBeenCalledWith({
      data: {
        pedido: { connect: { id: 'order-1' } },
        itemPedido: { connect: { id: 'item-1' } },
        lote: { connect: { id: 'lot-1' } },
        ubicacion: { connect: { id: 'deposito-id' } },
        cantidad: 5,
      },
    })
  })
})
