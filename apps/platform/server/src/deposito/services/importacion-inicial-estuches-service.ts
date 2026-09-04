import { Mercado, Prisma, PrismaClient } from '@platform/db'
import { canonicalizeInitialEstuchesRows, checksumInitialEstuchesRows, codeForCatalogSequence, codeForMarketSequence, InitialEstuchesImportError, type InitialCatalogCategory, type InitialEstuchesMarket, type InitialEstuchesRow } from './importacion-inicial-estuches-helpers'

export { canonicalizeInitialEstuchesRows, checksumInitialEstuchesRows, codeForCatalogSequence, codeForMarketSequence, InitialEstuchesImportError }
export type { InitialCatalogCategory, InitialEstuchesMarket, InitialEstuchesRow }

export interface InitialEstuchesImportRequest { rows: InitialEstuchesRow[] }
export interface InitialEstuchesImportResult {
  items: Array<{ sourceRow: number; productoId: string; inventarioId: string; mercado: Mercado; codigo: string }>
}

export class ImportacionInicialEstuchesService {
  constructor(private readonly db: PrismaClient) {}

  async import(request: InitialEstuchesImportRequest): Promise<{ replay: boolean; result: InitialEstuchesImportResult }> {
    const rows = canonicalizeInitialEstuchesRows(request.rows)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.db.$transaction(async (tx) => {
          const existingByIdentity = new Map<string, Awaited<ReturnType<typeof tx.depositoProducto.findFirst>>>()
          for (const row of rows) {
            const existing = await tx.depositoProducto.findFirst({
              where: { nombreCompleto: row.nombreCompleto, categoria: row.categoria, mercado: row.mercado },
            })
            if (existing && row.codigo && existing.codigo !== row.codigo) {
              throw new InitialEstuchesImportError('CONFLICT', `La identidad ${row.nombreCompleto}/${row.mercado} ya existe con otro código`)
            }
            existingByIdentity.set(`${row.nombreCompleto}|${row.categoria}|${row.mercado}`, existing)
          }

          const newRows = rows.filter((row) => !existingByIdentity.get(`${row.nombreCompleto}|${row.categoria}|${row.mercado}`))
          const suppliedCodes = newRows.flatMap((row) => row.codigo ? [row.codigo] : [])
          if (suppliedCodes.length > 0) {
            const conflicts = await tx.depositoProducto.count({ where: { codigo: { in: suppliedCodes } } })
            if (conflicts > 0) throw new InitialEstuchesImportError('CONFLICT', 'Uno o más códigos ya existen')
          }

          const counters = new Map<string, number>()
          const sequenceGroups = [...new Set(newRows.map((row) => `${row.categoria}|${row.mercado}`))].sort()
          for (const group of sequenceGroups) {
            const [categoria, market] = group.split('|') as [InitialCatalogCategory, InitialEstuchesMarket]
            const count = newRows.filter((row) => row.categoria === categoria && row.mercado === market).length
            const sequence = categoria === 'frasco'
              ? await tx.secuenciaCodigoFrasco.update({ where: { id: 'canonical' }, data: { ultimo: { increment: count } } })
              : categoria === 'etiqueta'
                ? await tx.secuenciaCodigoEtiqueta.update({ where: { mercado: market }, data: { ultimo: { increment: count } } })
                : await tx.secuenciaCodigoEstuche.update({ where: { mercado: market }, data: { ultimo: { increment: count } } })
            counters.set(group, sequence.ultimo - count)
          }

          const items: InitialEstuchesImportResult['items'] = []
          for (const row of rows) {
            const group = `${row.categoria}|${row.mercado}`
            const existing = existingByIdentity.get(`${row.nombreCompleto}|${group}`)
            if (existing) {
              if (!existing.codigo) throw new InitialEstuchesImportError('CONFLICT', 'El producto existente no tiene código canónico')
              if (row.categoria === 'frasco') {
                const inventario = await tx.inventarioFrasco.findUnique({ where: { productoId: existing.id } })
                if (!inventario) throw new InitialEstuchesImportError('CONFLICT', 'El producto existente no tiene inventario canónico')
                if (inventario.unidadesPorCaja !== row.unidadesPorCaja) throw new InitialEstuchesImportError('CONFLICT', `La identidad ${row.nombreCompleto}/argentina ya existe con otra cantidad por caja`)
                items.push({ sourceRow: row.sourceRow, productoId: existing.id, inventarioId: inventario.id, mercado: row.mercado, codigo: existing.codigo })
                continue
              }
              const inventario = row.categoria === 'etiqueta'
                ? await tx.inventarioEtiqueta.findUnique({ where: { productoId_mercado: { productoId: existing.id, mercado: row.mercado } } })
                : await tx.inventarioEstuche.findUnique({ where: { productoId_mercado: { productoId: existing.id, mercado: row.mercado } } })
              if (!inventario) throw new InitialEstuchesImportError('CONFLICT', 'El producto existente no tiene inventario canónico')
              items.push({ sourceRow: row.sourceRow, productoId: existing.id, inventarioId: inventario.id, mercado: row.mercado, codigo: existing.codigo })
              continue
            }

            const next = (counters.get(group) ?? 0) + 1
            counters.set(group, next)
            const codigo = codeForCatalogSequence(row.categoria!, row.mercado, next)
            if (row.codigo && row.codigo !== codigo) throw new InitialEstuchesImportError('CONFLICT', `El código provisto no coincide con la secuencia reservada: ${row.codigo}`)
            const producto = await tx.depositoProducto.create({ data: {
              nombreBase: row.nombreBase, nombreCompleto: row.nombreCompleto, categoria: row.categoria, codigo,
              estado: 'ACTIVO', activo: true, origen: 'IMPORTACION_INICIAL_ESTUCHES', presentacion: row.presentacion, unidad: row.unidad,
              mercadosHabilitados: row.categoria === 'frasco' ? [] : [row.mercado], mercado: row.mercado,
            } })
            const inventario = row.categoria === 'frasco'
              ? await tx.inventarioFrasco.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, unidadesPorCaja: row.unidadesPorCaja!, cantidadCajas: 0, total: 0 } })
              : row.categoria === 'etiqueta'
                ? await tx.inventarioEtiqueta.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, mercado: row.mercado, cantidad: 0 } })
                : await tx.inventarioEstuche.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, mercado: row.mercado, cantidad: 0 } })
            items.push({ sourceRow: row.sourceRow, productoId: producto.id, inventarioId: inventario.id, mercado: row.mercado, codigo })
          }
          return { replay: newRows.length === 0, result: { items } }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if ((isSerializationFailure(error) || isPrismaUniqueConflict(error)) && attempt < 2) continue
        if (isSerializationFailure(error)) throw new InitialEstuchesImportError('CONFLICT', 'No se pudo serializar la importación luego de tres intentos')
        if (isPrismaUniqueConflict(error)) throw new InitialEstuchesImportError('CONFLICT', 'La importación entra en conflicto con datos existentes')
        throw error
      }
    }
    throw new InitialEstuchesImportError('CONFLICT', 'No se pudo completar la importación')
  }
}

function isSerializationFailure(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034' }
function isPrismaUniqueConflict(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002' }
