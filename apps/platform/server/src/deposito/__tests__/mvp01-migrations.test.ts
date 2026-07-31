import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsRoot = resolve(process.cwd(), '../../../packages/db/prisma/migrations')
const expand = readFileSync(resolve(migrationsRoot, '20260730111000_mvp01_expand_catalogo/migration.sql'), 'utf8')
const migrate = readFileSync(resolve(migrationsRoot, '20260730111100_mvp01_migrate_catalogo/migration.sql'), 'utf8')
const correct = readFileSync(resolve(migrationsRoot, '20260730152750_mvp01_correct_codigo_rules/migration.sql'), 'utf8')

describe('MVP-01 safe migrations', () => {
  it('uses normalized-code preflight and non-destructive market constraints', () => {
    expect(migrate).toContain('upper(btrim("codigo"))')
    expect(expand).toContain('NOT VALID')
    expect(migrate).toContain('inventario_estuches')
    expect(migrate).toContain('inventario_etiquetas')
  })

  it('permits state backfill for legacy packaging without markets while requiring them for active records', () => {
    expect(expand).toContain('"estado" IS DISTINCT FROM \'ACTIVO\'::"deposito"."EstadoProductoCatalogo"')
    expect(expand).toContain('Only ACTIVO packaging records require enabled markets during EXPAND/MIGRATE')
  })

  it('synchronizes both inserts and updates during the dual-write window', () => {
    expect(migrate).toContain('BEFORE INSERT OR UPDATE')
    expect(migrate).toContain('TG_OP = \'INSERT\'')
    expect(migrate).toContain('No se puede activar un producto sin código válido')
  })

  it('uses the existing TEXT identifiers for catalog audit foreign keys', () => {
    expect(expand).toContain('"id" TEXT NOT NULL')
    expect(expand).toContain('"producto_id" TEXT NOT NULL')
    expect(expand).toContain('"usuario_id" TEXT NOT NULL')
    expect(expand).not.toContain('"producto_id" UUID NOT NULL')
    expect(expand).not.toContain('"usuario_id" UUID NOT NULL')
  })

  it('requires the explicit CODE_LOAD deployment gate before deriving catalog states', () => {
    expect(expand).toContain('CODE_LOAD')
    expect(migrate).toContain('CODE_LOAD')
    expect(migrate).toContain('activo=true + código válido → ACTIVO')
    expect(migrate).toContain('activo=false + sin código → INACTIVO')
    expect(migrate).toContain('variante, nombre, IDs derivados, secuencias ni valores ficticios')
  })

  it('fails closed when CODE_LOAD leaves active packaging without required markets', () => {
    expect(migrate).toContain('CODE_LOAD incompleto: etiquetas o estuches activos con código requieren mercados habilitados')
  })

  it('makes the corrected trigger category-aware: only etiqueta/estuche raise without codigo', () => {
    const trigger = correct.slice(correct.indexOf('CREATE OR REPLACE FUNCTION'), correct.lastIndexOf('$$'))
    expect(trigger).toContain("IN ('etiqueta', 'estuche')")
    expect(trigger).toContain('No se puede activar una etiqueta o estuche sin código válido')
    // frasco/droga must never appear in the trigger raise conditions.
    expect(trigger).not.toContain('frasco')
    expect(trigger).not.toContain('droga')
  })

  it('replaces the trigger BEFORE the backfill UPDATE so the global rule cannot abort it', () => {
    const functionIndex = correct.indexOf('CREATE OR REPLACE FUNCTION')
    const backfillIndex = correct.indexOf('UPDATE "deposito"."productos"')
    expect(functionIndex).toBeGreaterThanOrEqual(0)
    expect(backfillIndex).toBeGreaterThan(functionIndex)
  })

  it('uses plain $$ function delimiters without backslash escapes', () => {
    expect(correct).toContain('$$')
    expect(correct).not.toContain('\\$\\$')
  })

  it('backfills only legacy frasco/droga rows to ACTIVO', () => {
    expect(correct).toContain("IN ('frasco', 'droga')")
    expect(correct).toContain("SET \"estado\" = 'ACTIVO'")
    expect(correct).toContain("'PENDIENTE_REVISION'")
  })
})
