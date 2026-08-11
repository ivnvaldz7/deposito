import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@platform/db', () => ({ Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }))

import { ImportacionInicialEstuchesService, canonicalizeInitialEstuchesRows, checksumInitialEstuchesRows } from '../services/importacion-inicial-estuches-service'

const request = {
  effectiveDate: '2026-08-11',
  rows: [{ sourceRow: 1, nombreBase: 'Estuche', nombreCompleto: 'Estuche A', presentacion: 1, mercado: 'argentina' as const, cantidad: 1 }],
}
const result = { batchId: 'batch-1', checksum: '', items: [{ sourceRow: 1, productoId: 'producto-1', inventarioId: 'inventario-1', mercado: 'argentina' as const, codigo: 'IGES001', cantidad: 1 }] }
const modifiedRequest = { ...request, rows: [{ ...request.rows[0], cantidad: 2 }] }

describe('initial estuches import replay', () => {
  let db: {
    importacionInicialEstucheBatch: { findFirst: ReturnType<typeof vi.fn> }
    importacionInicialEstucheIdempotencyKey: { create: ReturnType<typeof vi.fn> }
    $transaction: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    db = {
      importacionInicialEstucheBatch: { findFirst: vi.fn() },
      importacionInicialEstucheIdempotencyKey: { create: vi.fn() },
      $transaction: vi.fn(),
    }
  })

  it('atomically claims a new idempotency key when replaying an identical checksum', async () => {
    const checksum = checksumInitialEstuchesRows(canonicalizeInitialEstuchesRows(request.rows))
    db.importacionInicialEstucheBatch.findFirst
      .mockResolvedValueOnce(null)
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db))
    db.importacionInicialEstucheBatch.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'batch-1', idempotencyKey: 'first-key', checksum, result: { ...result, checksum } })
    db.importacionInicialEstucheIdempotencyKey.create.mockResolvedValue({ idempotencyKey: 'second-key', batchId: 'batch-1' })

    const response = await new ImportacionInicialEstuchesService(db as never).import(request, 'actor-1', 'second-key')

    expect(response).toEqual({ replay: true, result: { ...result, checksum } })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.importacionInicialEstucheIdempotencyKey.create).toHaveBeenCalledWith({
      data: { idempotencyKey: 'second-key', batchId: 'batch-1' },
    })
  })

  it('prioritizes an existing idempotency key and rejects a different checksum without a checksum lookup', async () => {
    const checksum = 'a'.repeat(64)
    db.importacionInicialEstucheBatch.findFirst.mockResolvedValue({ idempotencyKey: 'key-a', checksum, result: { ...result, checksum } })

    await expect(new ImportacionInicialEstuchesService(db as never).import(request, 'actor-1', 'key-a')).rejects.toMatchObject({ code: 'CONFLICT' })

    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenCalledTimes(1)
    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenCalledWith({ where: { OR: [{ idempotencyKey: 'key-a' }, { idempotencyKeys: { some: { idempotencyKey: 'key-a' } } }] } })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a modified payload for an existing idempotency key before checking its checksum', async () => {
    const checksum = 'a'.repeat(64)
    db.importacionInicialEstucheBatch.findFirst.mockResolvedValue({ idempotencyKey: 'key-a', checksum, result: { ...result, checksum } })

    await expect(new ImportacionInicialEstuchesService(db as never).import(modifiedRequest, 'actor-1', 'key-a')).rejects.toMatchObject({ code: 'CONFLICT' })

    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenCalledTimes(1)
    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenCalledWith({ where: { OR: [{ idempotencyKey: 'key-a' }, { idempotencyKeys: { some: { idempotencyKey: 'key-a' } } }] } })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('looks up checksum only after a new idempotency key and claims it without stock mutations', async () => {
    const checksum = checksumInitialEstuchesRows(canonicalizeInitialEstuchesRows(request.rows))
    db.importacionInicialEstucheBatch.findFirst
      .mockResolvedValueOnce(null)
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db))
    db.importacionInicialEstucheBatch.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'batch-1', idempotencyKey: 'key-a', checksum, result: { ...result, checksum } })
    db.importacionInicialEstucheIdempotencyKey.create.mockResolvedValue({ idempotencyKey: 'key-b', batchId: 'batch-1' })

    const response = await new ImportacionInicialEstuchesService(db as never).import(request, 'actor-1', 'key-b')

    expect(response).toEqual({ replay: true, result: { ...result, checksum } })
    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenNthCalledWith(1, { where: { OR: [{ idempotencyKey: 'key-b' }, { idempotencyKeys: { some: { idempotencyKey: 'key-b' } } }] } })
    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenNthCalledWith(2, { where: { OR: [{ idempotencyKey: 'key-b' }, { idempotencyKeys: { some: { idempotencyKey: 'key-b' } } }] } })
    expect(db.importacionInicialEstucheBatch.findFirst).toHaveBeenNthCalledWith(3, { where: { checksum } })
    expect(db.importacionInicialEstucheIdempotencyKey.create).toHaveBeenCalledWith({ data: { idempotencyKey: 'key-b', batchId: 'batch-1' } })
  })

  it('requeries the winner after an identical checksum P2002 race and replays it', async () => {
    const checksum = checksumInitialEstuchesRows(canonicalizeInitialEstuchesRows(request.rows))
    db.importacionInicialEstucheBatch.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'batch-1', idempotencyKey: 'other-key', checksum, result: { ...result, checksum } })
    db.$transaction
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async (callback: (tx: typeof db) => unknown) => callback(db))
    db.importacionInicialEstucheIdempotencyKey.create.mockResolvedValue({ idempotencyKey: 'second-key', batchId: 'batch-1' })

    const response = await new ImportacionInicialEstuchesService(db as never).import(request, 'actor-1', 'second-key')

    expect(response).toEqual({ replay: true, result: { ...result, checksum } })
  })
})
