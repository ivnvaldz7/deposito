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
  authenticate: (req: { header(name: string): string | undefined; depositoUser?: { id: string; role: string }; user?: { sub: string; apps: { deposito: { rol: string; activo: boolean } } } }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    const role = req.header('x-test-role')
    if (!role) return res.status(401).json({ message: 'Token requerido' })
    req.depositoUser = { id: 'enc-1', role }
    req.user = { sub: req.depositoUser.id, apps: { deposito: { rol: role, activo: true } } }
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
  rows: [{ sourceRow: 1, nombreBase: 'Estuche', nombreCompleto: 'Estuche A', presentacion: 1, mercado: 'argentina' }],
}

describe('POST /api/deposito/importaciones/estuches-inicial', () => {
  const app = createTestApp('/api/deposito/importaciones', router)

  beforeEach(() => {
    importMock.mockReset()
    importMock.mockResolvedValue({ replay: false, result: { items: [] } })
  })

  it('returns 401 without authentication and 403 for a non-encargado', async () => {
    const unauthenticated = await request(app).post('/api/deposito/importaciones/estuches-inicial').send(validPayload)
    const forbidden = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'observador').set('Idempotency-Key', 'key').send(validPayload)
    expect(unauthenticated.status).toBe(401)
    expect(forbidden.status).toBe(403)
    expect(importMock).not.toHaveBeenCalled()
  })

  it('rejects empty catalogs and obsolete stock fields before the service', async () => {
    const invalid = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send({ rows: [] })
    const withQuantity = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send({ rows: [{ ...validPayload.rows[0], cantidad: 3 }] })
    expect(invalid.status).toBe(400)
    expect(withQuantity.status).toBe(400)
    expect(importMock).not.toHaveBeenCalled()
  })

  it('returns the JSON response contract as 201 then 200 for replay', async () => {
    importMock.mockResolvedValueOnce({ replay: false, result: { items: [{ codigo: 'IGES001' }] } })
      .mockResolvedValueOnce({ replay: true, result: { items: [{ codigo: 'IGES001' }] } })
    const first = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send(validPayload)
    const replay = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send(validPayload)
    expect(first.status).toBe(201)
    expect(first.headers['content-type']).toMatch(/^application\/json/)
    expect(first.body).toEqual({ items: [{ codigo: 'IGES001' }] })
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(first.body)
    expect(importMock).toHaveBeenNthCalledWith(1, validPayload)
  })

  it('accepts etiqueta explicitly and rejects arbitrary categories', async () => {
    const etiqueta = { rows: [{ ...validPayload.rows[0], categoria: 'etiqueta' }] }
    const accepted = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send(etiqueta)
    const rejected = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').send({ rows: [{ ...validPayload.rows[0], categoria: 'frasco' }] })
    expect(accepted.status).toBe(201)
    expect(importMock).toHaveBeenCalledWith(etiqueta)
    expect(rejected.status).toBe(400)
  })

  it('maps service conflict errors to 409', async () => {
    const { InitialEstuchesImportError } = await import('../services/importacion-inicial-estuches-service')
    importMock.mockRejectedValueOnce(new InitialEstuchesImportError('CONFLICT', 'conflicto'))
    const response = await request(app).post('/api/deposito/importaciones/estuches-inicial').set('x-test-role', 'encargado').set('Idempotency-Key', 'key').send(validPayload)
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'conflicto' })
  })
})
