import request from 'supertest'
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers/create-test-app'
import { categoriaZerox } from '../services/zerox-catalogo'

const data = vi.hoisted(() => {
  const productoId = '11111111-1111-4111-8111-111111111111'
  const tapaId = '22222222-2222-4222-8222-222222222222'
  const products = [
    { id: productoId, categoria: 'frasco', nombreCompleto: 'PVC 200', codigo: 'ENV001', activo: true },
    { id: tapaId, categoria: 'material_empaque', nombreCompleto: 'TAPA VERDE', codigo: 'TAP001', activo: true },
    { id: '33333333-3333-4333-8333-333333333333', categoria: 'frasco', nombreCompleto: 'FRASCO NO AUTORIZADO', codigo: null, activo: true },
  ]
  type Movement = { id: string; claveOperacion: string; productoId: string; nombreProducto: string; categoria: string; tipo: string; cantidad: number; delta: number; saldoResultante: number; fechaMovimiento: Date; registradoAt: Date; usuario: { name: string }; observacion: string | null }
  const movements: Movement[] = []
  const prisma = {
    depositoProducto: {
      findMany: vi.fn(async () => products),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => products.find((product) => product.id === where.id) ?? null),
    },
    zeroxMovimiento: {
      findUnique: vi.fn(async ({ where }: { where: { claveOperacion: string } }) => movements.find((item) => item.claveOperacion === where.claveOperacion) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { productoId: string } }) => movements.find((item) => item.productoId === where.productoId) ?? null),
      aggregate: vi.fn(async ({ where }: { where: { productoId: string } }) => ({ _sum: { delta: movements.filter((item) => item.productoId === where.productoId).reduce((sum, item) => sum + item.delta, 0) } })),
      create: vi.fn(async ({ data: input }: { data: Omit<Movement, 'id' | 'registradoAt' | 'usuario'> & { usuarioId: string } }) => {
        const row = { ...input, id: `mov-${movements.length + 1}`, registradoAt: new Date('2026-10-15T12:00:00Z'), usuario: { name: 'Encargado' } }
        movements.push(row)
        return row
      }),
      groupBy: vi.fn(async () => products.flatMap((product) => {
        const rows = movements.filter((item) => item.productoId === product.id)
        return rows.length ? [{ productoId: product.id, categoria: rows[0].categoria, _sum: { delta: rows.reduce((sum, item) => sum + item.delta, 0) } }] : []
      })),
      findMany: vi.fn(async () => [...movements].reverse()),
      count: vi.fn(async () => movements.length),
    },
    $queryRaw: vi.fn(async () => [{ id: productoId }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  }
  return { productoId, tapaId, products, movements, prisma }
})

vi.mock('../lib/prisma', () => ({ prisma: data.prisma }))
vi.mock('../middleware/auth', () => ({ authenticate: (req: { depositoUser?: { id: string } }, _res: unknown, next: () => void) => { req.depositoUser = { id: 'user-1' }; next() } }))
vi.mock('../../middlewares/require-permission', () => ({ requirePermission: (_app: string, permission: string) => (req: { headers: Record<string, string> }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
  if (permission === 'pendientes.manage' && req.headers['x-test-role'] !== 'encargado') { res.status(403).json({ message: 'Sin permiso' }); return }
  next()
} }))

import zeroxRoutes from '../routes/zerox'
const app = createTestApp('/api/deposito/zerox', zeroxRoutes)

function descargarExcel(path: string) {
  return request(app).get(path).buffer(true).parse((response, done) => {
    const chunks: Buffer[] = []
    response.on('data', (chunk: Buffer) => chunks.push(chunk))
    response.on('end', () => done(null, Buffer.concat(chunks)))
  })
}

beforeEach(() => {
  data.movements.length = 0
  vi.clearAllMocks()
})

describe('Catálogo ZEROX', () => {
  it('acepta los 17 frascos elegidos y el alias PVC 200', () => {
    const names = [
      'AGROPECUARIO 25 ML', 'AGROPECUARIO 100 ML', 'AGROPECUARIO 500 ML',
      'BLANCO 500 ML', 'DORADO 50 ML', 'DORADO 250 ML', 'DORADO 500 ML',
      'IVERSAN 50 ML', 'TRANSPARENTE 500 ML', 'MARRÓN 300 ML', 'MARRÓN 500 ML',
      'PVC 100 ML', 'PVC 200', 'PVC 500 ML', 'VETERINARIO 250 ML',
      'AMBAR 100 ML', 'BIDÓN 500 ML',
    ]
    expect(names).toHaveLength(17)
    names.forEach((nombreCompleto) => expect(categoriaZerox({ categoria: 'frasco', nombreCompleto })).toBe('frasco'))
    expect(categoriaZerox({ categoria: 'frasco', nombreCompleto: 'OTRO 500 ML' })).toBeNull()
    expect(categoriaZerox({ categoria: 'material_empaque', nombreCompleto: 'TAPA VERDE' })).toBe('tapa')
  })
})

describe('API ZEROX', () => {
  it('registra fecha anterior y fecha real de carga sin tocar inventario', async () => {
    const result = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send({ claveOperacion: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', productoId: data.productoId, tipo: 'ingreso', cantidad: 120, fechaMovimiento: '2026-10-10', observacion: 'Remito 45' })
    expect(result.status).toBe(201)
    expect(result.body.saldoResultante).toBe(120)
    expect(result.body.fechaMovimiento).toBe('2026-10-10T00:00:00.000Z')
    expect(result.body.registradoAt).toBe('2026-10-15T12:00:00.000Z')
    expect(result.body.usuarioId).toBe('user-1')
    expect(data.movements).toHaveLength(1)
    expect(data.prisma.$queryRaw).toHaveBeenCalledOnce()
  })

  it('reintenta la misma clave sin duplicar el saldo', async () => {
    const body = { claveOperacion: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', productoId: data.productoId, tipo: 'ingreso', cantidad: 30, fechaMovimiento: '2026-10-10' }
    const first = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send(body)
    const replay = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send(body)
    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.body.id).toBe(first.body.id)
    expect(data.movements).toHaveLength(1)
    const conflicting = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send({ ...body, cantidad: 40 })
    expect(conflicting.status).toBe(409)
  })

  it('conserva saldo tras renombrar y permite dar salida a un producto inactivo', async () => {
    const input = { claveOperacion: 'ffffffff-ffff-4fff-8fff-ffffffffffff', productoId: data.productoId, tipo: 'ingreso', cantidad: 10, fechaMovimiento: '2026-10-10' }
    expect((await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send(input)).status).toBe(201)
    const originalName = data.products[0].nombreCompleto
    data.products[0].nombreCompleto = 'ENVASE RENOMBRADO'
    data.products[0].activo = false
    try {
      const saldos = await request(app).get('/api/deposito/zerox/saldos?categoria=frasco')
      expect(saldos.status).toBe(200)
      expect(saldos.body.find((row: { productoId: string }) => row.productoId === data.productoId)).toMatchObject({ saldo: 10, categoria: 'frasco', permiteIngreso: false })
      const nuevoIngreso = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send({ ...input, claveOperacion: '88888888-8888-4888-8888-888888888888' })
      expect(nuevoIngreso.status).toBe(400)
      const salida = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send({ ...input, claveOperacion: '99999999-9999-4999-8999-999999999999', tipo: 'salida', cantidad: 4 })
      expect(salida.status).toBe(201)
      expect(salida.body.saldoResultante).toBe(6)
    } finally {
      data.products[0].nombreCompleto = originalName
      data.products[0].activo = true
    }
  })

  it('impide una salida que dejaría saldo negativo sin escribir movimiento', async () => {
    const result = await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send({ claveOperacion: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', productoId: data.productoId, tipo: 'salida', cantidad: 1, fechaMovimiento: '2026-10-15' })
    expect(result.status).toBe(409)
    expect(data.movements).toHaveLength(0)
  })

  it('rechaza producto ajeno y escritura sin permiso', async () => {
    const body = { claveOperacion: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', productoId: data.products[2].id, tipo: 'ingreso', cantidad: 1, fechaMovimiento: '2026-10-15' }
    expect((await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'observador').send(body)).status).toBe(403)
    data.prisma.$queryRaw.mockResolvedValueOnce([{ id: body.productoId }])
    expect((await request(app).post('/api/deposito/zerox/movimientos').set('x-test-role', 'encargado').send(body)).status).toBe(400)
    expect(data.movements).toHaveLength(0)
  })

  it('exporta un Excel auditable con columnas, fechas y números tipados', async () => {
    data.movements.push({ id: 'mov-1', claveOperacion: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', productoId: data.tapaId, nombreProducto: '=FORMULA', categoria: 'tapa', tipo: 'ingreso', cantidad: 10, delta: 10, saldoResultante: 10, fechaMovimiento: new Date('2026-10-10T00:00:00Z'), registradoAt: new Date('2026-10-15T12:00:00Z'), usuario: { name: 'Encargado' }, observacion: null })
    const result = await descargarExcel('/api/deposito/zerox/exportar?vista=movimientos&categoria=tapa')
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toContain('spreadsheetml.sheet')
    expect(result.headers['content-disposition']).toContain('.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.body as Buffer)
    const sheet = workbook.getWorksheet('Movimientos')!
    expect(sheet.getCell('A2').value).toEqual(new Date('2026-10-10T00:00:00Z'))
    expect(sheet.getCell('D2').value).toBe('=FORMULA')
    expect(sheet.getCell('D2').type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell('F2').value).toBe(10)
    expect(sheet.getCell('H2').value).toBe('Encargado')
    expect(sheet.getCell('J2').value).toBe('mov-1')
    expect(sheet.autoFilter).toBeDefined()
  })

  it('exporta solo los saldos que coinciden con la búsqueda visible', async () => {
    const result = await descargarExcel('/api/deposito/zerox/exportar?vista=saldos&categoria=frasco&buscar=PVC')
    expect(result.status).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.body as Buffer)
    const sheet = workbook.getWorksheet('Saldos')!
    expect(sheet.getCell('B2').value).toBe('PVC 200')
    expect(sheet.getCell('D2').value).toBe(0)
    expect(sheet.rowCount).toBe(2)
  })
})
