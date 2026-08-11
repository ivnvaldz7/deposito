import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

  it('creates ACTIVO product/inventory, one positive STOCK_INICIAL, zero without movimiento, replay and no Acta', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const request = { effectiveDate: '2026-08-11', rows: [
      { sourceRow: 1, nombreBase: 'Estuche', nombreCompleto: 'Estuche positivo', presentacion: 10, mercado: 'argentina' as const, cantidad: 3 },
      { sourceRow: 2, nombreBase: 'Estuche', nombreCompleto: 'Estuche cero', presentacion: 20, mercado: 'colombia' as const, cantidad: 0 },
    ] }
    const first = await service.import(request, 'enc-1', 'physical-replay-key')
    const replay = await service.import(request, 'enc-1', 'physical-replay-key')
    expect(first.replay).toBe(false)
    expect(replay).toEqual({ replay: true, result: first.result })
    expect(first.result.items.map((item) => item.codigo)).toEqual(['IGES001', 'IGESCO001'])
    expect(await count('productos')).toBe(2)
    expect(await count('inventario_estuches')).toBe(2)
    expect(await count('movimientos')).toBe(1)
    expect(await count('actas')).toBe(0)
    expect(await count('acta_items')).toBe(0)
    const products = await db.depositoProducto.findMany({ orderBy: { codigo: 'asc' }, select: { estado: true, activo: true } })
    expect(products).toEqual([{ estado: 'ACTIVO', activo: true }, { estado: 'ACTIVO', activo: true }])
  })

  it('applies idempotency-key precedence without duplicating stock across replay and create cases', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const original = { effectiveDate: '2026-08-11', rows: [{ sourceRow: 20, nombreBase: 'Estuche', nombreCompleto: 'Idempotencia original', presentacion: 1, mercado: 'bolivia' as const, cantidad: 4 }] }
    const changed = { ...original, rows: [{ ...original.rows[0], cantidad: 5 }] }
    const newImport = { ...changed, rows: [{ ...changed.rows[0], sourceRow: 21, nombreCompleto: 'Idempotencia nueva' }] }
    const before = { products: await count('productos'), inventory: await count('inventario_estuches'), movements: await count('movimientos'), batches: await count('importaciones_iniciales_estuche') }

    const created = await service.import(original, 'enc-1', 'idempotency-key-a')
    const afterCreate = { products: await count('productos'), inventory: await count('inventario_estuches'), movements: await count('movimientos'), batches: await count('importaciones_iniciales_estuche') }
    expect(created.replay).toBe(false)
    expect(afterCreate).toEqual({ products: before.products + 1, inventory: before.inventory + 1, movements: before.movements + 1, batches: before.batches + 1 })

    await expect(service.import(changed, 'enc-1', 'idempotency-key-a')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(service.import(changed, 'enc-1', 'idempotency-key-a')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(service.import(original, 'enc-1', 'idempotency-key-a')).resolves.toEqual({ replay: true, result: created.result })
    await expect(service.import(original, 'enc-1', 'idempotency-key-b')).resolves.toEqual({ replay: true, result: created.result })
    expect(await count('importaciones_iniciales_estuche_idempotency_keys')).toBe(1)
    await expect(service.import(changed, 'enc-1', 'idempotency-key-b')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(Promise.all([count('productos'), count('inventario_estuches'), count('movimientos'), count('importaciones_iniciales_estuche')])).resolves.toEqual([afterCreate.products, afterCreate.inventory, afterCreate.movements, afterCreate.batches])

    const second = await service.import(newImport, 'enc-1', 'idempotency-key-c')
    expect(second.replay).toBe(false)
    await expect(Promise.all([count('productos'), count('inventario_estuches'), count('movimientos'), count('importaciones_iniciales_estuche')])).resolves.toEqual([afterCreate.products + 1, afterCreate.inventory + 1, afterCreate.movements + 1, afterCreate.batches + 1])
  })

  it('rejects a negative row atomically before creating a batch', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    await expect(service.import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 3, nombreBase: 'Estuche', nombreCompleto: 'Inválido', presentacion: 1, mercado: 'argentina', cantidad: -1 }] }, 'enc-1', 'negative-key')).rejects.toThrow('no puede ser negativa')
    expect(await count('importaciones_iniciales_estuche')).toBe(3)
    expect(await count('productos')).toBe(4)
  })

  it('allocates distinct same-prefix codes under concurrent serializable imports', async () => {
    const secondDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    try {
      const left = new ImportacionInicialEstuchesService(db).import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 4, nombreBase: 'Estuche', nombreCompleto: 'Concurrente A', presentacion: 1, mercado: 'argentina', cantidad: 1 }] }, 'enc-1', 'concurrent-a')
      const right = new ImportacionInicialEstuchesService(secondDb).import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 5, nombreBase: 'Estuche', nombreCompleto: 'Concurrente B', presentacion: 1, mercado: 'argentina', cantidad: 1 }] }, 'enc-1', 'concurrent-b')
      const results = await Promise.all([left, right])
      expect(results.map((result) => result.result.items[0]?.codigo).sort()).toEqual(['IGES002', 'IGES003'])
    } finally { await secondDb.$disconnect() }
  })

  it('activates a pending Estuche as ACTIVO with activo=true in PostgreSQL', async () => {
    const pending = await db.depositoProducto.create({
      data: { nombreBase: 'Estuche', nombreCompleto: 'Estuche activación', categoria: 'estuche', codigo: 'IGES004', estado: 'PENDIENTE_REVISION', activo: false, presentacion: 1, mercadosHabilitados: ['argentina'] },
    })
    const activated = await new CatalogoProductoService(db).activate(pending.id, 'enc-1')
    expect(activated).toMatchObject({ estado: 'ACTIVO', activo: true })
    await expect(db.depositoProducto.findUniqueOrThrow({ where: { id: pending.id }, select: { estado: true, activo: true } })).resolves.toEqual({ estado: 'ACTIVO', activo: true })
  })

  it('retries one P2034 serialization failure and succeeds without a delay', async () => {
    const transaction = vi.spyOn(db, '$transaction')
    transaction.mockRejectedValueOnce(Object.assign(new Error('serialization failure'), { code: 'P2034' }))
    try {
      const result = await new ImportacionInicialEstuchesService(db).import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 6, nombreBase: 'Estuche', nombreCompleto: 'Reintento P2034', presentacion: 1, mercado: 'ecuador', cantidad: 1 }] }, 'enc-1', 'p2034-retry')
      expect(result.replay).toBe(false)
      expect(result.result.items[0]?.codigo).toBe('IGESEC001')
      expect(transaction).toHaveBeenCalledTimes(2)
    } finally { transaction.mockRestore() }
  })

  it('fails closed after exhausted P2034 retries without any mutation', async () => {
    const before = { products: await count('productos'), inventory: await count('inventario_estuches'), movements: await count('movimientos'), batches: await count('importaciones_iniciales_estuche') }
    const transaction = vi.spyOn(db, '$transaction').mockRejectedValue(Object.assign(new Error('serialization failure'), { code: 'P2034' }))
    try {
      await expect(new ImportacionInicialEstuchesService(db).import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 7, nombreBase: 'Estuche', nombreCompleto: 'Agotado P2034', presentacion: 1, mercado: 'bolivia', cantidad: 1 }] }, 'enc-1', 'p2034-exhausted')).rejects.toMatchObject({ code: 'CONFLICT', message: 'No se pudo serializar la importación luego de tres intentos' })
      expect(transaction).toHaveBeenCalledTimes(3)
      await expect(Promise.all([count('productos'), count('inventario_estuches'), count('movimientos'), count('importaciones_iniciales_estuche')])).resolves.toEqual([before.products, before.inventory, before.movements, before.batches])
    } finally { transaction.mockRestore() }
  })

  it('keeps a legacy inventory untouched and creates an independent canonical identity', async () => {
    const service = new ImportacionInicialEstuchesService(db)
    const withoutLegacy = await service.import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 8, nombreBase: 'Estuche', nombreCompleto: 'Sin legacy', presentacion: 1, mercado: 'paraguay', cantidad: 1 }] }, 'enc-1', 'legacy-absent')
    expect(withoutLegacy.result.items[0]?.codigo).toBe('IGESPY001')
    const legacy = await db.inventarioEstuche.create({ data: { articulo: 'Legacy exacto', mercado: 'mexico', cantidad: 9 } })
    const beforeProducts = await count('productos')
    const imported = await service.import({ effectiveDate: '2026-08-11', rows: [{ sourceRow: 9, nombreBase: 'Estuche', nombreCompleto: 'Legacy exacto', presentacion: 1, mercado: 'mexico', cantidad: 1 }] }, 'enc-1', 'legacy-present')
    await expect(db.inventarioEstuche.findUniqueOrThrow({ where: { id: legacy.id } })).resolves.toMatchObject({ articulo: 'Legacy exacto', mercado: 'mexico', cantidad: 9, productoId: null })
    expect(imported.result.items[0]?.codigo).toBe('IGESMX001')
    expect(await count('productos')).toBe(beforeProducts + 1)
  })

  it('rolls back a multi-row batch when the third record hits a critical uniqueness conflict', async () => {
    const before = { products: await count('productos'), inventory: await count('inventario_estuches'), movements: await count('movimientos'), batches: await count('importaciones_iniciales_estuche') }
    await expect(new ImportacionInicialEstuchesService(db).import({ effectiveDate: '2026-08-11', rows: [
      { sourceRow: 10, nombreBase: 'Estuche', nombreCompleto: 'Rollback uno', presentacion: 1, mercado: 'bolivia', cantidad: 1 },
      { sourceRow: 11, nombreBase: 'Estuche', nombreCompleto: 'Rollback dos', presentacion: 1, mercado: 'VENEZUELA', cantidad: 1 },
      { sourceRow: 12, nombreBase: 'Estuche', nombreCompleto: 'Rollback uno', presentacion: 1, mercado: 'colombia', cantidad: 1 },
    ] }, 'enc-1', 'rollback-third')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(Promise.all([count('productos'), count('inventario_estuches'), count('movimientos'), count('importaciones_iniciales_estuche')])).resolves.toEqual([before.products, before.inventory, before.movements, before.batches])
  })
})
