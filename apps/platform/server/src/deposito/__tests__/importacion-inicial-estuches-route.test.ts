import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

const importMock = vi.hoisted(() => vi.fn())

vi.mock('@platform/db', () => ({
  Mercado: {
    argentina: 'argentina', colombia: 'colombia', bolivia: 'bolivia', ecuador: 'ecuador', paraguay: 'paraguay', VENEZUELA: 'VENEZUELA', mexico: 'mexico',
  },
}))

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../middleware/auth', () => ({
  authenticate: (req: { header(name: string): string | undefined; depositoUser?: unknown }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    const role = req.header('x-test-role')
    if (!role) return res.status(401).json({ message: 'Token requerido' })
    req.depositoUser = { id: 'enc-1', role }
    next()
  },
}))
vi.mock('../services/importacion-inicial-estuches-service', () => ({
  InitialEstuchesImportError: class InitialEstuchesImportError extends Error {
    constructor(public readonly code: 'INVALID' | 'CONFLICT', message: string) { super(message) }
  },
  ImportacionInicialEstuchesService: class ImportacionInicialEstuchesService { import = importMock },
}))

import router from '../routes/importacion-inicial-estuches'

const validPayload = {
  effectiveDate: '2026-08-11',
  rows: [{ sourceRow: 1, nombreBase: 'Estuche', nombreCompleto: 'Estuche A', presentacion: 1, mercado: 'argentina', cantidad: 3 }],
}

describe('POST /api/deposito/importaciones/estuches-inicial', () => {
  const app = createTestApp('/api/deposito/importaciones', router)

  beforeEach(() => {
    importMock.mockReset()
    importMock.mockResolvedValue({ replay: false, result: { batchId: 'batch-1', checksum: 'checksum', items: [] } })
  })

  it('returns 401 without authentication and 403 for a non-encargado', async () => {
    const unauthenticated = await request(app).post('/api/deposito/importaciones/estuches-inicial').send(validPayload)
    const forbidden = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'observador').set('Idempotency-Key', 'key').send(validPayload)
    expect(unauthenticated.status).toBe(401)
    expect(forbidden.status).toBe(403)
    expect(importMock).not.toHaveBeenCalled()
  })

  it('requires an idempotency key and validates JSON payloads before the service', async () => {
    const missingKey = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send(validPayload)
    const invalid = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').set('Idempotency-Key', 'key').send({ ...validPayload, rows: [] })
    expect(missingKey.status).toBe(400)
    expect(missingKey.body.message).toBe('Idempotency-Key es obligatorio')
    expect(invalid.status).toBe(400)
    expect(importMock).not.toHaveBeenCalled()
  })

  it('returns the JSON response contract as 201 then 200 for replay', async () => {
    importMock.mockResolvedValueOnce({ replay: false, result: { batchId: 'batch-1', checksum: 'checksum', items: [{ codigo: 'IGES001' }] } })
      .mockResolvedValueOnce({ replay: true, result: { batchId: 'batch-1', checksum: 'checksum', items: [{ codigo: 'IGES001' }] } })
    const first = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').set('Idempotency-Key', 'key').send(validPayload)
    const replay = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').set('Idempotency-Key', 'key').send(validPayload)
    expect(first.status).toBe(201)
    expect(first.headers['content-type']).toMatch(/^application\/json/)
    expect(first.body).toEqual({ batchId: 'batch-1', checksum: 'checksum', items: [{ codigo: 'IGES001' }] })
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(first.body)
    expect(importMock).toHaveBeenNthCalledWith(1, validPayload, 'enc-1', 'key')
  })

  it('maps service conflict errors to 409', async () => {
    const { InitialEstuchesImportError } = await import('../services/importacion-inicial-estuches-service')
    importMock.mockRejectedValueOnce(new InitialEstuchesImportError('CONFLICT', 'conflicto'))
    const response = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').set('Idempotency-Key', 'key').send(validPayload)
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'conflicto' })
  })
})
