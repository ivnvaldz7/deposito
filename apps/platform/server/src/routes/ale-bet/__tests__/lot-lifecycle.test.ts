import { describe, expect, it, vi, beforeEach } from 'vitest'
import { evaluateLotLifecycle } from '../product-stock-admin-service'
import { orderEligibleLots, EligibleLot } from '../inventory-service'

// Mock database to avoid real connection
vi.mock('@platform/db', () => ({
  Prisma: { sql: () => undefined },
  TipoMovimiento: { TRANSFERENCIA_INTERNA: 'TRANSFERENCIA_INTERNA' },
}))

// Helper to create a mock Prisma transaction client
function createMockTx() {
  return {
    saldoStock: {
      findMany: vi.fn(),
    },
    reservaStock: {
      count: vi.fn(),
    },
    lote: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as any // Use any for simplicity in tests
}

describe('Lot Lifecycle Tests', () => {
  describe('evaluateLotLifecycle', () => {
    let mockTx: ReturnType<typeof createMockTx>

    beforeEach(() => {
      mockTx = createMockTx()
    })

    it('A. Lot with Deposito=0, Acondicionado=100 → stays active (stockTotal=100)', async () => {
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 0 }, { cantidad: 100 }])
      mockTx.reservaStock.count.mockResolvedValue(0)
      mockTx.lote.findUnique.mockResolvedValue({ activo: true })

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l1', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l1',
        action: 'UNCHANGED',
        stockTotal: 100,
        activeReservations: 0,
      })
      expect(mockTx.lote.update).not.toHaveBeenCalled()
    })

    it('B. Lot with Deposito=0, Acondicionado=0, no active reservations → archived (activo=false)', async () => {
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 0 }, { cantidad: 0 }])
      mockTx.reservaStock.count.mockResolvedValue(0)
      mockTx.lote.findUnique.mockResolvedValue({ activo: true })

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l2', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l2',
        action: 'ARCHIVED',
        stockTotal: 0,
        activeReservations: 0,
      })
      expect(mockTx.lote.update).toHaveBeenCalledWith({
        where: { id: 'l2' },
        data: { activo: false },
      })
    })

    it('C. Lot with Deposito=0, Acondicionado=0, WITH active reservation → stays active', async () => {
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 0 }, { cantidad: 0 }])
      mockTx.reservaStock.count.mockResolvedValue(1) // Active reservation
      mockTx.lote.findUnique.mockResolvedValue({ activo: true })

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l3', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l3',
        action: 'UNCHANGED',
        stockTotal: 0,
        activeReservations: 1,
      })
      expect(mockTx.lote.update).not.toHaveBeenCalled()
    })

    it('D. Inactive lot with stockTotal=0, then adjustment +100 → reactivated (activo=true)', async () => {
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 100 }])
      mockTx.reservaStock.count.mockResolvedValue(0)
      mockTx.lote.findUnique.mockResolvedValue({ activo: false }) // Initially inactive

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l4', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l4',
        action: 'REACTIVATED',
        stockTotal: 100,
        activeReservations: 0,
      })
      expect(mockTx.lote.update).toHaveBeenCalledWith({
        where: { id: 'l4' },
        data: { activo: true },
      })
    })

    it('E. Transfer total Deposito→Acondicionado: total doesn\'t change → stays active', async () => {
      // Simulate transfer from Deposito (100 -> 0) to Acondicionado (0 -> 100)
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 0 }, { cantidad: 100 }])
      mockTx.reservaStock.count.mockResolvedValue(0)
      mockTx.lote.findUnique.mockResolvedValue({ activo: true })

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l5', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l5',
        action: 'UNCHANGED',
        stockTotal: 100,
        activeReservations: 0,
      })
      expect(mockTx.lote.update).not.toHaveBeenCalled()
    })

    it('F. SALIDA_PEDIDO consumes last units → stockTotal=0 → archived', async () => {
      mockTx.saldoStock.findMany.mockResolvedValue([{ cantidad: 0 }]) // Last units consumed
      mockTx.reservaStock.count.mockResolvedValue(0)
      mockTx.lote.findUnique.mockResolvedValue({ activo: true })

      const result = await evaluateLotLifecycle(mockTx, { loteId: 'l6', productoId: 'p1' })

      expect(result).toEqual({
        loteId: 'l6',
        action: 'ARCHIVED',
        stockTotal: 0,
        activeReservations: 0,
      })
      expect(mockTx.lote.update).toHaveBeenCalledWith({
        where: { id: 'l6' },
        data: { activo: false },
      })
    })
  })

  describe('inventory-service: orderEligibleLots', () => {
    it('G. FEFO/FIFO ignores inactive lots', () => {
      const now = new Date('2026-08-18T12:00:00Z')
      const lots: EligibleLot[] = [
        { id: '1', lote: 'l1', cantidad: 10, activo: true, fechaVencimiento: new Date('2026-10-18T12:00:00Z'), fechaElaboracion: null },
        { id: '2', lote: 'l2', cantidad: 10, activo: false, fechaVencimiento: new Date('2026-11-18T12:00:00Z'), fechaElaboracion: null },
        { id: '3', lote: 'l3', cantidad: 0, activo: true, fechaVencimiento: new Date('2026-12-18T12:00:00Z'), fechaElaboracion: null }, // Empty
        { id: '4', lote: 'l4', cantidad: 10, activo: true, fechaVencimiento: new Date('2025-08-18T12:00:00Z'), fechaElaboracion: null }, // Expired
      ]

      const eligible = orderEligibleLots(lots, now)

      expect(eligible).toHaveLength(1)
      expect(eligible[0].id).toBe('1') // Only lot 1 is active, has stock, and not expired
    })
  })

  describe('getManagedProductStock', () => {
    it('H. Default: returns only active lots', async () => {
      // getManagedProductStock uses a db instance, so we mock it directly
      const mockDb = {
        producto: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'p1',
            nombre: 'Prod 1',
            lotes: [
              { id: '1', numero: 'L1', activo: true, saldos: [] },
              { id: '2', numero: 'L2', activo: true, saldos: [] },
            ]
          }),
        },
        ubicacionStock: {
          findMany: vi.fn().mockResolvedValue([]),
        }
      } as any

      const { getManagedProductStock } = await import('../product-stock-admin-service')
      
      const result = await getManagedProductStock('p1', mockDb)
      
      expect(mockDb.producto.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          select: expect.objectContaining({
            lotes: expect.objectContaining({
              where: { activo: true },
            }),
          }),
        })
      )
      expect(result.lotes).toHaveLength(2)
    })

    it('I. includeArchived=true: returns all lots including archived', async () => {
      const mockDb = {
        producto: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'p1',
            nombre: 'Prod 1',
            lotes: [
              { id: '1', numero: 'L1', activo: true, saldos: [] },
              { id: '2', numero: 'L2', activo: false, saldos: [] },
            ]
          }),
        },
        ubicacionStock: {
          findMany: vi.fn().mockResolvedValue([]),
        }
      } as any

      const { getManagedProductStock } = await import('../product-stock-admin-service')
      
      const result = await getManagedProductStock('p1', mockDb, true)
      
      expect(mockDb.producto.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          select: expect.objectContaining({
            lotes: expect.objectContaining({
              where: undefined,
            }),
          }),
        })
      )
      expect(result.lotes).toHaveLength(2)
    })
  })
})
