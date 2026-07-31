import request from 'supertest'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// 1. Mock @platform/core BEFORE createTestApp
const mockGetUserByEmail = vi.hoisted(() => vi.fn())
vi.mock('@platform/core', () => ({
  APP_SLUG_BY_ID: { deposito: 'deposito' },
  getAppAccess: (user: any, slug: string) => user && user.apps ? user.apps[slug] : undefined,
  getUserByEmail: mockGetUserByEmail,
  comparePassword: vi.fn(),
  signToken: vi.fn(),
  getUserById: vi.fn(),
}))

// 2. Mock Prisma BEFORE importing service/app
const mocks = vi.hoisted(() => ({
  prisma: {
    depositoProducto: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditoriaCatalogoProducto: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(mocks.prisma)),
  }
}))

vi.mock('@platform/db', () => ({
  Categoria: { droga: 'droga', estuche: 'estuche', etiqueta: 'etiqueta', frasco: 'frasco' },
  Mercado: { argentina: 'argentina', VENEZUELA: 'VENEZUELA' },
  EstadoProductoCatalogo: { PENDIENTE_REVISION: 'PENDIENTE_REVISION', ACTIVO: 'ACTIVO', INACTIVO: 'INACTIVO' },
  OrigenProductoCatalogo: { MANUAL: 'MANUAL', IMPORTACION: 'IMPORTACION', MIGRACION: 'MIGRACION' },
  TipoAuditoriaCatalogo: {},
  Prisma: {
    Decimal: class Decimal {
      value: number
      constructor(v: number) { this.value = v }
      toString() { return String(this.value) }
      toNumber() { return this.value }
    },
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string
      constructor(message: string, opts: { code: string }) {
        super(message)
        this.code = opts.code
      }
    },
  },
}))

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }))

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.depositoUser = { id: 'enc-1', role: req.headers['x-test-role'] || 'encargado' }
    next()
  },
  requireRole: (role: string) => (req: any, res: any, next: any) => {
    if (req.depositoUser.role !== role) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    next()
  },
}))

import { createTestApp } from './helpers/create-test-app'
import router from '../routes/productos'

// Legacy supplier list equivalent: CODIGO ARTICULO + NOMBRE ARTICULO columns
function buildLegacyXls(rows: Array<[string, string]>): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['CODIGO ARTICULO', 'NOMBRE ARTICULO'],
    ...rows,
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Listado')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }))
}

describe('Importación Legacy - Integración Real con Servicio', () => {
  const app = createTestApp('/api/productos', router)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.depositoProducto.findMany.mockResolvedValue([])
    mocks.prisma.depositoProducto.create.mockImplementation(async (args) => args.data)
  })

  it('MVP-01: preview, confirm y activate con archivo legacy sin presentacion', async () => {
    const bytes = buildLegacyXls([
      ['ENV006', 'BIDON 1 L'],
      ['ENV007', 'BIDON 5 L'],
    ])

    // 1. Preview
    const previewRes = await request(app)
      .post('/api/productos/importaciones/dry-run')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(previewRes.status).toBe(200)
    expect(previewRes.body.validas).toBe(2)
    expect(previewRes.body.invalidas).toBe(0)
    expect(previewRes.body.filas[0].producto.categoria).toBe('frasco')
    expect(previewRes.body.filas[0].producto.presentacion).toBeUndefined()

    // 2. Confirm (Batch)
    const confirmRes = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(confirmRes.status).toBe(201)
    expect(confirmRes.body.importadas).toBe(2)
    expect(confirmRes.body.omitidas).toBe(0)

    // Ensure it was saved as PENDIENTE_REVISION and null presentation
    expect(mocks.prisma.depositoProducto.create).toHaveBeenCalledTimes(2)
    const firstCall = mocks.prisma.depositoProducto.create.mock.calls[0][0]
    expect(firstCall.data.estado).toBe('PENDIENTE_REVISION')
    expect(firstCall.data.presentacion).toBeNull()

    // 3. Activate (should fail because presentacion is missing)
    mocks.prisma.depositoProducto.findUnique.mockResolvedValue({
      id: 'prod-1',
      codigo: 'ENV006',
      categoria: 'frasco',
      estado: 'PENDIENTE_REVISION',
      presentacion: null, // missing presentation!
      mercadosHabilitados: [],
    })

    const activateRes = await request(app)
      .post('/api/productos/prod-1/activar')
      .set('x-test-role', 'encargado')

    expect(activateRes.status).toBe(400)
    expect(activateRes.body.message).toContain('presentación')
  })
})
