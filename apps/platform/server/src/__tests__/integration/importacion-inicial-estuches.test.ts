import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ImportacionInicialEstuchesService } from '../../deposito/services/importacion-inicial-estuches-service'
import { CatalogoProductoService } from '../../deposito/services/catalogo-producto-service'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const migrationNames = [
  '20260721160000_init_platform',
  '20260721164308_add_estado_and_is_platform_admin',
  '20260726163214_pr_b3a_idempotency',
  '20260727125700_inventory_constraints_metadata',
  '20260727125701_inventory_constraints_validate',
  '20260730111000_mvp01_expand_catalogo',
  '20260730111100_mvp01_migrate_catalogo',
  '20260730152750_mvp01_correct_codigo_rules',
  '20260811101500_deposito_initial_estuches_import',
  '20260812120000_deposito_producto_market_identity',
  '20260812143000_enforce_estuche_canonical_market',
  '20260812160000_add_etiqueta_catalog_sequence',
  '20260813102000_add_export_etiqueta_catalog_sequences',
  '20260813102500_sync_export_etiqueta_catalog_sequences',
  '20260813130000_add_frasco_catalog_sequence',
  '20260813133000_preserve_legacy_frasco_identity',
]

let admin: Client
let databaseUrl = ''
let databaseName = ''
let db: PrismaClient

function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"` }

async function applyMigrations(client: Client): Promise<void> {
  for (const name of migrationNames) {
    await client.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
  }
}

async function count(table: string): Promise<number> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM "deposito".${table}`)
    return Number(result.rows[0]?.count)
  } finally { await client.end() }
}

describe('initial Estuches import physical PostgreSQL contract', () => {
  beforeAll(async () => {
    const testUrl = process.env.PLATFORM_DATABASE_URL
    if (!testUrl) throw new Error('PLATFORM_DATABASE_URL de integración no está configurada')
    databaseName = `estuches_initial_${process.pid}_${Date.now()}_test`
    const adminUrl = new URL(testUrl)
    adminUrl.pathname = '/postgres'
    admin = new Client({ connectionString: adminUrl.toString() })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    const url = new URL(testUrl)
    url.pathname = `/${databaseName}`
    databaseUrl = url.toString()
    const migrationClient = new Client({ connectionString: databaseUrl })
    await migrationClient.connect()
    try {
      await applyMigrations(migrationClient)
      await migrationClient.query(`INSERT INTO "deposito"."users" ("id", "email", "password_hash", "name", "role") VALUES ('enc-1', 'enc@example.test', 'hash', 'Encargado', 'encargado')`)
    } finally { await migrationClient.end() }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  }, 30000)

  afterAll(async () => {
    await db.$disconnect()
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`)
    await admin.end()
  })

  it('creates only active catalog products and zero inventories, then replays by functional identity', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const request = { rows: [
      { sourceRow: 1, nombreBase: 'Estuche', nombreCompleto: 'Estuche Argentina', presentacion: 10, mercado: 'argentina' as const },
      { sourceRow: 2, nombreBase: 'Estuche', nombreCompleto: 'Estuche Colombia', presentacion: 20, mercado: 'colombia' as const },
    ] }
    const first = await service.import(request)
    const replay = await service.import(request)
    expect(first.replay).toBe(false)
    expect(replay).toEqual({ replay: true, result: first.result })
    expect(first.result.items.map((item) => item.codigo)).toEqual(['IGES001', 'IGESCO001'])
    expect(await count('productos')).toBe(2)
    expect(await count('inventario_estuches')).toBe(2)
    expect(await count('movimientos')).toBe(0)
    expect(await count('actas')).toBe(0)
    expect(await count('acta_items')).toBe(0)
    expect(await count('importaciones_iniciales_estuche')).toBe(0)
    expect(await count('importaciones_iniciales_estuche_items')).toBe(0)
    const products = await db.depositoProducto.findMany({ orderBy: { codigo: 'asc' }, select: { estado: true, activo: true, categoria: true } })
    expect(products).toEqual([{ estado: 'ACTIVO', activo: true, categoria: 'estuche' }, { estado: 'ACTIVO', activo: true, categoria: 'estuche' }])
    const inventories = await db.inventarioEstuche.findMany({ orderBy: { articulo: 'asc' }, select: { cantidad: true } })
    expect(inventories).toEqual([{ cantidad: 0 }, { cantidad: 0 }])
  })

  it('allows the same Estuche name in distinct markets and rejects it inside one market', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const colombia = await service.import({ rows: [{ sourceRow: 30, nombreBase: 'Olivitasan', nombreCompleto: 'Olivitasan 500 ML', presentacion: 500, mercado: 'colombia' }] })
    const bolivia = await service.import({ rows: [{ sourceRow: 31, nombreBase: 'Olivitasan', nombreCompleto: 'Olivitasan 500 ML', presentacion: 500, mercado: 'bolivia' }] })

    expect(colombia.result.items[0]?.codigo).toMatch(/^IGESCO\d{3}$/)
    expect(bolivia.result.items[0]?.codigo).toMatch(/^IGESBO\d{3}$/)
    await expect(service.import({ rows: [{ sourceRow: 32, nombreBase: 'Olivitasan', nombreCompleto: 'Olivitasan 500 ML', presentacion: 500, mercado: 'colombia' }] })).resolves.toMatchObject({ replay: true })
  })

  it('allocates unique gap-free canonical codes for concurrent serializable imports', async () => {
    const before = await db.secuenciaCodigoEstuche.findUniqueOrThrow({ where: { mercado: 'ecuador' }, select: { ultimo: true } })
    const secondDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    try {
      const requests = [
        new ImportacionInicialEstuchesService(db).import({ rows: [{ sourceRow: 40, nombreBase: 'Concurrente', nombreCompleto: 'Concurrente Ecuador A', presentacion: 10, mercado: 'ecuador' }] }),
        new ImportacionInicialEstuchesService(secondDb).import({ rows: [{ sourceRow: 41, nombreBase: 'Concurrente', nombreCompleto: 'Concurrente Ecuador B', presentacion: 20, mercado: 'ecuador' }] }),
      ]
      const results = await Promise.all(requests)
      const expected = [before.ultimo + 1, before.ultimo + 2].map((sequence) => `IGESEC${String(sequence).padStart(3, '0')}`)
      expect(results.map((entry) => entry.result.items[0]?.codigo).sort()).toEqual(expected)
      expect(new Set(results.map((entry) => entry.result.items[0]?.codigo)).size).toBe(2)
      await expect(db.secuenciaCodigoEstuche.findUniqueOrThrow({ where: { mercado: 'ecuador' }, select: { ultimo: true } })).resolves.toEqual({ ultimo: before.ultimo + 2 })
    } finally {
      await secondDb.$disconnect()
    }
  })

  it('replays an existing identity unchanged while creating only the missing catalog row', async () => {
    const existingProduct = await db.depositoProducto.create({ data: {
      nombreBase: 'MIXTO EXISTENTE', nombreCompleto: 'MIXTO EXISTENTE 100 ML', categoria: 'estuche', codigo: 'MIXED-EXISTING-001',
      estado: 'ACTIVO', activo: true, origen: 'MIGRACION', presentacion: 100, mercadosHabilitados: ['paraguay'], mercado: 'paraguay',
    } })
    const existingInventory = await db.inventarioEstuche.create({ data: { productoId: existingProduct.id, articulo: existingProduct.nombreCompleto, mercado: 'paraguay', cantidad: 17 } })
    const productBefore = await db.depositoProducto.findUniqueOrThrow({ where: { id: existingProduct.id } })
    const inventoryBefore = await db.inventarioEstuche.findUniqueOrThrow({ where: { id: existingInventory.id } })
    const productsBefore = await count('productos')
    const inventoriesBefore = await count('inventario_estuches')

    const result = await new ImportacionInicialEstuchesService(db).import({ rows: [
      { sourceRow: 50, nombreBase: 'Mixto existente', nombreCompleto: 'Mixto Existente 100 ML', presentacion: 100, mercado: 'paraguay' },
      { sourceRow: 51, nombreBase: 'Mixto nuevo', nombreCompleto: 'Mixto Nuevo 250 ML', presentacion: 250, mercado: 'paraguay' },
    ] })

    expect(result.replay).toBe(false)
    expect(result.result.items[0]).toMatchObject({ productoId: existingProduct.id, inventarioId: existingInventory.id, codigo: 'MIXED-EXISTING-001' })
    await expect(db.depositoProducto.findUniqueOrThrow({ where: { id: existingProduct.id } })).resolves.toEqual(productBefore)
    await expect(db.inventarioEstuche.findUniqueOrThrow({ where: { id: existingInventory.id } })).resolves.toEqual(inventoryBefore)
    expect(await count('productos')).toBe(productsBefore + 1)
    expect(await count('inventario_estuches')).toBe(inventoriesBefore + 1)
    const createdInventory = await db.inventarioEstuche.findUniqueOrThrow({ where: { id: result.result.items[1]!.inventarioId } })
    expect(createdInventory.cantidad).toBe(0)
  })

  it('keeps historical product, inventory, movement, batch and item rows unchanged', async () => {
    const product = await db.depositoProducto.create({ data: {
      nombreBase: 'Histórico', nombreCompleto: 'Histórico 500 ML', categoria: 'estuche', codigo: 'HISTORICAL-001',
      estado: 'ACTIVO', activo: true, origen: 'IMPORTACION_INICIAL_ESTUCHES', presentacion: 500, mercadosHabilitados: ['mexico'], mercado: 'mexico',
    } })
    const inventory = await db.inventarioEstuche.create({ data: { productoId: product.id, articulo: product.nombreCompleto, mercado: 'mexico', cantidad: 23 } })
    const batch = await db.importacionInicialEstucheBatch.create({ data: {
      idempotencyKey: 'historical-key', checksum: 'historical-checksum', actorId: 'enc-1', effectiveDate: new Date('2026-08-11T00:00:00.000Z'), result: { historical: true },
    } })
    const item = await db.importacionInicialEstucheItem.create({ data: {
      batchId: batch.id, productoId: product.id, inventarioEstucheId: inventory.id, mercado: 'mexico', codigo: product.codigo!, sourceRow: 60, cantidad: 23,
    } })
    const movement = await db.movimiento.create({ data: {
      tipo: 'stock_inicial', categoria: 'estuche', productoNombre: product.nombreCompleto, cantidad: 23, createdBy: 'enc-1', productoId: product.id,
      fechaEfectiva: new Date('2026-08-11T00:00:00.000Z'), importacionInicialEstucheItemId: item.id,
    } })
    const before = {
      product: await db.depositoProducto.findUniqueOrThrow({ where: { id: product.id } }),
      inventory: await db.inventarioEstuche.findUniqueOrThrow({ where: { id: inventory.id } }),
      movement: await db.movimiento.findUniqueOrThrow({ where: { id: movement.id } }),
      batch: await db.importacionInicialEstucheBatch.findUniqueOrThrow({ where: { id: batch.id } }),
      item: await db.importacionInicialEstucheItem.findUniqueOrThrow({ where: { id: item.id } }),
    }
    const countsBefore = await Promise.all(['productos', 'inventario_estuches', 'movimientos', 'importaciones_iniciales_estuche', 'importaciones_iniciales_estuche_items'].map(count))

    const service = new ImportacionInicialEstuchesService(db)
    const request = { rows: [{ sourceRow: 61, nombreBase: 'Catálogo aislado', nombreCompleto: 'Catálogo Aislado 50 ML', presentacion: 50, mercado: 'mexico' as const }] }
    await service.import(request)
    await service.import(request)

    await expect(db.depositoProducto.findUniqueOrThrow({ where: { id: product.id } })).resolves.toEqual(before.product)
    await expect(db.inventarioEstuche.findUniqueOrThrow({ where: { id: inventory.id } })).resolves.toEqual(before.inventory)
    await expect(db.movimiento.findUniqueOrThrow({ where: { id: movement.id } })).resolves.toEqual(before.movement)
    await expect(db.importacionInicialEstucheBatch.findUniqueOrThrow({ where: { id: batch.id } })).resolves.toEqual(before.batch)
    await expect(db.importacionInicialEstucheItem.findUniqueOrThrow({ where: { id: item.id } })).resolves.toEqual(before.item)
    const countsAfter = await Promise.all(['productos', 'inventario_estuches', 'movimientos', 'importaciones_iniciales_estuche', 'importaciones_iniciales_estuche_items'].map(count))
    expect(countsAfter).toEqual([countsBefore[0] + 1, countsBefore[1] + 1, countsBefore[2], countsBefore[3], countsBefore[4]])
  })

  it('keeps codigo globally unique across markets', async () => {
    await db.depositoProducto.create({ data: {
      nombreBase: 'Código global A', nombreCompleto: 'Código global A 1 ML', categoria: 'estuche', codigo: 'GLOBAL-001',
      estado: 'ACTIVO', activo: true, presentacion: 1, mercadosHabilitados: ['ecuador'], mercado: 'ecuador',
    } })
    await expect(db.depositoProducto.create({ data: {
      nombreBase: 'Código global B', nombreCompleto: 'Código global B 1 ML', categoria: 'estuche', codigo: 'GLOBAL-001',
      estado: 'ACTIVO', activo: true, presentacion: 1, mercadosHabilitados: ['paraguay'], mercado: 'paraguay',
    } })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('persists canonical market through standard manual and pending-import Estuche paths', async () => {
    const service = new CatalogoProductoService(db)
    const manual = await service.createManual({ nombreBase: 'Manual mercado', nombreCompleto: 'Manual mercado 10 ML', categoria: 'estuche', codigo: 'IGES900', presentacion: 10, mercadosHabilitados: ['colombia'] }, 'enc-1')
    const pending = await service.createImportPending({ nombreBase: 'Import mercado', nombreCompleto: 'Import mercado 20 ML', categoria: 'estuche', codigo: 'IGES901', presentacion: 20, mercadosHabilitados: ['bolivia'] }, 'enc-1')
    expect(manual.mercado).toBe('colombia')
    expect(pending?.mercado).toBe('bolivia')
  })

  it('creates and replays Argentina Etiquetas with zero label inventory and independent identity', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    await service.import({ rows: [{ sourceRow: 70, nombreBase: 'Compartido', nombreCompleto: 'Compartido 100 ML', presentacion: 100, mercado: 'argentina', categoria: 'estuche' }] })
    const request = { rows: [
      { sourceRow: 71, nombreBase: 'Compartido', nombreCompleto: 'Compartido 100 ML', presentacion: 100, mercado: 'argentina' as const, categoria: 'etiqueta' as const },
      { sourceRow: 72, nombreBase: 'Etiqueta', nombreCompleto: 'Etiqueta 250 ML', presentacion: 250, mercado: 'argentina' as const, categoria: 'etiqueta' as const },
    ] }
    const first = await service.import(request)
    const replay = await service.import(request)
    expect(first.result.items.map((item) => item.codigo)).toEqual(['IGET001', 'IGET002'])
    expect(replay).toEqual({ replay: true, result: first.result })
    const products = await db.depositoProducto.findMany({ where: { id: { in: first.result.items.map((item) => item.productoId) } }, select: { categoria: true, mercado: true, estado: true, activo: true } })
    expect(products).toEqual(expect.arrayContaining([
      { categoria: 'etiqueta', mercado: 'argentina', estado: 'ACTIVO', activo: true },
      { categoria: 'etiqueta', mercado: 'argentina', estado: 'ACTIVO', activo: true },
    ]))
    const inventories = await db.inventarioEtiqueta.findMany({ where: { id: { in: first.result.items.map((item) => item.inventarioId) } }, select: { cantidad: true } })
    expect(inventories).toEqual([{ cantidad: 0 }, { cantidad: 0 }])
  })

  it('allocates concurrent Etiqueta codes without gaps', async () => {
    const secondDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    const before = await db.secuenciaCodigoEtiqueta.findUniqueOrThrow({ where: { mercado: 'argentina' }, select: { ultimo: true } })
    try {
      const results = await Promise.all([
        new ImportacionInicialEstuchesService(db).import({ rows: [{ sourceRow: 80, nombreBase: 'Concurrente', nombreCompleto: 'Etiqueta Concurrente A 10 ML', presentacion: 10, mercado: 'argentina', categoria: 'etiqueta' }] }),
        new ImportacionInicialEstuchesService(secondDb).import({ rows: [{ sourceRow: 81, nombreBase: 'Concurrente', nombreCompleto: 'Etiqueta Concurrente B 20 ML', presentacion: 20, mercado: 'argentina', categoria: 'etiqueta' }] }),
      ])
      const expected = [before.ultimo + 1, before.ultimo + 2].map((value) => `IGET${String(value).padStart(3, '0')}`)
      expect(results.map((entry) => entry.result.items[0]!.codigo).sort()).toEqual(expected)
      await expect(db.secuenciaCodigoEtiqueta.findUniqueOrThrow({ where: { mercado: 'argentina' }, select: { ultimo: true } })).resolves.toEqual({ ultimo: before.ultimo + 2 })
    } finally { await secondDb.$disconnect() }
  })

  it('imports export Etiquetas with canonical codes and zero inventory without operational side effects', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const operationalBefore = await Promise.all(['movimientos', 'actas', 'acta_items', 'importaciones_iniciales_estuche', 'importaciones_iniciales_estuche_items'].map(count))
    const request = { rows: [
      { sourceRow: 90, nombreBase: 'Etiqueta Colombia', nombreCompleto: 'Etiqueta Colombia 20 ML', presentacion: 20, mercado: 'colombia' as const, categoria: 'etiqueta' as const },
      { sourceRow: 91, nombreBase: 'Etiqueta Bolivia', nombreCompleto: 'Etiqueta Bolivia 20 ML', presentacion: 20, mercado: 'bolivia' as const, categoria: 'etiqueta' as const },
      { sourceRow: 92, nombreBase: 'Etiqueta Paraguay', nombreCompleto: 'Etiqueta Paraguay 20 ML', presentacion: 20, mercado: 'paraguay' as const, categoria: 'etiqueta' as const },
      { sourceRow: 93, nombreBase: 'Etiqueta Mexico', nombreCompleto: 'Etiqueta Mexico 20 ML', presentacion: 20, mercado: 'mexico' as const, categoria: 'etiqueta' as const },
      { sourceRow: 94, nombreBase: 'Etiqueta Ecuador', nombreCompleto: 'Etiqueta Ecuador 20 ML', presentacion: 20, mercado: 'ecuador' as const, categoria: 'etiqueta' as const },
    ] }

    const first = await service.import(request)
    const replay = await service.import(request)

    expect(first.result.items.map(({ mercado, codigo }) => ({ mercado, codigo }))).toEqual([
      { mercado: 'bolivia', codigo: 'IGETBO001' },
      { mercado: 'colombia', codigo: 'IGETCO001' },
      { mercado: 'ecuador', codigo: 'IGETEC001' },
      { mercado: 'mexico', codigo: 'IGETMX001' },
      { mercado: 'paraguay', codigo: 'IGETPY001' },
    ])
    expect(replay).toEqual({ replay: true, result: first.result })
    const products = await db.depositoProducto.findMany({ where: { id: { in: first.result.items.map((item) => item.productoId) } }, select: { categoria: true, mercado: true, estado: true, activo: true } })
    expect(products).toHaveLength(5)
    expect(products.every((product) => product.categoria === 'etiqueta' && product.estado === 'ACTIVO' && product.activo)).toBe(true)
    const inventories = await db.inventarioEtiqueta.findMany({ where: { id: { in: first.result.items.map((item) => item.inventarioId) } }, select: { cantidad: true } })
    expect(inventories).toEqual(Array.from({ length: 5 }, () => ({ cantidad: 0 })))
    expect(await Promise.all(['movimientos', 'actas', 'acta_items', 'importaciones_iniciales_estuche', 'importaciones_iniciales_estuche_items'].map(count))).toEqual(operationalBefore)
  })

  it('enforces the Estuche canonical-market check at the database boundary', async () => {
    await expect(db.depositoProducto.create({ data: { nombreBase: 'Sin mercado', nombreCompleto: 'Sin mercado 1 ML', categoria: 'estuche', codigo: 'IGES902', estado: 'ACTIVO', activo: true, presentacion: 1, mercadosHabilitados: ['argentina'] } })).rejects.toBeTruthy()
    await expect(db.depositoProducto.create({ data: { nombreBase: 'Mercado ambiguo', nombreCompleto: 'Mercado ambiguo 1 ML', categoria: 'estuche', codigo: 'IGES903', estado: 'ACTIVO', activo: true, presentacion: 1, mercadosHabilitados: ['argentina', 'colombia'], mercado: 'argentina' } })).rejects.toBeTruthy()
  })

  it('creates and replays canonical Argentina Frascos from ENV063 with zero inventory and no operational effects', async () => {
    const request = { rows: [
      ['AGROPECUARIO 25 ML', 110], ['AGROPECUARIO 100 ML', 42], ['AGROPECUARIO 500 ML', 20], ['AMBAR 100 ML', 72],
      ['BIDÓN 500 ML', 115], ['BIDÓN BLANCO 1 L', 60], ['BIDÓN BLANCO 5 L', 20], ['BLANCO 500 ML', 80],
      ['DORADO 50 ML', 484], ['DORADO 250 ML', 240], ['DORADO 500 ML', 80], ['GOTERO 60 ML', 450],
      ['IVERSAN 50 ML', 484], ['TRANSPARENTE 500 ML', 80], ['JERINGA 35 GR', 700], ['MARRÓN 300 ML', 130],
      ['MARRÓN 500 ML', 80], ['PVC 100 ML', 384], ['PVC 200 ML', 234], ['PVC 500 ML', 80], ['VETERINARIO 250 ML', 30],
    ].map(([nombre, unidadesPorCaja], index) => ({
      sourceRow: index + 1, nombreBase: String(nombre), nombreCompleto: String(nombre), mercado: 'argentina' as const,
      categoria: 'frasco' as const, unidadesPorCaja: Number(unidadesPorCaja),
    })) }
    const operationalBefore = await Promise.all(['movimientos', 'actas', 'acta_items', 'inventario_estuches', 'inventario_etiquetas'].map(count))
    const first = await new ImportacionInicialEstuchesService(db).import(request)
    const replay = await new ImportacionInicialEstuchesService(db).import(request)

    expect(first.replay).toBe(false)
    expect(first.result.items.map((item) => item.codigo)).toEqual(Array.from({ length: 21 }, (_, index) => `ENV${String(index + 63).padStart(3, '0')}`))
    expect(replay).toEqual({ replay: true, result: first.result })
    const products = await db.depositoProducto.findMany({ where: { id: { in: first.result.items.map((item) => item.productoId) } }, select: { categoria: true, mercado: true, estado: true, activo: true } })
    expect(products).toHaveLength(21)
    expect(products.every((product) => product.categoria === 'frasco' && product.mercado === 'argentina' && product.estado === 'ACTIVO' && product.activo)).toBe(true)
    const inventories = await db.inventarioFrasco.findMany({ where: { productoId: { in: first.result.items.map((item) => item.productoId) } }, orderBy: { articulo: 'asc' }, select: { cantidadCajas: true, total: true, unidadesPorCaja: true } })
    expect(inventories).toHaveLength(21)
    expect(inventories.every((inventory) => inventory.cantidadCajas === 0 && inventory.total === 0)).toBe(true)
    expect(inventories.map((inventory) => inventory.unidadesPorCaja).sort((a, b) => a - b)).toEqual([20, 20, 30, 42, 60, 72, 80, 80, 80, 80, 80, 110, 115, 130, 234, 240, 384, 450, 484, 484, 700])
    expect(await Promise.all(['movimientos', 'actas', 'acta_items', 'inventario_estuches', 'inventario_etiquetas'].map(count))).toEqual(operationalBefore)
  })

  it('preserves legacy null-market identity while allowing canonical Frasco coexistence', async () => {
    const legacy = await db.depositoProducto.create({ data: {
      nombreBase: 'Legacy identity', nombreCompleto: 'LEGACY IDENTITY', categoria: 'frasco', estado: 'ACTIVO', activo: true,
    } })
    await expect(db.depositoProducto.create({ data: {
      nombreBase: 'Legacy duplicate', nombreCompleto: 'LEGACY IDENTITY', categoria: 'frasco', estado: 'ACTIVO', activo: true,
    } })).rejects.toMatchObject({ code: 'P2002' })
    const canonical = await db.depositoProducto.create({ data: {
      nombreBase: 'Legacy identity', nombreCompleto: 'LEGACY IDENTITY', categoria: 'frasco', mercado: 'argentina', estado: 'ACTIVO', activo: true,
    } })
    await db.inventarioFrasco.create({ data: { articulo: 'LEGACY INVENTORY', unidadesPorCaja: 10, cantidadCajas: 0, total: 0 } })
    await expect(db.inventarioFrasco.create({ data: { articulo: 'LEGACY INVENTORY', unidadesPorCaja: 20, cantidadCajas: 0, total: 0 } })).rejects.toMatchObject({ code: 'P2002' })
    await expect(db.inventarioFrasco.create({ data: { productoId: canonical.id, articulo: 'LEGACY INVENTORY', unidadesPorCaja: 30, cantidadCajas: 0, total: 0 } })).resolves.toMatchObject({ productoId: canonical.id })
    expect(legacy.mercado).toBeNull()
  })
})
