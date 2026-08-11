import { Mercado, Prisma, PrismaClient } from '@platform/db'
import { canonicalizeInitialEstuchesRows, checksumInitialEstuchesRows, codeForMarketSequence, InitialEstuchesImportError, isInitialEstuchesMarket, type InitialEstuchesMarket, type InitialEstuchesRow } from './importacion-inicial-estuches-helpers'

export { canonicalizeInitialEstuchesRows, checksumInitialEstuchesRows, codeForMarketSequence, InitialEstuchesImportError }
export type { InitialEstuchesMarket, InitialEstuchesRow }

export interface InitialEstuchesImportRequest {
  effectiveDate: string
  rows: InitialEstuchesRow[]
}

export interface InitialEstuchesImportResult {
  batchId: string
  checksum: string
  items: Array<{ sourceRow: number; productoId: string; inventarioId: string; mercado: Mercado; codigo: string; cantidad: number }>
}

function parsePersistedResult(value: Prisma.JsonValue): InitialEstuchesImportResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { batchId, checksum, items } = value
  if (typeof batchId !== 'string' || typeof checksum !== 'string' || !Array.isArray(items)) return null
  const parsedItems: InitialEstuchesImportResult['items'] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const { sourceRow, productoId, inventarioId, mercado, codigo, cantidad } = item
    if (
      typeof sourceRow !== 'number' || !Number.isInteger(sourceRow) || typeof productoId !== 'string' || typeof inventarioId !== 'string'
      || typeof mercado !== 'string' || !isInitialEstuchesMarket(mercado) || typeof codigo !== 'string' || typeof cantidad !== 'number' || !Number.isInteger(cantidad)
    ) return null
    parsedItems.push({ sourceRow, productoId, inventarioId, mercado, codigo, cantidad })
  }
  return { batchId, checksum, items: parsedItems }
}

function serializePersistedResult(result: InitialEstuchesImportResult): Prisma.InputJsonObject {
  return {
    batchId: result.batchId,
    checksum: result.checksum,
    items: result.items.map((item) => ({
      sourceRow: item.sourceRow,
      productoId: item.productoId,
      inventarioId: item.inventarioId,
      mercado: item.mercado,
      codigo: item.codigo,
      cantidad: item.cantidad,
    })),
  }
}

const EFFECTIVE_DATE = '2026-08-11'

export class ImportacionInicialEstuchesService {
  constructor(private readonly db: PrismaClient) {}

  private async findReplayByKey(db: Pick<PrismaClient, 'importacionInicialEstucheBatch'>, checksum: string, idempotencyKey: string): Promise<InitialEstuchesImportResult | null> {
    const byKey = await db.importacionInicialEstucheBatch.findFirst({
      where: { OR: [{ idempotencyKey }, { idempotencyKeys: { some: { idempotencyKey } } }] },
    })
    if (byKey) {
      if (byKey.checksum !== checksum) throw new InitialEstuchesImportError('CONFLICT', 'La clave de idempotencia pertenece a otra importación')
      const result = byKey.result === null ? null : parsePersistedResult(byKey.result)
      if (result === null) throw new InitialEstuchesImportError('CONFLICT', 'La importación existente no tiene un resultado recuperable')
      return result
    }
    return null
  }

  private async findOrClaimReplay(db: Pick<PrismaClient, 'importacionInicialEstucheBatch' | 'importacionInicialEstucheIdempotencyKey'>, checksum: string, idempotencyKey: string): Promise<InitialEstuchesImportResult | null> {
    const byKey = await this.findReplayByKey(db, checksum, idempotencyKey)
    if (byKey) return byKey
    const byChecksum = await db.importacionInicialEstucheBatch.findFirst({ where: { checksum } })
    if (byChecksum) {
      const result = byChecksum.result === null ? null : parsePersistedResult(byChecksum.result)
      if (result === null) throw new InitialEstuchesImportError('CONFLICT', 'La importación existente no tiene un resultado recuperable')
      await db.importacionInicialEstucheIdempotencyKey.create({ data: { idempotencyKey, batchId: byChecksum.id } })
      return result
    }
    return null
  }

  async import(request: InitialEstuchesImportRequest, actorId: string, idempotencyKey: string): Promise<{ replay: boolean; result: InitialEstuchesImportResult }> {
    if (request.effectiveDate !== EFFECTIVE_DATE) throw new InitialEstuchesImportError('INVALID', `effectiveDate debe ser ${EFFECTIVE_DATE}`)
    if (!idempotencyKey.trim()) throw new InitialEstuchesImportError('INVALID', 'Idempotency-Key es obligatorio')
    const rows = canonicalizeInitialEstuchesRows(request.rows)
    const checksum = checksumInitialEstuchesRows(rows)
    const existing = await this.findReplayByKey(this.db, checksum, idempotencyKey)
    if (existing) return { replay: true, result: existing }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.db.$transaction(async (tx) => {
          const replay = await this.findOrClaimReplay(tx, checksum, idempotencyKey)
          if (replay) return { replay: true, result: replay }
          const suppliedCodes = rows.flatMap((row) => row.codigo ? [row.codigo] : [])
          const duplicateCodes = suppliedCodes.length === 0 ? [] : await tx.depositoProducto.findMany({ where: { codigo: { in: suppliedCodes } }, select: { codigo: true } })
          if (duplicateCodes.length > 0) throw new InitialEstuchesImportError('CONFLICT', 'Uno o más códigos ya existen')
          const batch = await tx.importacionInicialEstucheBatch.create({
            data: { idempotencyKey, checksum, actorId, effectiveDate: new Date(`${EFFECTIVE_DATE}T00:00:00.000Z`) },
          })
          const counters = new Map<InitialEstuchesMarket, number>()
          for (const market of [...new Set(rows.map((row) => row.mercado))].sort()) {
            const sequence = await tx.secuenciaCodigoEstuche.update({ where: { mercado: market }, data: { ultimo: { increment: rows.filter((row) => row.mercado === market).length } } })
            counters.set(market, sequence.ultimo - rows.filter((row) => row.mercado === market).length)
          }
          const items: InitialEstuchesImportResult['items'] = []
          for (const row of rows) {
            const next = (counters.get(row.mercado) ?? 0) + 1
            counters.set(row.mercado, next)
            const codigo = codeForMarketSequence(row.mercado, next)
            if (row.codigo && row.codigo !== codigo) throw new InitialEstuchesImportError('CONFLICT', `El código provisto no coincide con la secuencia reservada: ${row.codigo}`)
            const producto = await tx.depositoProducto.create({
              data: { nombreBase: row.nombreBase, nombreCompleto: row.nombreCompleto, categoria: 'estuche', codigo, estado: 'ACTIVO', activo: true, origen: 'IMPORTACION_INICIAL_ESTUCHES', presentacion: row.presentacion, mercadosHabilitados: [row.mercado] },
            })
            const inventario = await tx.inventarioEstuche.create({ data: { productoId: producto.id, articulo: producto.nombreCompleto, mercado: row.mercado, cantidad: row.cantidad } })
            const item = await tx.importacionInicialEstucheItem.create({ data: { batchId: batch.id, productoId: producto.id, inventarioEstucheId: inventario.id, mercado: row.mercado, codigo, sourceRow: row.sourceRow, cantidad: row.cantidad } })
            if (row.cantidad > 0) {
              await tx.movimiento.create({ data: { tipo: 'stock_inicial', categoria: 'estuche', productoNombre: producto.nombreCompleto, cantidad: row.cantidad, createdBy: actorId, productoId: producto.id, fechaEfectiva: new Date(`${EFFECTIVE_DATE}T00:00:00.000Z`), importacionInicialEstucheItemId: item.id } })
            }
            items.push({ sourceRow: row.sourceRow, productoId: producto.id, inventarioId: inventario.id, mercado: row.mercado, codigo, cantidad: row.cantidad })
          }
          const persisted: InitialEstuchesImportResult = { batchId: batch.id, checksum, items }
          await tx.importacionInicialEstucheBatch.update({ where: { id: batch.id }, data: { result: serializePersistedResult(persisted) } })
          return { replay: false, result: persisted }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
        return result
      } catch (error) {
        if (isSerializationFailure(error)) {
          if (attempt < 2) continue
          throw new InitialEstuchesImportError('CONFLICT', 'No se pudo serializar la importación luego de tres intentos')
        }
        if (isPrismaUniqueConflict(error)) {
          const replay = await this.db.$transaction(
            (tx) => this.findOrClaimReplay(tx, checksum, idempotencyKey),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          )
          if (replay) return { replay: true, result: replay }
          throw new InitialEstuchesImportError('CONFLICT', 'La importación entra en conflicto con datos existentes')
        }
        throw error
      }
    }
    throw new InitialEstuchesImportError('CONFLICT', 'No se pudo serializar la importación luego de tres intentos')
  }
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}
