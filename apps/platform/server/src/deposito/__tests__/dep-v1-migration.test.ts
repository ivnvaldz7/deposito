import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Migración DEP-V1 lean', () => {
  it('es aditiva y no elimina estructuras existentes', () => {
    const migration = readFileSync(
      resolve(process.cwd(), '../../../packages/db/prisma/migrations/20260917120000_dep_v1_partidas_recetas/migration.sql'),
      'utf8',
    )

    expect(migration).not.toMatch(/\bDROP\s+(TABLE|TYPE)\b/i)
    expect(migration).not.toMatch(/\bDROP\b[\s\S]*\bCASCADE\b/i)
    expect(migration).toContain('items_solicitud')
    expect(migration).not.toContain('recetas_produccion')
  })
})
