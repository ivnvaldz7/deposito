import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@platform/db'

vi.mock('@platform/db', () => ({
  Categoria: {},
  EstadoProductoCatalogo: {},
  Mercado: {},
  OrigenProductoCatalogo: { IMPORTACION: 'IMPORTACION' },
  TipoAuditoriaCatalogo: {},
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
}))

import {
  CatalogoProductoService,
  normalizeCodigo,
  validateCatalogoUpdate,
  validateCodigoPrefix,
  deriveMigratedEstado,
  validateCatalogoInput,
  validateTransition,
} from '../services/catalogo-producto-service'

describe('catalogo product rules', () => {
  it('maps legacy active products: etiqueta/estuche require codigo; frasco/droga do not', () => {
    // etiqueta/estuche: activo + no codigo → PENDIENTE_REVISION
    expect(deriveMigratedEstado(true, null, 'etiqueta')).toBe('PENDIENTE_REVISION')
    expect(deriveMigratedEstado(true, '   ', 'estuche')).toBe('PENDIENTE_REVISION')
    // etiqueta/estuche: activo + codigo → ACTIVO
    expect(deriveMigratedEstado(true, 'ET-001', 'etiqueta')).toBe('ACTIVO')
    expect(deriveMigratedEstado(true, 'IGES001', 'estuche')).toBe('ACTIVO')
    // frasco/droga: activo + no codigo → ACTIVO (no requiere codigo)
    expect(deriveMigratedEstado(true, null, 'frasco')).toBe('ACTIVO')
    expect(deriveMigratedEstado(true, null, 'droga')).toBe('ACTIVO')
    // frasco/droga: activo + codigo → ACTIVO
    expect(deriveMigratedEstado(true, 'FR-001', 'frasco')).toBe('ACTIVO')
    expect(deriveMigratedEstado(true, 'MP-001', 'droga')).toBe('ACTIVO')
  })

  it('keeps legacy inactive products inactive even without a code', () => {
    expect(deriveMigratedEstado(false, null, 'etiqueta')).toBe('INACTIVO')
    expect(deriveMigratedEstado(false, 'MP-001', 'droga')).toBe('INACTIVO')
  })

  it('requires enabled markets only for labels and boxes', () => {
    expect(() => validateCatalogoInput({ categoria: 'etiqueta', codigo: 'ET-1', mercadosHabilitados: [] })).toThrow('mercado')
    expect(() => validateCatalogoInput({ categoria: 'frasco', codigo: 'FR-1', mercadosHabilitados: ['argentina'] })).toThrow('mercado')
  })

  it('rejects activation and reactivation without a code only for etiqueta/estuche', () => {
    // etiqueta/estuche: codigo required
    expect(() => validateTransition('PENDIENTE_REVISION', 'ACTIVO', null, 'etiqueta')).toThrow('código')
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'estuche')).toThrow('código')
    expect(() => validateTransition('PENDIENTE_REVISION', 'ACTIVO', 'IGET001', 'etiqueta')).not.toThrow()
    // frasco/droga: codigo allowed null
    expect(() => validateTransition('PENDIENTE_REVISION', 'ACTIVO', null, 'frasco')).not.toThrow()
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'droga')).not.toThrow()
    expect(() => validateTransition('PENDIENTE_REVISION', 'ACTIVO', 'FR-001', 'frasco')).not.toThrow()
  })

  it('requires the IGET prefix for etiqueta and IGES for estuche, leaving frasco/droga free', () => {
    expect(() => validateCodigoPrefix('etiqueta', 'ET-001')).toThrow('IGET')
    expect(() => validateCodigoPrefix('etiqueta', ' iget-001 ')).not.toThrow()
    expect(() => validateCodigoPrefix('estuche', 'ES-001')).toThrow('IGES')
    expect(() => validateCodigoPrefix('estuche', 'IGES-001')).not.toThrow()
    // frasco/droga are unaffected: any code or none is fine.
    expect(() => validateCodigoPrefix('frasco', 'FR-001')).not.toThrow()
    expect(() => validateCodigoPrefix('frasco', null)).not.toThrow()
    expect(() => validateCodigoPrefix('droga', 'MP-001')).not.toThrow()
    expect(() => validateCodigoPrefix('droga', null)).not.toThrow()
  })

  it('rejects createManual with a wrong prefix before persisting', async () => {
    const db = {
      $transaction: async () => { throw new Error('el servicio no debe persistir con un prefijo inválido') },
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.createManual({
      nombreBase: 'ETIQUETA MALA',
      nombreCompleto: 'ETIQUETA MALA',
      categoria: 'etiqueta',
      codigo: 'FOO123',
      presentacion: 10,
      mercadosHabilitados: ['argentina'],
    }, 'enc-1')).rejects.toThrow('IGET')

    await expect(service.createManual({
      nombreBase: 'ESTUCHE MALO',
      nombreCompleto: 'ESTUCHE MALO',
      categoria: 'estuche',
      codigo: 'FOO123',
      presentacion: 20,
      mercadosHabilitados: ['argentina'],
    }, 'enc-1')).rejects.toThrow('IGES')
  })

  it('accepts lowercase codes in createManual and normalizes them', async () => {
    const created: Array<{ codigo: string | null }> = []
    const tx = {
      depositoProducto: {
        create: async ({ data }: { data: { codigo: string | null } }) => {
          created.push({ codigo: data.codigo })
          return { id: 'nuevo-1', ...data, estado: 'ACTIVO', activo: true, origen: 'MANUAL', mercadosHabilitados: data.mercadosHabilitados ?? [] }
        },
      },
      inventarioEtiqueta: { createMany: async () => ({ count: 1 }) },
      inventarioEstuche: { createMany: async () => ({ count: 0 }) },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new CatalogoProductoService(db as PrismaClient)

    await service.createManual({
      nombreBase: 'ETIQUETA NUEVA',
      nombreCompleto: 'ETIQUETA NUEVA',
      categoria: 'etiqueta',
      codigo: 'iget-001',
      presentacion: 10,
      mercadosHabilitados: ['argentina'],
    }, 'enc-1')

    expect(created).toEqual([{ codigo: 'IGET-001' }])
  })

  it('rejects a PATCH that omits or clears the code of a pending etiqueta/estuche', async () => {
    const producto = {
      id: 'pendiente-1',
      estado: 'PENDIENTE_REVISION',
      activo: false,
      origen: 'IMPORTACION',
      categoria: 'etiqueta' as const,
      codigo: null as string | null,
      presentacion: 10,
      mercadosHabilitados: ['argentina'] as string[],
      nombreBase: 'ETIQUETA PENDIENTE',
      nombreCompleto: 'ETIQUETA PENDIENTE',
      volumen: null,
      unidad: null,
      variante: null,
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async () => { throw new Error('no debe actualizar sin código válido') },
      },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new CatalogoProductoService(db as PrismaClient)

    // Omit: the resulting codigo stays null -> validation error.
    await expect(service.update('pendiente-1', { nombreCompleto: 'ETIQUETA RENOMBRADA' }, 'enc-1'))
      .rejects.toThrow('código es obligatorio')
    // Explicit clear via empty string.
    await expect(service.update('pendiente-1', { codigo: '' }, 'enc-1')).rejects.toThrow('código es obligatorio')
    // Explicit clear via null.
    await expect(service.update('pendiente-1', { codigo: null }, 'enc-1')).rejects.toThrow('código es obligatorio')
  })

  it('keeps the existing valid code when a PATCH omits codigo on a coded etiqueta', async () => {
    const updates: Array<Record<string, unknown>> = []
    const producto = {
      id: 'activo-1',
      estado: 'ACTIVO',
      activo: true,
      origen: 'MANUAL',
      categoria: 'etiqueta' as const,
      codigo: 'IGET-001' as string | null,
      presentacion: 10,
      mercadosHabilitados: ['argentina'] as string[],
      nombreBase: 'ETIQUETA ACTIVA',
      nombreCompleto: 'ETIQUETA ACTIVA',
      volumen: null,
      unidad: null,
      variante: null,
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data)
          return { ...producto, ...data }
        },
      },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.update('activo-1', { nombreCompleto: 'ETIQUETA ACTIVA 2' }, 'enc-1'))
      .resolves.toMatchObject({ codigo: 'IGET-001' })
    expect(updates[0]).not.toHaveProperty('codigo')
  })

  it('enforces the IGET/IGES prefix on the one-time INACTIVO code assignment', async () => {
    const producto = {
      id: 'historica-1',
      estado: 'INACTIVO',
      activo: false,
      origen: 'MIGRACION',
      categoria: 'etiqueta' as const,
      codigo: null as string | null,
      presentacion: 10,
      mercadosHabilitados: ['argentina'] as string[],
      nombreBase: 'ETIQUETA HISTORICA',
      nombreCompleto: 'ETIQUETA HISTORICA',
      volumen: null,
      unidad: null,
      variante: null,
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(producto, data)
          return { ...producto }
        },
      },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.update('historica-1', { codigo: 'ET-LEGACY' }, 'enc-1')).rejects.toThrow('IGET')
    await expect(service.update('historica-1', { codigo: 'IGET-LEGACY' }, 'enc-1')).resolves.toMatchObject({ codigo: 'IGET-LEGACY' })
  })

  it('rejects activating a pending etiqueta whose code lacks the IGET prefix', async () => {
    const producto = {
      id: 'pendiente-2',
      estado: 'PENDIENTE_REVISION',
      activo: false,
      origen: 'IMPORTACION',
      categoria: 'etiqueta' as const,
      codigo: 'ET-1' as string | null,
      presentacion: 10,
      mercadosHabilitados: ['argentina'] as string[],
      nombreBase: 'ETIQUETA IMPORTADA',
      nombreCompleto: 'ETIQUETA IMPORTADA',
      volumen: null,
      unidad: null,
      variante: null,
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async () => ({ ...producto, estado: 'ACTIVO', activo: true }),
      },
      inventarioEtiqueta: { createMany: async () => ({ count: 1 }) },
      inventarioEstuche: { createMany: async () => ({ count: 0 }) },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.activate('pendiente-2', 'enc-1')).rejects.toThrow('IGET')
  })

  it('rejects an import batch whose etiqueta/estuche rows lack the required prefix', async () => {
    const db = {
      $transaction: async () => { throw new Error('no debe persistir con prefijos inválidos') },
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.createImportPendingBatch([
      { nombreBase: 'ETIQUETA A', nombreCompleto: 'ETIQUETA A', categoria: 'etiqueta', codigo: 'ET-1', presentacion: 10, mercadosHabilitados: ['argentina'] },
    ], 'enc-1')).rejects.toThrow('IGET')

    await expect(service.createImportPendingBatch([
      { nombreBase: 'ESTUCHE B', nombreCompleto: 'ESTUCHE B', categoria: 'estuche', codigo: 'ES-1', presentacion: 20, mercadosHabilitados: ['argentina'] },
    ], 'enc-1')).rejects.toThrow('IGES')
  })

  it('requires presentation for packaging categories but not for materia prima', () => {
    expect(() => validateCatalogoInput({ categoria: 'etiqueta', codigo: 'ET-1', presentacion: null, mercadosHabilitados: ['argentina'] })).toThrow('presentación')
    expect(() => validateCatalogoInput({ categoria: 'estuche', codigo: 'ES-1', presentacion: null, mercadosHabilitados: ['argentina'] })).toThrow('presentación')
    expect(() => validateCatalogoInput({ categoria: 'frasco', codigo: 'FR-1', presentacion: null, mercadosHabilitados: [] })).toThrow('presentación')
    expect(() => validateCatalogoInput({ categoria: 'droga', codigo: 'MP-1', presentacion: null, mercadosHabilitados: [] })).not.toThrow()
  })

  it('allows only activation from pending and reactivation from inactive', () => {
    expect(() => validateTransition('PENDIENTE_REVISION', 'INACTIVO', 'IGET-1', 'etiqueta')).toThrow('transición')
    expect(() => validateTransition('ACTIVO', 'ACTIVO', 'IGET-1', 'etiqueta')).toThrow('transición')
    expect(() => validateTransition('INACTIVO', 'PENDIENTE_REVISION', 'IGET-1', 'etiqueta')).toThrow('transición')
  })

  it('keeps inactive catalogue identity locked while allowing name and presentation', () => {
    const actual = { categoria: 'etiqueta' as const, codigo: 'ET-1', mercadosHabilitados: ['argentina'] as const }
    expect(() => validateCatalogoUpdate('INACTIVO', actual, { codigo: 'ET-2' })).toThrow('bloqueados')
    expect(() => validateCatalogoUpdate('INACTIVO', actual, { categoria: 'estuche' })).toThrow('bloqueados')
    expect(() => validateCatalogoUpdate('INACTIVO', actual, { mercadosHabilitados: ['VENEZUELA'] })).toThrow('bloqueados')
    expect(() => validateCatalogoUpdate('INACTIVO', actual, { nombreCompleto: 'ETIQUETA NUEVA', presentacion: 20 })).not.toThrow()
  })

  it('allows one explicit code assignment to an inactive historical product, but not code replacement or identity mutation', () => {
    const historical = { categoria: 'droga' as const, codigo: null, mercadosHabilitados: [] as const }
    expect(() => validateCatalogoUpdate('INACTIVO', historical, { codigo: 'MP-LOAD-1' })).not.toThrow()
    expect(() => validateCatalogoUpdate('INACTIVO', { ...historical, codigo: 'MP-LOAD-1' }, { codigo: 'MP-LOAD-2' })).toThrow('bloqueados')
    expect(() => validateCatalogoUpdate('INACTIVO', historical, { categoria: 'frasco' })).toThrow('bloqueados')
    expect(() => validateCatalogoUpdate('INACTIVO', historical, { mercadosHabilitados: ['argentina'] })).toThrow('bloqueados')
  })

  it('permits FRASCO activo without a code', () => {
    expect(() => validateTransition(null, 'ACTIVO', null, 'frasco')).not.toThrow()
  })

  it('permits DROGA activo without a code', () => {
    expect(() => validateTransition(null, 'ACTIVO', null, 'droga')).not.toThrow()
  })

  it('rejects ETIQUETA without a code', () => {
    expect(() => validateTransition(null, 'ACTIVO', null, 'etiqueta')).toThrow('código')
  })

  it('rejects ESTUCHE without a code', () => {
    expect(() => validateTransition(null, 'ACTIVO', null, 'estuche')).toThrow('código')
  })

  it('normalizes empty codigo to null', () => {
    expect(normalizeCodigo(undefined)).toBeNull()
    expect(normalizeCodigo(null)).toBeNull()
    expect(normalizeCodigo('')).toBeNull()
    expect(normalizeCodigo('  ')).toBeNull()
    expect(normalizeCodigo(' amt-001 ')).toBe('AMT-001')
  })

  it('import batch permits multiple frascos without code', async () => {
    const committed: string[] = []
    const db = {
      $transaction: async (callback: (tx: {
        depositoProducto: {
          findMany: () => Promise<Array<{ codigo: string }>>
          create: (args: { data: { codigo: string | null } }) => Promise<{ id: string; codigo: string | null; estado: string }>
        }
        auditoriaCatalogoProducto: { create: () => Promise<{ id: string }> }
      }) => Promise<unknown>) => {
        const result = await callback({
          depositoProducto: {
            findMany: async () => [],
            create: async ({ data }) => {
              committed.push(data.codigo ?? '__NULL__')
              return { id: `prod-${committed.length}`, codigo: data.codigo, estado: 'PENDIENTE_REVISION' }
            },
          },
          auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
        })
        return result
      },
      depositoProducto: { findMany: async () => [] },
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await service.createImportPendingBatch([
      { nombreBase: 'FRASCO A', nombreCompleto: 'FRASCO A', categoria: 'frasco', codigo: null, presentacion: 100, mercadosHabilitados: [] },
      { nombreBase: 'FRASCO B', nombreCompleto: 'FRASCO B', categoria: 'frasco', codigo: null, presentacion: 200, mercadosHabilitados: [] },
    ], 'enc-1')

    expect(committed).toEqual(['__NULL__', '__NULL__'])
  })

  it('import batch never creates inventory or movements', async () => {
    // The pending-import contract: depositoProducto PENDIENTE_REVISION +
    // IMPORTACION_CREADA audit only. Inventory seeding happens exclusively on
    // createManual/activate/reactivate; movements never belong to imports.
    const writes: string[] = []
    const tx = {
      depositoProducto: {
        findMany: async () => [] as Array<{ codigo: string }>,
        create: async ({ data }: { data: { codigo: string | null } }) => {
          writes.push(`depositoProducto:${data.codigo ?? 'null'}`)
          return { id: `imp-${writes.length}`, codigo: data.codigo, estado: 'PENDIENTE_REVISION' }
        },
      },
      auditoriaCatalogoProducto: {
        create: async () => { writes.push('auditoriaCatalogoProducto'); return { id: 'audit-1' } },
      },
      inventarioDroga: { createMany: async () => { writes.push('inventarioDroga'); return { count: 1 } } },
      inventarioEtiqueta: { createMany: async () => { writes.push('inventarioEtiqueta'); return { count: 1 } } },
      inventarioEstuche: { createMany: async () => { writes.push('inventarioEstuche'); return { count: 1 } } },
      inventarioFrasco: { createMany: async () => { writes.push('inventarioFrasco'); return { count: 1 } } },
      movimiento: { create: async () => { writes.push('movimiento'); return { id: 'mov-1' } } },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await service.createImportPendingBatch([
      { nombreBase: 'FRASCO A', nombreCompleto: 'FRASCO A', categoria: 'frasco', codigo: 'ENV001', presentacion: 1, mercadosHabilitados: [] },
      { nombreBase: 'FRASCO B', nombreCompleto: 'FRASCO B', categoria: 'frasco', codigo: 'ENV002', presentacion: 1, mercadosHabilitados: [] },
    ], 'enc-1')

    expect(writes).toEqual([
      'depositoProducto:ENV001',
      'auditoriaCatalogoProducto',
      'depositoProducto:ENV002',
      'auditoriaCatalogoProducto',
    ])
  })

  it('permits reactivation of FRASCO without a code', () => {
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'frasco')).not.toThrow()
  })

  it('permits reactivation of DROGA without a code', () => {
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'droga')).not.toThrow()
  })

  it('rejects reactivation of ETIQUETA/ESTUCHE without a code', () => {
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'etiqueta')).toThrow('código')
    expect(() => validateTransition('INACTIVO', 'ACTIVO', null, 'estuche')).toThrow('código')
  })

  it('audits inactive code loading and then permits reactivation with that code', async () => {
    const audits: string[] = []
    const producto = {
      id: 'inactive-without-code',
      estado: 'INACTIVO',
      activo: false,
      origen: 'MIGRACION',
      categoria: 'droga',
      codigo: null as string | null,
      presentacion: null,
      mercadosHabilitados: [] as string[],
      nombreBase: 'DROGA HISTORICA',
      nombreCompleto: 'DROGA HISTORICA',
      volumen: null,
      unidad: null,
      variante: null,
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(producto, data)
          return { ...producto }
        },
      },
      inventarioEtiqueta: { createMany: async () => ({ count: 0 }) },
      inventarioEstuche: { createMany: async () => ({ count: 0 }) },
      auditoriaCatalogoProducto: {
        create: async ({ data }: { data: { tipo: string } }) => {
          audits.push(data.tipo)
          return { id: `audit-${audits.length}` }
        },
      },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.update(producto.id, { codigo: ' mp-load-1 ' }, 'enc-1')).resolves.toMatchObject({ codigo: 'MP-LOAD-1' })
    await expect(service.reactivate(producto.id, 'enc-1')).resolves.toMatchObject({ estado: 'ACTIVO', activo: true, codigo: 'MP-LOAD-1' })
    expect(audits).toEqual(['CODIGO_ACTUALIZADO', 'REACTIVADO'])
  })

  it('rejects pending deactivation and reactivation', async () => {
    const db = {
      $transaction: async (callback: (tx: { depositoProducto: { findUnique: () => Promise<{ id: string; estado: string; codigo: string }> } }) => Promise<unknown>) => callback({
        depositoProducto: { findUnique: async () => ({ id: 'pendiente-1', estado: 'PENDIENTE_REVISION', codigo: 'ET-1' }) },
      }),
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.deactivate('pendiente-1', 'enc-1')).rejects.toThrow('transición')
    await expect(service.reactivate('pendiente-1', 'enc-1')).rejects.toThrow('inactivo')
  })

  it('audits imported approval once and keeps repeated activation idempotent', async () => {
    const audits: string[] = []
    const producto = {
      id: 'importado-1',
      estado: 'PENDIENTE_REVISION',
      activo: false,
      origen: 'IMPORTACION',
      categoria: 'etiqueta',
      codigo: 'IGET-1',
      presentacion: 10,
      mercadosHabilitados: ['argentina'],
      nombreCompleto: 'ETIQUETA 1',
    }
    const tx = {
      depositoProducto: {
        findUnique: async () => producto,
        update: async () => ({ ...producto, estado: 'ACTIVO', activo: true }),
      },
      inventarioEtiqueta: { createMany: async () => ({ count: 1 }) },
      inventarioEstuche: { createMany: async () => ({ count: 0 }) },
      auditoriaCatalogoProducto: {
        create: async ({ data }: { data: { tipo: string } }) => {
          audits.push(data.tipo)
          return { id: `audit-${audits.length}` }
        },
      },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await service.activate(producto.id, 'enc-1')
    producto.estado = 'ACTIVO'
    await service.activate(producto.id, 'enc-1')

    expect(audits).toEqual(['ACTIVADO', 'IMPORTACION_APROBADA'])
  })

  it('allows deleting a pending import when its only history is catalog audit', async () => {
    const deleted: string[] = []
    const tx = {
      depositoProducto: {
        findUnique: async () => ({ id: 'pending-import', estado: 'PENDIENTE_REVISION' }),
        delete: async ({ where }: { where: { id: string } }) => {
          deleted.push(where.id)
          return { id: where.id }
        },
      },
      inventarioDroga: { count: async () => 0 },
      inventarioEstuche: { count: async () => 0 },
      inventarioEtiqueta: { count: async () => 0 },
      inventarioFrasco: { count: async () => 0 },
      actaItem: { count: async () => 0 },
      ordenProduccion: { count: async () => 0 },
      auditoriaCatalogoProducto: {
        count: async () => 1,
        deleteMany: async () => ({ count: 1 }),
      },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.deletePending('pending-import')).resolves.toBeUndefined()
    expect(deleted).toEqual(['pending-import'])
  })

  it('does not roll back an import batch when a later row cannot be created due to an unknown error', async () => {
    const committed: string[] = []
    const staged: string[] = []
    const db = {
      depositoProducto: { findMany: async () => [] },
      $transaction: async (callback: (tx: {
        depositoProducto: {
          findMany: () => Promise<Array<{ codigo: string }>>
          create: (args: { data: { codigo: string | null } }) => Promise<{ id: string; codigo: string | null; estado: string }>
        }
        auditoriaCatalogoProducto: { create: () => Promise<{ id: string }> }
      }) => Promise<unknown>) => {
        try {
          const result = await callback({
            depositoProducto: {
              findMany: async () => [],
              create: async ({ data }) => {
                if (data.codigo === 'IGET-DUPLICADO') throw new Error('unique constraint')
                staged.push(data.codigo ?? '')
                return { id: `producto-${staged.length}`, codigo: data.codigo, estado: 'PENDIENTE_REVISION' }
              },
            },
            auditoriaCatalogoProducto: {
              create: async () => ({ id: 'audit-1' }),
            },
          })
          committed.push(...staged)
          return result
        } finally {
          staged.splice(0, staged.length)
        }
      },
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await expect(service.createImportPendingBatch([
      { nombreBase: 'ETIQUETA A', nombreCompleto: 'ETIQUETA A', categoria: 'etiqueta', codigo: 'IGET-1', presentacion: 10, mercadosHabilitados: ['argentina'] },
      { nombreBase: 'ETIQUETA B', nombreCompleto: 'ETIQUETA B', categoria: 'etiqueta', codigo: 'IGET-DUPLICADO', presentacion: 10, mercadosHabilitados: ['argentina'] },
    ], 'enc-1')).rejects.toThrow('unique constraint')

    expect(committed).toEqual(['IGET-1'])
  })

  it('skips rows whose code came to exist between preview and confirm (race) and imports the rest', async () => {
    const committed: Array<{ codigo: string | null; estado: string; activo: boolean; origen: string }> = []
    const tx = {
      depositoProducto: {
        // ENV001 now exists in the DB (created after the dry-run preview).
        findMany: async () => [{ codigo: 'ENV001' }],
        create: async ({ data }: { data: { codigo: string | null } }) => {
          const created = { codigo: data.codigo, estado: 'PENDIENTE_REVISION', activo: false, origen: 'IMPORTACION' }
          committed.push(created)
          return { id: `prod-${committed.length}`, ...created }
        },
      },
      auditoriaCatalogoProducto: { create: async () => ({ id: 'audit-1' }) },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    const result = await service.createImportPendingBatch([
      { nombreBase: 'FRASCO A', nombreCompleto: 'FRASCO A', categoria: 'frasco', codigo: 'ENV001', presentacion: 1, mercadosHabilitados: [] },
      { nombreBase: 'FRASCO B', nombreCompleto: 'FRASCO B', categoria: 'frasco', codigo: 'ENV002', presentacion: 1, mercadosHabilitados: [] },
      { nombreBase: 'FRASCO C', nombreCompleto: 'FRASCO C', categoria: 'frasco', codigo: 'ENV003', presentacion: 1, mercadosHabilitados: [] },
    ], 'enc-1')

    // The raced row is skipped: no duplicate of ENV001 is ever created.
    expect(committed.map((producto) => producto.codigo)).toEqual(['ENV002', 'ENV003'])
    expect(result.productos).toHaveLength(2)
    expect(result.omitidosPorCarrera).toBe(1)
    // No duplicate of the raced code exists anywhere in the created rows.
    expect(committed.some((producto) => producto.codigo === 'ENV001')).toBe(false)
  })

  it('creates imported rows as PENDIENTE_REVISION, activo false, origen IMPORTACION, with no stock or movements', async () => {
    const writes: string[] = []
    const createdRows: Array<{ codigo: string | null; estado: string; activo: boolean; origen: string }> = []
    const tx = {
      depositoProducto: {
        findMany: async () => [] as Array<{ codigo: string }>,
        create: async ({ data }: { data: { codigo: string | null } }) => {
          writes.push(`depositoProducto:${data.codigo ?? 'null'}`)
          const created = { codigo: data.codigo, estado: 'PENDIENTE_REVISION', activo: false, origen: 'IMPORTACION' }
          createdRows.push(created)
          return { id: `imp-${createdRows.length}`, ...created }
        },
      },
      auditoriaCatalogoProducto: {
        create: async () => { writes.push('auditoriaCatalogoProducto'); return { id: 'audit-1' } },
      },
      inventarioDroga: { createMany: async () => { writes.push('inventarioDroga'); return { count: 1 } } },
      inventarioEtiqueta: { createMany: async () => { writes.push('inventarioEtiqueta'); return { count: 1 } } },
      inventarioEstuche: { createMany: async () => { writes.push('inventarioEstuche'); return { count: 1 } } },
      inventarioFrasco: { createMany: async () => { writes.push('inventarioFrasco'); return { count: 1 } } },
      movimiento: { create: async () => { writes.push('movimiento'); return { id: 'mov-1' } } },
    }
    const db = { 
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      depositoProducto: tx.depositoProducto 
    }
    const service = new CatalogoProductoService(db as PrismaClient)

    await service.createImportPendingBatch([
      { nombreBase: 'FRASCO A', nombreCompleto: 'FRASCO A', categoria: 'frasco', codigo: 'ENV001', presentacion: 1, mercadosHabilitados: [] },
    ], 'enc-1')

    expect(createdRows[0]).toEqual({ codigo: 'ENV001', estado: 'PENDIENTE_REVISION', activo: false, origen: 'IMPORTACION' })
    // Only producto + audit writes: no inventory seeding, no movements.
    expect(writes).toEqual(['depositoProducto:ENV001', 'auditoriaCatalogoProducto'])
  })
})
