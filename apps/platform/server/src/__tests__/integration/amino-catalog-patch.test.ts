import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { platformDb as prisma } from '@platform/db'
import {
  PRODUCT_TRANSFER_CATALOG_IDENTITIES,
  PRODUCT_TRANSFER_RULE_DEFINITIONS,
  initializeProductTransferRules,
} from '../../scripts/product-transfer-rule-seed-service'
import { truncateDb } from '../utils/db-cleaner'

const LEGACY_AMINO_50_AVES_ID = 'cmtx1uj0b0009v4oj442qiqsj'
const LEGACY_AMINO_50_AVES_SKU = 'LOG-D8C1A70AF2FDD426'
const CATALOG_PATCH_PATH = resolve(
  process.cwd(),
  '../../../packages/db/prisma/migrations/20260925170000_amino_catalog_presentations/migration.sql',
)
const MANIFEST_PATH = resolve(process.cwd(), '../../../docs/operations/PROD-02B-initial-stock-manifest.json')

describe('AMINOÁCIDOS catalog patch and transfer-rule initializer', () => {
  beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })
  beforeEach(async () => { await truncateDb(prisma) })
  afterAll(async () => { await prisma.$disconnect() })

  it('keeps PROD-02B quantities unchanged while renaming only the legacy canonical name', async () => {
    const rawManifest = await readFile(MANIFEST_PATH, 'utf8')
    expect(createHash('sha256').update(rawManifest).digest('hex').toUpperCase()).toBe('20DDFD897E92C853335B0F435C12B9D4296F403B998D3AEECEAD88BBA9E7E94E')
    const manifest = JSON.parse(rawManifest) as {
      corrections: { legacyAmino50Presentation: string }
      summary: { depositTotal: number; conditionedTotal: number; generalTotal: number }
      rows: Array<{ sourceRow: string; productId: string; canonicalProductName: string; sku: string; quantity: number }>
    }
    expect(manifest.corrections.legacyAmino50Presentation).toBe('AVES')
    expect(manifest.summary).toMatchObject({ depositTotal: 17177, conditionedTotal: 15259, generalTotal: 32436 })
    expect(manifest.rows.find((row) => row.sourceRow === 'D10')).toEqual({
      sourceRow: 'D10',
      productId: LEGACY_AMINO_50_AVES_ID,
      canonicalProductName: 'AMINOÁCIDOS 50 ML AVES',
      sku: LEGACY_AMINO_50_AVES_SKU,
      lot: 'AO0297',
      location: 'DEPOSITO',
      quantity: 379,
      unidadesPorCaja: 40,
      matchType: 'EXACT',
      createActiveZeroLot: false,
    })
  })

  it('preserves legacy GALLO identity and all stock relations while normalizing it to AVES', async () => {
    const deposito = await prisma.ubicacionStock.create({ data: { codigo: 'DEPOSITO', nombre: 'Depósito' } })
    const legacy = await prisma.producto.create({
      data: {
        id: LEGACY_AMINO_50_AVES_ID,
        nombre: 'AMINOÁCIDOS 50 ML GALLO',
        sku: LEGACY_AMINO_50_AVES_SKU,
        unidadesPorCaja: 40,
      },
    })
    const lot = await prisma.lote.create({ data: { numero: 'AO0297', productoId: legacy.id } })
    const saldo = await prisma.saldoStock.create({
      data: { productoId: legacy.id, loteId: lot.id, ubicacionId: deposito.id, cantidad: 379 },
    })
    const movimiento = await prisma.movimientoStock.create({
      data: { productoId: legacy.id, loteId: lot.id, cantidad: 379, tipo: 'SALDO_APERTURA', usuarioId: 'fixture' },
    })
    await prisma.producto.createMany({
      data: Array.from({ length: 48 }, (_, index) => ({
        nombre: `FILLER ${index + 1}`,
        sku: `FILLER-SKU-${index + 1}`,
        unidadesPorCaja: 1,
      })),
    })

    await prisma.$executeRawUnsafe(await readFile(CATALOG_PATCH_PATH, 'utf8'))

    await expect(prisma.producto.findUniqueOrThrow({ where: { id: legacy.id } })).resolves.toMatchObject({
      id: LEGACY_AMINO_50_AVES_ID,
      nombre: 'AMINOÁCIDOS 50 ML AVES',
      sku: LEGACY_AMINO_50_AVES_SKU,
    })
    expect(await prisma.lote.findUniqueOrThrow({ where: { id: lot.id } })).toMatchObject({ id: lot.id, productoId: legacy.id })
    expect(await prisma.saldoStock.findUniqueOrThrow({ where: { id: saldo.id } })).toMatchObject({ id: saldo.id, productoId: legacy.id, cantidad: 379 })
    expect(await prisma.movimientoStock.findUniqueOrThrow({ where: { id: movimiento.id } })).toMatchObject({ id: movimiento.id, productoId: legacy.id, loteId: lot.id, cantidad: 379 })
    expect(await prisma.producto.count()).toBe(52)
    await expect(prisma.producto.findMany({ where: { nombre: 'AMINOÁCIDOS 50 ML AVES' } })).resolves.toHaveLength(1)
    await expect(prisma.producto.findMany({ where: { nombre: 'AMINOÁCIDOS 50 ML GALLO' } })).resolves.toHaveLength(0)
    await expect(prisma.producto.findUniqueOrThrow({ where: { id: 'cprodaminobase50ml0000001' } })).resolves.toMatchObject({ nombre: 'AMINOÁCIDOS 50 ML', sku: 'LOG-CD3520C476B6F5C6' })
    await expect(prisma.producto.findUniqueOrThrow({ where: { id: 'cprodaminol1equino0000001' } })).resolves.toMatchObject({ nombre: 'AMINOÁCIDOS 1 L EQUINO', sku: 'LOG-7EA9922C837C111A' })
    await expect(prisma.producto.findUniqueOrThrow({ where: { id: 'cprodaminol1cerdos0000001' } })).resolves.toMatchObject({ nombre: 'AMINOÁCIDOS 1 L CERDOS', sku: 'LOG-8CB0C424D18E1D65' })
  })

  it('initializes all exact rules twice without duplicating rules, products, or stock', async () => {
    await prisma.producto.createMany({
      data: PRODUCT_TRANSFER_CATALOG_IDENTITIES.map((identity) => ({
        ...identity,
        unidadesPorCaja: 1,
      })),
    })

    const first = await prisma.$transaction((tx) => initializeProductTransferRules(tx))
    const second = await prisma.$transaction((tx) => initializeProductTransferRules(tx))

    expect(first).toBe(PRODUCT_TRANSFER_RULE_DEFINITIONS.length)
    expect(second).toBe(PRODUCT_TRANSFER_RULE_DEFINITIONS.length)
    expect(await prisma.productoTransferRule.count()).toBe(14)
    expect(await prisma.producto.count()).toBe(PRODUCT_TRANSFER_CATALOG_IDENTITIES.length)
    expect(await prisma.lote.count()).toBe(0)
    expect(await prisma.saldoStock.count()).toBe(0)
    expect(await prisma.movimientoStock.count()).toBe(0)
    await expect(prisma.productoTransferRule.findMany({
      where: { sourceProductId: 'cprodaminobase50ml0000001' },
      orderBy: { orden: 'asc' },
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Aves', targetProductId: LEGACY_AMINO_50_AVES_ID, tipo: 'PRESENTATION' }),
      expect.objectContaining({ label: 'Mascota', targetProductId: 'cmtx1uj0b000av4ojlitjj9z7', tipo: 'PRESENTATION' }),
    ]))
  })
})
