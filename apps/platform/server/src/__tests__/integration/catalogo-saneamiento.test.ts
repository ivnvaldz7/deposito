import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@platform/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CatalogoSaneamientoService, type CleanupManifestEntry } from '../../deposito/services/catalogo-saneamiento-service'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const migrationNames = [
  '20260721160000_init_platform', '20260721164308_add_estado_and_is_platform_admin',
  '20260726163214_pr_b3a_idempotency', '20260727125700_inventory_constraints_metadata',
  '20260727125701_inventory_constraints_validate', '20260730111000_mvp01_expand_catalogo',
  '20260730111100_mvp01_migrate_catalogo', '20260730152750_mvp01_correct_codigo_rules',
  '20260811101500_deposito_initial_estuches_import', '20260812120000_deposito_producto_market_identity',
  '20260812143000_enforce_estuche_canonical_market', '20260812160000_add_etiqueta_catalog_sequence',
  '20260813102000_add_export_etiqueta_catalog_sequences', '20260813102500_sync_export_etiqueta_catalog_sequences',
  '20260813130000_add_frasco_catalog_sequence', '20260813133000_preserve_legacy_frasco_identity',
]
const protectedCodes = Array.from({ length: 21 }, (_, index) => `ENV${String(index + 63).padStart(3, '0')}`)
const legacyId = 'cleanup-legacy'
const manualId = 'cleanup-manual'
const manifest: CleanupManifestEntry[] = [
  { id: legacyId, codigo: 'ENV001', estado: 'PENDIENTE_REVISION', origen: 'IMPORTACION', categoria: 'frasco', kind: 'legacy-equivalent', canonicalCode: 'ENV063' },
  { id: manualId, codigo: 'IGETTEST', estado: 'ACTIVO', origen: 'MANUAL', categoria: 'etiqueta', kind: 'manual-duplicate', allowedZeroInventory: 'etiqueta' },
]

let admin: Client
let databaseUrl = ''
let databaseName = ''
let db: PrismaClient
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`

async function applyMigrations(client: Client) {
  for (const name of migrationNames) await client.query(await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'))
}

describe('catalog cleanup physical PostgreSQL contract', () => {
  beforeAll(async () => {
    const testUrl = process.env.PLATFORM_DATABASE_URL
    if (!testUrl) throw new Error('PLATFORM_DATABASE_URL de integración no está configurada')
    databaseName = `catalog_cleanup_${process.pid}_${Date.now()}_test`
    const adminUrl = new URL(testUrl); adminUrl.pathname = '/postgres'
    admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect()
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    const url = new URL(testUrl); url.pathname = `/${databaseName}`; databaseUrl = url.toString()
    const migrationClient = new Client({ connectionString: databaseUrl }); await migrationClient.connect()
    try {
      await applyMigrations(migrationClient)
      await migrationClient.query(`INSERT INTO deposito.users (id,email,password_hash,name,role) VALUES ('cleanup-user','cleanup@example.test','hash','Cleanup','encargado')`)
    } finally { await migrationClient.end() }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

    for (const codigo of protectedCodes) {
      await db.depositoProducto.create({ data: {
        id: `canonical-${codigo}`, codigo, nombreBase: codigo === 'ENV063' ? 'AGROPECUARIO' : codigo,
        nombreCompleto: codigo === 'ENV063' ? 'AGROPECUARIO 25 ML' : `CANONICAL ${codigo}`,
        categoria: 'frasco', presentacion: codigo === 'ENV063' ? 25 : 1, mercado: 'argentina', mercadosHabilitados: [],
        estado: 'ACTIVO', activo: true, origen: 'IMPORTACION_INICIAL_ESTUCHES',
      } })
    }
    await db.depositoProducto.create({ data: { id: legacyId, codigo: 'ENV001', nombreBase: 'AGROPECUARIO', nombreCompleto: 'FRASCO AGROPECUARIO 25 ML', categoria: 'frasco', estado: 'PENDIENTE_REVISION', activo: false, origen: 'IMPORTACION' } })
    await db.depositoProducto.create({ data: { id: manualId, codigo: 'IGETTEST', nombreBase: 'TEST', nombreCompleto: 'TEST LABEL', categoria: 'etiqueta', presentacion: 10, mercado: 'argentina', mercadosHabilitados: ['argentina'], estado: 'ACTIVO', activo: true, origen: 'MANUAL' } })
    await db.inventarioEtiqueta.create({ data: { id: 'cleanup-inventory', productoId: manualId, articulo: 'TEST LABEL', mercado: 'argentina', cantidad: 0 } })
    await db.auditoriaCatalogoProducto.createMany({ data: [
      { id: 'cleanup-audit-1', productoId: legacyId, tipo: 'IMPORTACION_CREADA', usuarioId: 'cleanup-user' },
      { id: 'cleanup-audit-2', productoId: manualId, tipo: 'ACTIVADO', usuarioId: 'cleanup-user' },
    ] })
  }, 30000)

  afterAll(async () => {
    await db.$disconnect(); await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`); await admin.end()
  })

  it('rolls back a forced delete failure, then deletes only the allowlist and replays without writes', async () => {
    const triggerClient = new Client({ connectionString: databaseUrl }); await triggerClient.connect()
    try {
      await triggerClient.query(`CREATE FUNCTION deposito.fail_cleanup_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${manualId}' THEN RAISE EXCEPTION 'forced cleanup rollback'; END IF; RETURN OLD; END $$`)
      await triggerClient.query(`CREATE TRIGGER fail_cleanup_delete BEFORE DELETE ON deposito.productos FOR EACH ROW EXECUTE FUNCTION deposito.fail_cleanup_delete()`)
    } finally { await triggerClient.end() }

    const service = new CatalogoSaneamientoService(db, { manifest, protectedCodes })
    await expect(service.run()).rejects.toThrow('forced cleanup rollback')
    expect(await db.depositoProducto.count({ where: { id: { in: [legacyId, manualId] } } })).toBe(2)
    expect(await db.inventarioEtiqueta.count({ where: { productoId: manualId } })).toBe(1)
    expect(await db.auditoriaCatalogoProducto.count({ where: { productoId: { in: [legacyId, manualId] } } })).toBe(2)

    await db.$executeRawUnsafe('DROP TRIGGER fail_cleanup_delete ON deposito.productos; DROP FUNCTION deposito.fail_cleanup_delete()')
    const first = await service.run()
    expect(first).toMatchObject({ deleted: expect.arrayContaining([
      expect.objectContaining({ id: legacyId, auditoriasEliminadas: 1 }),
      expect.objectContaining({ id: manualId, auditoriasEliminadas: 1 }),
    ]), auditoriasEliminadas: 2, replay: false })
    expect(await db.depositoProducto.count({ where: { id: { in: [legacyId, manualId] } } })).toBe(0)
    expect(await db.inventarioEtiqueta.count({ where: { id: 'cleanup-inventory' } })).toBe(0)
    expect(await db.auditoriaCatalogoProducto.count({ where: { id: { in: ['cleanup-audit-1', 'cleanup-audit-2'] } } })).toBe(0)
    expect((await db.depositoProducto.findMany({ where: { codigo: { in: protectedCodes } }, select: { codigo: true }, orderBy: { codigo: 'asc' } })).map((item) => item.codigo)).toEqual(protectedCodes)

    const replay = await service.run()
    expect(replay).toMatchObject({ deleted: [], final: first.final, replay: true })
    const orphanRows = await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM deposito.inventario_etiquetas i LEFT JOIN deposito.productos p ON p.id=i.producto_id WHERE i.producto_id IS NOT NULL AND p.id IS NULL`
    expect(orphanRows[0]?.count).toBe(0)
  }, 15000)
})
