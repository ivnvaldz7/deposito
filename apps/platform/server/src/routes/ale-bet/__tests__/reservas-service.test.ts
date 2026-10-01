import { describe, expect, it, vi } from 'vitest'

vi.mock('@platform/db', () => ({
  Prisma: { sql: () => undefined },
  TipoMovimiento: { SALIDA_PEDIDO: 'SALIDA_PEDIDO', DEVOLUCION_PEDIDO: 'DEVOLUCION_PEDIDO' },
}))

import { consumeActiveReservations, reserveFefo, returnConsumedReservations, StockConflictError } from '../reservas-service'

describe('consumeActiveReservations', () => {
  it('records the exact reservation location on the SALIDA_PEDIDO movement', async () => {
    const movimientoCreate = vi.fn().mockResolvedValue({ id: 'movement-1' })
    const tx = {
      reservaStock: {
        findMany: vi.fn().mockResolvedValue([{ id: 'reservation-1', loteId: 'lot-1', ubicacionId: 'deposito-id', cantidad: 3 }]),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'lot-1', productoId: 'product-1', cajas: 1, sueltos: 5, unidadesPorCaja: 12, cantidad: 17, saldoId: 'balance-1' }]),
      saldoStock: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      lote: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue({ activo: true }) },
      movimientoStock: { create: movimientoCreate },
      stockProjectionOutbox: { upsert: vi.fn().mockResolvedValue({}) },
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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'lot-1', activo: true, fechaVencimiento: null, fechaProduccion: null, createdAt: new Date('2026-01-01'), cantidad: 5, reservado: 0 }]),
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

describe('returnConsumedReservations', () => {
  it('returns units to the original consumed lot and records a traceable return movement', async () => {
    const movimientoCreate = vi.fn().mockResolvedValue({ id: 'return-1' })
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'lot-1', productoId: 'product-1', cajas: 1, sueltos: 2, unidadesPorCaja: 12, cantidad: 14, saldoId: 'balance-1' }]),
      reservaStock: {
        findMany: vi.fn().mockResolvedValue([{ id: 'reservation-1', loteId: 'lot-1', ubicacionId: 'deposito-id', cantidad: 8, consumedAt: new Date('2026-10-01'), lote: { productoId: 'product-1' } }]),
        count: vi.fn().mockResolvedValue(0),
      },
      movimientoStock: { findMany: vi.fn().mockResolvedValue([]), create: movimientoCreate },
      saldoStock: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([{ cantidad: 17 }]) },
      lote: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue({ activo: true }) },
      stockProjectionOutbox: { upsert: vi.fn().mockResolvedValue({}) },
    }

    await returnConsumedReservations(tx as never, 'order-1', 'actor-1', [{ productoId: 'product-1', cantidad: 3 }], 'Devolución del cliente')

    expect(tx.saldoStock.update).toHaveBeenCalledWith({ where: { id: 'balance-1' }, data: { cantidad: { increment: 3 } } })
    expect(movimientoCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'DEVOLUCION_PEDIDO',
        pedidoId: 'order-1',
        loteId: 'lot-1',
        reservaId: 'reservation-1',
        destinoUbicacionId: 'deposito-id',
      }),
    }))
  })

  it('rejects a return greater than the unreturned dispatched quantity before changing stock', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      reservaStock: {
        findMany: vi.fn().mockResolvedValue([{ id: 'reservation-1', loteId: 'lot-1', ubicacionId: 'deposito-id', cantidad: 3, consumedAt: new Date('2026-10-01'), lote: { productoId: 'product-1' } }]),
      },
      movimientoStock: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      saldoStock: { update: vi.fn() },
      lote: { update: vi.fn() },
      stockProjectionOutbox: { upsert: vi.fn() },
    }

    await expect(returnConsumedReservations(tx as never, 'order-1', 'actor-1', [{ productoId: 'product-1', cantidad: 4 }], 'Devolución del cliente')).rejects.toBeInstanceOf(StockConflictError)
    expect(tx.saldoStock.update).not.toHaveBeenCalled()
  })
})
