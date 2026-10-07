import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const legacyMigrationNames = [
  '20260721160000_init_platform',
  '20260721164308_add_estado_and_is_platform_admin',
  '20260726163214_pr_b3a_idempotency',
  '20260727125700_inventory_constraints_metadata',
  '20260727125701_inventory_constraints_validate',
]
const expandMigration = '20260730111000_mvp01_expand_catalogo'
const migrateMigration = '20260730111100_mvp01_migrate_catalogo'
const correctMigration = '20260730152750_mvp01_correct_codigo_rules'

let adminClient: Client | undefined
let noCodeLoadClient: Client | undefined
let codeLoadClient: Client | undefined
const databaseNames: string[] = []

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function disposableDatabaseName(suffix: string): string {
  return `mvp01_migrate_${process.pid}_${Date.now()}_${suffix}_test`
}

async function applyMigration(client: Client, name: string): Promise<void> {
  const sql = await readFile(resolve(migrationsRoot, name, 'migration.sql'), 'utf8')
  await client.query(sql)
}

async function applyLegacyMigrations(client: Client): Promise<void> {
  for (const name of legacyMigrationNames) await applyMigration(client, name)
}

async function applyCleanRollout(client: Client): Promise<void> {
  await applyLegacyMigrations(client)
  await applyMigration(client, expandMigration)
  await applyMigration(client, migrateMigration)
  await applyMigration(client, correctMigration)
}

async function createMigrationClient(testUrl: string, suffix: string): Promise<Client> {
  if (!adminClient) throw new Error('Cliente administrador no inicializado')
  const databaseName = disposableDatabaseName(suffix)
  databaseNames.push(databaseName)
  await adminClient.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`)

  const migrationUrl = new URL(testUrl)
  migrationUrl.pathname = `/${databaseName}`
  const client = new Client({ connectionString: migrationUrl.toString() })
  await client.connect()
  return client
}

async function createUser(client: Client, id: string, role: 'encargado' | 'observador'): Promise<void> {
  await client.query(`
    INSERT INTO "deposito"."users" ("id", "email", "password_hash", "name", "role")
    VALUES ($1, $2, 'hash', $3, $4::"deposito"."Role")
  `, [id, `${id}@example.test`, id, role])
}

async function applyAuthorizedCodeLoad(
  client: Client,
  actorId: string,
  assignments: ReadonlyArray<{ productoId: string; codigo: string }>,
): Promise<void> {
  const actor = await client.query<{ role: string }>(`
    SELECT "role"::text AS "role" FROM "deposito"."users" WHERE "id" = $1
  `, [actorId])
  if (actor.rows[0]?.role !== 'encargado') throw new Error('CODE_LOAD requiere un encargado autorizado')

  await client.query('BEGIN')
  try {
    for (const assignment of assignments) {
      const normalized = assignment.codigo.trim().toUpperCase()
      await client.query(`
        UPDATE "deposito"."productos"
        SET "codigo" = $2
        WHERE "id" = $1
      `, [assignment.productoId, normalized])
      await client.query(`
        INSERT INTO "deposito"."auditorias_catalogo_producto"
          ("id", "producto_id", "tipo", "valor_anterior", "valor_nuevo", "usuario_id")
        VALUES ($1, $2, 'CODIGO_ACTUALIZADO', '{"codigo":null}'::jsonb, jsonb_build_object('codigo', $3::text), $4)
      `, [`code-load-${assignment.productoId}`, assignment.productoId, normalized, actorId])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

describe('MVP-01 EXPAND -> CODE_LOAD -> MIGRATE physical PostgreSQL rollout', () => {
  beforeAll(async () => {
    const testUrl = process.env.DATABASE_URL
    if (!testUrl) throw new Error('DATABASE_URL de integración no está configurada')

    const adminUrl = new URL(testUrl)
    adminUrl.pathname = '/postgres'
    adminClient = new Client({ connectionString: adminUrl.toString() })
    await adminClient.connect()

    noCodeLoadClient = await createMigrationClient(testUrl, 'without_code_load')
    await applyLegacyMigrations(noCodeLoadClient)
    await createUser(noCodeLoadClient, 'history-owner', 'encargado')
    await noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos" ("id", "nombre_base", "categoria", "nombre_completo", "activo", "updated_at")
      VALUES
        ('active-without-code', 'Activo sin código', 'droga', 'Activo sin código', true, CURRENT_TIMESTAMP),
        ('inactive-without-code', 'Inactivo sin código', 'droga', 'Inactivo sin código', false, CURRENT_TIMESTAMP),
        ('active-label-without-code', 'Etiqueta activa sin código', 'etiqueta', 'Etiqueta activa sin código', true, CURRENT_TIMESTAMP);
      INSERT INTO "deposito"."actas" ("id", "fecha", "created_by", "updated_at")
      VALUES ('history-acta', CURRENT_DATE, 'history-owner', CURRENT_TIMESTAMP);
      INSERT INTO "deposito"."acta_items"
        ("id", "acta_id", "producto_id", "categoria", "producto_nombre", "lote", "cantidad_ingresada")
      VALUES ('history-item', 'history-acta', 'active-without-code', 'droga', 'Activo sin código', 'L-LEGACY', 7);
      INSERT INTO "deposito"."inventario_drogas"
        ("id", "producto_id", "nombre", "lote", "cantidad", "updated_at")
      VALUES ('history-inventory', 'active-without-code', 'Activo sin código', 'L-LEGACY', 7, CURRENT_TIMESTAMP)
    `)
    await applyMigration(noCodeLoadClient, expandMigration)
    await applyMigration(noCodeLoadClient, migrateMigration)
    await applyMigration(noCodeLoadClient, correctMigration)

    codeLoadClient = await createMigrationClient(testUrl, 'with_code_load')
    await applyLegacyMigrations(codeLoadClient)
    await createUser(codeLoadClient, 'code-loader', 'encargado')
    await createUser(codeLoadClient, 'code-observer', 'observador')
    await codeLoadClient.query(`
      INSERT INTO "deposito"."productos" ("id", "nombre_base", "categoria", "nombre_completo", "activo", "updated_at")
      VALUES
        ('active-with-code', 'Activo con código', 'droga', 'Activo con código', true, CURRENT_TIMESTAMP),
        ('active-without-code-b', 'Activo sin código', 'droga', 'Activo sin código', true, CURRENT_TIMESTAMP),
        ('inactive-with-code', 'Inactivo con código', 'droga', 'Inactivo con código', false, CURRENT_TIMESTAMP),
        ('inactive-without-code-b', 'Inactivo sin código', 'droga', 'Inactivo sin código', false, CURRENT_TIMESTAMP)
    `)
    await applyMigration(codeLoadClient, expandMigration)
    await expect(applyAuthorizedCodeLoad(codeLoadClient, 'code-observer', [
      { productoId: 'active-with-code', codigo: 'ET-001' },
    ])).rejects.toThrow('encargado autorizado')
    await applyAuthorizedCodeLoad(codeLoadClient, 'code-loader', [
      { productoId: 'active-with-code', codigo: ' et-001 ' },
      { productoId: 'inactive-with-code', codigo: ' mp-001 ' },
    ])
    await applyMigration(codeLoadClient, migrateMigration)
    await applyMigration(codeLoadClient, correctMigration)

    const repeatClient = await createMigrationClient(testUrl, 'repeat')
    try {
      await applyCleanRollout(repeatClient)
    } finally {
      await repeatClient.end()
      const repeatName = databaseNames.at(-1)
      if (repeatName) await adminClient.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(repeatName)}`)
      databaseNames.pop()
    }
  }, 30000)

  afterAll(async () => {
    await Promise.all([noCodeLoadClient?.end(), codeLoadClient?.end()])
    if (adminClient) {
      for (const databaseName of databaseNames) {
        await adminClient.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`)
      }
    }
    await adminClient?.end()
  })

  it('reaches the FINAL matrix: legacy frasco/droga activate while etiqueta/estuche stay pending without codes', async () => {
    if (!noCodeLoadClient) throw new Error('Cliente de migración no inicializado')
    const products = await noCodeLoadClient.query<{ id: string; codigo: string | null; estado: string; activo: boolean }>(`
      SELECT "id", "codigo", "estado"::text AS "estado", "activo"
      FROM "deposito"."productos"
      ORDER BY "id"
    `)
    expect(products.rows).toEqual([
      // Legacy active etiqueta without code: still PENDIENTE_REVISION (needs CODE_LOAD).
      { id: 'active-label-without-code', codigo: null, estado: 'PENDIENTE_REVISION', activo: false },
      // Legacy active droga without code: the correct migration flips it back to ACTIVO.
      { id: 'active-without-code', codigo: null, estado: 'ACTIVO', activo: true },
      { id: 'inactive-without-code', codigo: null, estado: 'INACTIVO', activo: false },
    ])

    const history = await noCodeLoadClient.query<{ item_id: string; producto_id: string; inventory_count: string }>(`
      SELECT
        (SELECT "id" FROM "deposito"."acta_items" WHERE "id" = 'history-item') AS "item_id",
        (SELECT "producto_id" FROM "deposito"."acta_items" WHERE "id" = 'history-item') AS "producto_id",
        (SELECT count(*) FROM "deposito"."inventario_drogas" WHERE "producto_id" = 'active-without-code') AS "inventory_count"
    `)
    expect(history.rows).toEqual([{ item_id: 'history-item', producto_id: 'active-without-code', inventory_count: '1' }])
  })

  it('uses post-EXPAND authorized CODE_LOAD values for the exact four-case migration matrix', async () => {
    if (!codeLoadClient) throw new Error('Cliente de migración no inicializado')
    const result = await codeLoadClient.query<{ id: string; codigo: string | null; estado: string; activo: boolean }>(`
      SELECT "id", "codigo", "estado"::text AS "estado", "activo"
      FROM "deposito"."productos"
      ORDER BY "id"
    `)

    expect(result.rows).toEqual([
      { id: 'active-with-code', codigo: 'ET-001', estado: 'ACTIVO', activo: true },
      // Legacy active droga without code: the correct migration flips it back to ACTIVO.
      { id: 'active-without-code-b', codigo: null, estado: 'ACTIVO', activo: true },
      { id: 'inactive-with-code', codigo: 'MP-001', estado: 'INACTIVO', activo: false },
      { id: 'inactive-without-code-b', codigo: null, estado: 'INACTIVO', activo: false },
    ])

    const audit = await codeLoadClient.query<{ count: string }>(`
      SELECT count(*) FROM "deposito"."auditorias_catalogo_producto"
      WHERE "usuario_id" = 'code-loader' AND "tipo" = 'CODIGO_ACTUALIZADO'
    `)
    expect(audit.rows).toEqual([{ count: '2' }])
  })

  it('adds Venezuela, catalogue audit relations, and the rollout identity indexes', async () => {
    if (!noCodeLoadClient) throw new Error('Cliente de migración no inicializado')
    const market = await noCodeLoadClient.query<{ mercado: string }>(`
      SELECT 'VENEZUELA'::"deposito"."Mercado"::text AS "mercado"
    `)
    expect(market.rows).toEqual([{ mercado: 'VENEZUELA' }])

    await noCodeLoadClient.query(`
      INSERT INTO "deposito"."auditorias_catalogo_producto"
        ("id", "producto_id", "tipo", "valor_nuevo", "usuario_id")
      VALUES
        ('catalog-audit', 'active-without-code', 'CREADO', '{"codigo": null}'::jsonb, 'history-owner')
    `)
    const auditColumns = await noCodeLoadClient.query<{ column_name: string; data_type: string }>(`
      SELECT "column_name", "data_type"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'deposito'
        AND "table_name" = 'auditorias_catalogo_producto'
        AND "column_name" IN ('id', 'producto_id', 'usuario_id')
      ORDER BY "column_name"
    `)
    expect(auditColumns.rows).toEqual([
      { column_name: 'id', data_type: 'text' },
      { column_name: 'producto_id', data_type: 'text' },
      { column_name: 'usuario_id', data_type: 'text' },
    ])

    const indexes = await noCodeLoadClient.query<{ indexname: string }>(`
      SELECT "indexname"
      FROM "pg_indexes"
      WHERE "schemaname" = 'deposito'
        AND "indexname" IN (
          'productos_codigo_key',
          'inventario_estuches_producto_id_mercado_key',
          'inventario_etiquetas_producto_id_mercado_key',
          'inventario_frascos_producto_id_key',
          'inventario_drogas_producto_id_lote_key'
        )
      ORDER BY "indexname"
    `)
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'inventario_drogas_producto_id_lote_key',
      'inventario_estuches_producto_id_mercado_key',
      'inventario_etiquetas_producto_id_mercado_key',
      'inventario_frascos_producto_id_key',
      'productos_codigo_key',
    ])
  })

  it('enforces active packaging market and global code constraints after clean rollout', async () => {
    if (!noCodeLoadClient) throw new Error('Cliente de migración no inicializado')
    await expect(noCodeLoadClient.query(`
      UPDATE "deposito"."productos"
      SET "estado" = 'ACTIVO', "codigo" = 'ET-POST-MIGRATE'
      WHERE "id" = 'active-label-without-code'
    `)).rejects.toThrow('productos_mercados_habilitados_categoria_check')

    await noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "updated_at")
      VALUES
        ('coded-drug', 'Droga codificada', 'droga', 'Droga codificada', 'MP-001', 'ACTIVO', true, CURRENT_TIMESTAMP)
    `)
    await expect(noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "updated_at")
      VALUES
        ('duplicated-coded-drug', 'Droga duplicada', 'droga', 'Droga duplicada', 'mp-001', 'ACTIVO', true, CURRENT_TIMESTAMP)
    `)).rejects.toThrow('productos_codigo_key')
  })

  it('final trigger: permits frasco/droga ACTIVO without codigo, rejects etiqueta/estuche, and normalizes codes', async () => {
    if (!noCodeLoadClient) throw new Error('Cliente de migración no inicializado')

    // frasco/droga ACTIVO with null codigo are permitted by the category-aware trigger.
    await noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "updated_at")
      VALUES
        ('frasco-sin-codigo', 'Frasco sin código', 'frasco', 'Frasco sin código', NULL, 'ACTIVO', true, CURRENT_TIMESTAMP),
        ('droga-sin-codigo', 'Droga sin código', 'droga', 'Droga sin código', NULL, 'ACTIVO', true, CURRENT_TIMESTAMP)
    `)

    // etiqueta/estuche ACTIVO without codigo are still rejected.
    await expect(noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "mercados_habilitados", "updated_at")
      VALUES
        ('etiqueta-sin-codigo', 'Etiqueta sin código', 'etiqueta', 'Etiqueta sin código', NULL, 'ACTIVO', true, ARRAY['VENEZUELA']::"deposito"."Mercado"[], CURRENT_TIMESTAMP)
    `)).rejects.toThrow('No se puede activar una etiqueta o estuche sin código válido')
    await expect(noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "mercados_habilitados", "updated_at")
      VALUES
        ('estuche-sin-codigo', 'Estuche sin código', 'estuche', 'Estuche sin código', NULL, 'ACTIVO', true, ARRAY['VENEZUELA']::"deposito"."Mercado"[], CURRENT_TIMESTAMP)
    `)).rejects.toThrow('No se puede activar una etiqueta o estuche sin código válido')

    // The trigger normalizes codigo case and whitespace on write.
    await noCodeLoadClient.query(`
      INSERT INTO "deposito"."productos"
        ("id", "nombre_base", "categoria", "nombre_completo", "codigo", "estado", "activo", "mercados_habilitados", "updated_at")
      VALUES
        ('etiqueta-normalizada', 'Etiqueta normalizada', 'etiqueta', 'Etiqueta normalizada', ' iget-001 ', 'ACTIVO', true, ARRAY['VENEZUELA']::"deposito"."Mercado"[], CURRENT_TIMESTAMP)
    `)
    const normalized = await noCodeLoadClient.query<{ codigo: string }>(`
      SELECT "codigo" FROM "deposito"."productos" WHERE "id" = 'etiqueta-normalizada'
    `)
    expect(normalized.rows).toEqual([{ codigo: 'IGET-001' }])
  })
})
