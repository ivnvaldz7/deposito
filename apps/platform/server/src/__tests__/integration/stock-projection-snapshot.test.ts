import { platformDb as prisma } from '@platform/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildCurrentStockProjectionSnapshot } from '../../routes/ale-bet/stock-projection/snapshot-repository'
import { truncateDb } from '../utils/db-cleaner'

describe('stock projection snapshot repository', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })
  afterAll(async () => { await prisma.$disconnect() })

  it('reads absolute SaldoStock quantities and applies zero policy per physical location', async () => {
    const deposito = await prisma.ubicacionStock.create({
      data: { id: 'sdd01-deposito', codigo: 'DEPOSITO', nombre: 'Depósito' },
    })
    const acondicionado = await prisma.ubicacionStock.create({
      data: { id: 'sdd01-acondicionado', codigo: 'ACONDICIONADO', nombre: 'Acondicionado' },
    })
    const producto = await prisma.producto.create({
      data: { id: 'sdd01-producto', nombre: 'Producto X 500 ML', sku: 'SDD01-X-500', unidadesPorCaja: 1000 },
    })
    const loteA = await prisma.lote.create({
      data: {
        id: 'sdd01-lote-a',
        productoId: producto.id,
        numero: 'A',
        cajas: 999,
        sueltos: 999,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
    const loteB = await prisma.lote.create({
      data: {
        id: 'sdd01-lote-b',
        productoId: producto.id,
        numero: 'B',
        cajas: 888,
        sueltos: 888,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    })
    await prisma.saldoStock.createMany({
      data: [
        { productoId: producto.id, loteId: loteA.id, ubicacionId: deposito.id, cantidad: 0 },
        { productoId: producto.id, loteId: loteB.id, ubicacionId: deposito.id, cantidad: 200 },
        { productoId: producto.id, loteId: loteA.id, ubicacionId: acondicionado.id, cantidad: 100 },
        { productoId: producto.id, loteId: loteB.id, ubicacionId: acondicionado.id, cantidad: 0 },
      ],
    })

    expect(await buildCurrentStockProjectionSnapshot(prisma)).toEqual({
      productoTerminado: [{ producto: 'Producto X 500 ML', lote: 'B', total: 200 }],
      sinAcondicionar: [{ producto: 'Producto X 500 ML', lote: 'A', total: 100 }],
    })

    await prisma.saldoStock.updateMany({ data: { cantidad: 0 } })

    expect(await buildCurrentStockProjectionSnapshot(prisma)).toEqual({
      productoTerminado: [{ producto: 'Producto X 500 ML', lote: 'B', total: 0 }],
      sinAcondicionar: [{ producto: 'Producto X 500 ML', lote: 'B', total: 0 }],
    })
  })
})
