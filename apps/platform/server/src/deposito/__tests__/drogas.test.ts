import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'

vi.mock('../middleware/auth', () => ({
  authenticate: (req: { header(name: string): string | undefined; depositoUser?: { id: string; role: string; name: string }; user?: { sub: string; apps: { deposito: { rol: string; activo: boolean } } } }, res: { status(code: number): { json(body: object): void } }, next: () => void) => {
    const role = req.header('x-test-role')
    if (!role) return res.status(401).json({ message: 'No autenticado' })
    req.depositoUser = { id: 'obs-1', role, name: 'Usuario Test' }
    req.user = { sub: req.depositoUser.id, apps: { deposito: { rol: role, activo: true } } }
    next()
  },
}))

const prismaMock = vi.hoisted(() => ({ depositoProducto: { findMany: vi.fn() } }))
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }))
import drogasRouter from '../routes/drogas'

describe('GET /api/drogas', () => {
  const app = createTestApp('/api/drogas', drogasRouter)

  beforeEach(() => vi.clearAllMocks())

  it('returns one catalog row for a drug without lots', async () => {
    prismaMock.depositoProducto.findMany.mockResolvedValue([{ id: 'p1', nombreCompleto: 'ATP', inventarioDrogas: [] }])
    const response = await request(app).get('/api/drogas').set('x-test-role', 'observador')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ productoId: 'p1', nombre: 'ATP', stockMinimo: null, cantidadTotal: 0, proximoVencimiento: null, lotes: [] }])
  })

  it('aggregates multiple lots and exposes FEFO ordering', async () => {
    prismaMock.depositoProducto.findMany.mockResolvedValue([{ id: 'p1', nombreCompleto: 'ATP', inventarioDrogas: [
      { id: 'late', lote: 'B', vencimiento: new Date('2027-06-01'), cantidad: 20, createdAt: new Date() },
      { id: 'early', lote: 'A', vencimiento: new Date('2027-01-01'), cantidad: 10, createdAt: new Date() },
    ] }])
    const response = await request(app).get('/api/drogas?orden=proximo-vencimiento').set('x-test-role', 'observador')
    expect(response.status).toBe(200)
    expect(response.body[0].cantidadTotal).toBe(30)
    expect(response.body[0].proximoVencimiento).toBe('2027-01-01T00:00:00.000Z')
    expect(response.body[0].lotes.map((lot: { lote: string }) => lot.lote)).toEqual(['A', 'B'])
  })

  it('requires authentication', async () => {
    const response = await request(app).get('/api/drogas')
    expect(response.status).toBe(401)
  })
})
