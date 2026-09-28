import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@platform/db'

vi.mock('@platform/db', () => ({ Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }))
import { PartidaError, PartidaProduccionService } from '../services/partida-produccion-service'

const product = (id: string, categoria: 'droga' | 'frasco' | 'estuche' | 'etiqueta', activo = true) => ({ id, activo, categoria, nombreCompleto: id, mercadosHabilitados: categoria === 'estuche' || categoria === 'etiqueta' ? ['argentina'] : [] })

function harness(products = [product('droga', 'droga'), product('frasco', 'frasco'), product('estuche', 'estuche')]) {
  const created: Array<{ solicitanteId: string; estado: string; items: { create: unknown[] } }> = []
  const db = {
    depositoProducto: { findMany: async () => products },
    partidaProduccion: { create: async ({ data }: { data: { solicitanteId: string; estado: string; items: { create: unknown[] } } }) => { created.push(data); return data } },
    $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  }
  return { service: new PartidaProduccionService(db as PrismaClient), created }
}

describe('DEP-V1 solicitudes lean', () => {
  it('crea una solicitud SOLICITADO con uno o varios productos sin consultar inventario', async () => {
    const { service, created } = harness()
    await service.create({ solicitanteId: 'u1', items: [{ productoId: 'droga', cantidadSolicitada: 0.25 }, { productoId: 'frasco', cantidadSolicitada: 2 }] })
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ solicitanteId: 'u1', estado: 'SOLICITADO' })
    expect(created[0]?.items.create).toHaveLength(2)
  })

  it('rechaza producto inexistente, inactivo, cantidades inválidas y mercado faltante', async () => {
    const { service } = harness([product('inactivo', 'frasco', false), product('estuche', 'estuche')])
    await expect(service.create({ solicitanteId: 'u1', items: [{ productoId: 'ausente', cantidadSolicitada: 1 }] })).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<PartidaError>)
    await expect(service.create({ solicitanteId: 'u1', items: [{ productoId: 'inactivo', cantidadSolicitada: 1 }] })).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<PartidaError>)
    await expect(service.create({ solicitanteId: 'u1', items: [{ productoId: 'estuche', cantidadSolicitada: 1.5, mercado: 'argentina' }] })).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<PartidaError>)
    await expect(service.create({ solicitanteId: 'u1', items: [{ productoId: 'estuche', cantidadSolicitada: 1 }] })).rejects.toMatchObject({ code: 'INVALID' } satisfies Partial<PartidaError>)
  })

  it('no descuenta ningún ítem cuando falta stock en otra línea y confirma en transacción serializable', async () => {
    const movements: unknown[] = []; const updates: unknown[] = []
    const partida = { id: 'p1', estado: 'SOLICITADO', items: [
      { id: 'i1', productoId: 'frasco', mercado: null, cantidadSolicitada: 2, cantidadFinal: null, producto: product('frasco', 'frasco') },
      { id: 'i2', productoId: 'faltante', mercado: null, cantidadSolicitada: 5, cantidadFinal: null, producto: product('faltante', 'frasco') },
    ] }
    const tx = {
      $queryRaw: async () => [{ id: 'inv', total: 3, unidades_por_caja: 1 }],
      partidaProduccion: { findUnique: async () => partida },
      inventarioFrasco: { findUniqueOrThrow: async () => ({ id: 'inv', total: 3, unidadesPorCaja: 1 }), update: async (value: unknown) => { updates.push(value) } },
      movimiento: { create: async (value: unknown) => { movements.push(value) }, },
    }
    const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    const service = new PartidaProduccionService(db as PrismaClient)
    await expect(service.confirmar('p1', 'encargado')).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<PartidaError>)
    expect(updates).toEqual([])
    expect(movements).toEqual([])
  })
})
