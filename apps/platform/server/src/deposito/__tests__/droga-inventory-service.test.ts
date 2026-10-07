import { describe, expect, it, vi } from 'vitest'
import { aggregateDrugCatalog, addDrugLotInventory } from '../services/droga-inventory-service'

describe('aggregateDrugCatalog', () => {
  it('keeps catalog drugs without lots', () => {
    expect(aggregateDrugCatalog([{ id: 'p1', nombreCompleto: 'ATP', inventarioDrogas: [] }])).toEqual([
      { productoId: 'p1', nombre: 'ATP', stockMinimo: null, cantidadTotal: 0, proximoVencimiento: null, lotes: [] },
    ])
  })

  it('sums lots and ignores zero-stock lots for nearest expiry', () => {
    const late = new Date('2027-01-01T00:00:00Z')
    const earlyZero = new Date('2026-01-01T00:00:00Z')
    const result = aggregateDrugCatalog([{ id: 'p1', nombreCompleto: 'ATP', inventarioDrogas: [
      { id: 'b', lote: 'B', vencimiento: late, cantidad: 7, createdAt: new Date('2026-02-01') },
      { id: 'a', lote: 'A', vencimiento: earlyZero, cantidad: 0, createdAt: new Date('2026-01-01') },
      { id: 'c', lote: 'C', vencimiento: null, cantidad: 3, createdAt: new Date('2026-03-01') },
    ] }])
    expect(result[0]?.cantidadTotal).toBe(10)
    expect(result[0]?.proximoVencimiento).toEqual(late)
    expect(result[0]?.lotes.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('addDrugLotInventory', () => {
  it('increments the same lot when expiry matches', async () => {
    const existing = { id: 'i1', vencimiento: new Date('2027-01-01T00:00:00Z') }
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([existing]), inventarioDroga: { update: vi.fn().mockResolvedValue({ id: 'i1', cantidad: 12 }), create: vi.fn() } }
    await expect(addDrugLotInventory(tx, { productoId: 'p1', nombre: 'ATP', lote: 'L1', vencimiento: existing.vencimiento, cantidad: 5 })).resolves.toMatchObject({ cantidad: 12 })
    expect(tx.inventarioDroga.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { cantidad: { increment: 5 } } })
  })

  it('rejects the same lot with a different expiry', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([{ id: 'i1', vencimiento: new Date('2027-01-01T00:00:00Z') }]), inventarioDroga: { update: vi.fn(), create: vi.fn() } }
    await expect(addDrugLotInventory(tx, { productoId: 'p1', nombre: 'ATP', lote: 'L1', vencimiento: new Date('2028-01-01T00:00:00Z'), cantidad: 5 })).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.inventarioDroga.update).not.toHaveBeenCalled()
  })

  it('creates a different lot without creating a product', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([]), inventarioDroga: { update: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'i2' }) } }
    await addDrugLotInventory(tx, { productoId: 'p1', nombre: 'ATP', lote: 'L2', vencimiento: new Date('2028-01-01T00:00:00Z'), cantidad: 5 })
    expect(tx.inventarioDroga.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productoId: 'p1', lote: 'L2' }) })
  })

  it('normalizes a lot before creating it so equivalent entries share one record', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn().mockResolvedValue([]), inventarioDroga: { update: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'i2' }) } }
    await addDrugLotInventory(tx, { productoId: 'p1', nombre: 'ATP', lote: '  atp   001 ', vencimiento: new Date('2028-01-01T00:00:00Z'), cantidad: 5 })
    expect(tx.inventarioDroga.create).toHaveBeenCalledWith({ data: expect.objectContaining({ lote: 'ATP 001' }) })
  })
})
