import request from 'supertest'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetUserByEmail = vi.hoisted(() => vi.fn())
vi.mock('@platform/core', () => ({
  APP_SLUG_BY_ID: { deposito: 'deposito' },
  getAppAccess: (user: any, slug: string) => user && user.apps ? user.apps[slug] : undefined,
  getUserByEmail: mockGetUserByEmail,
  comparePassword: vi.fn(),
  signToken: vi.fn(),
  getUserById: vi.fn(),
}))

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

function buildLegacyXls(rows: Array<[string, string]>): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['CODIGO ARTICULO', 'NOMBRE ARTICULO'],
    ...rows,
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Listado')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }))
}

describe('Importación Legacy - Códigos Existentes', () => {
  const app = createTestApp('/api/productos', router)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.depositoProducto.create.mockImplementation(async (args) => args.data)
  })

  it('MVP-01: preview and confirm with existing code', async () => {
    // Mock the DB to say ENV006 already exists!
    mocks.prisma.depositoProducto.findMany.mockResolvedValue([
      { codigo: 'ENV006' }
    ])

    const bytes = buildLegacyXls([
      ['ENV006', 'BIDON 1 L'], // Existing
      ['ENV007', 'BIDON 5 L'], // New
    ])

    const confirmRes = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    console.log(confirmRes.body)
    expect(confirmRes.status).toBe(201)
  })

  it('MVP-01: preview and confirm with existing name and category', async () => {
    // Mock the DB to say BIDON 1 L already exists!
    mocks.prisma.depositoProducto.findMany.mockImplementation(async (args) => {
      if (args.where?.OR) {
        return [{ nombreCompleto: 'BIDON 1 L', categoria: 'frasco' }]
      }
      return []
    })

    const bytes = buildLegacyXls([
      ['ENV006', 'BIDON 1 L'], // Existing name
      ['ENV007', 'BIDON 5 L'], // New
    ])

    const confirmRes = await request(app)
      .post('/api/productos/importaciones/confirmar')
      .set('x-test-role', 'encargado')
      .attach('archivo', Buffer.from(bytes), { filename: 'listado.xls', contentType: 'application/vnd.ms-excel' })

    expect(confirmRes.status).toBe(201)
    expect(confirmRes.body.importadas).toBe(1)
    expect(confirmRes.body.omitidas).toBe(1)
  })
})
