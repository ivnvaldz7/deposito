import { describe, it, expect, beforeAll } from 'vitest'
import { platformDb as prisma, Role } from '@platform/db'
import { truncateDb } from '../utils/db-cleaner'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error: unknown) {
    return error
  }
  throw new Error('Se esperaba que la operación fallara')
}

function assertConstraintError(error: unknown, constraintName: string) {
  expect(isRecord(error)).toBe(true)
  if (!isRecord(error)) return

  const meta = error.meta
  expect(isRecord(meta)).toBe(true)
  if (!isRecord(meta)) return

  const driverError = meta.driverAdapterError
  expect(isRecord(driverError)).toBe(true)
  if (!isRecord(driverError)) return

  const cause = driverError.cause
  expect(isRecord(cause)).toBe(true)
  if (!isRecord(cause)) return

  expect(cause.code).toBe('23514')
  
  const message = cause.message
  expect(typeof message).toBe('string')
  if (typeof message === 'string') {
    expect(message).toContain(constraintName)
  }
}

describe('PostgreSQL Inventory Constraints (PR-C1)', () => {
  beforeAll(async () => {
    await truncateDb(prisma)
  })

  it('C1-A - Droga negativa (chk_inv_drogas_cantidad_no_negativa)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_drogas (id, nombre, cantidad, updated_at) VALUES (gen_random_uuid(), 'Droga C1-A', -5, now())`
    )
    assertConstraintError(error, 'chk_inv_drogas_cantidad_no_negativa')
  })

  it('C1-B1 - Cajas negativas (chk_inv_frascos_cajas_no_negativa)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_frascos (id, articulo, cantidad_cajas, unidades_por_caja, total, updated_at) VALUES (gen_random_uuid(), 'Frasco C1-B1', -1, 10, -10, now())`
    )
    assertConstraintError(error, 'chk_inv_frascos_cajas_no_negativa')
  })

  it('C1-B2 - Unidades por caja inválidas (chk_inv_frascos_upc_positiva)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_frascos (id, articulo, cantidad_cajas, unidades_por_caja, total, updated_at) VALUES (gen_random_uuid(), 'Frasco C1-B2', 10, 0, 0, now())`
    )
    assertConstraintError(error, 'chk_inv_frascos_upc_positiva')
  })

  it('C1-B3 - Total incoherente (chk_inv_frascos_total_coherente)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_frascos (id, articulo, cantidad_cajas, unidades_por_caja, total, updated_at) VALUES (gen_random_uuid(), 'Frasco C1-B3', 10, 10, 40, now())`
    )
    assertConstraintError(error, 'chk_inv_frascos_total_coherente')
  })

  it('C1-C - Estuche negativo (chk_inv_estuches_cantidad_no_negativa)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_estuches (id, articulo, cantidad, mercado, updated_at) VALUES (gen_random_uuid(), 'Estuche C1-C', -50, 'argentina', now())`
    )
    assertConstraintError(error, 'chk_inv_estuches_cantidad_no_negativa')
  })

  it('C1-D - Etiqueta negativa (chk_inv_etiquetas_cantidad_no_negativa)', async () => {
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.inventario_etiquetas (id, articulo, cantidad, mercado, updated_at) VALUES (gen_random_uuid(), 'Etiqueta C1-D', -500, 'argentina', now())`
    )
    assertConstraintError(error, 'chk_inv_etiquetas_cantidad_no_negativa')
  })

  it('C1-F - Movimiento cero (chk_movimientos_cantidad_no_cero)', async () => {
    const user = await prisma.user.create({ data: { email: 'test_c1_f@example.com', name: 'Test', role: Role.ADMIN, passwordHash: 'hash' } })
    
    // Movimiento positivo (permitido)
    await prisma.$executeRaw`INSERT INTO deposito.movimientos (id, referencia_id, tipo, categoria, cantidad, producto_nombre, created_by, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), 'ingreso_acta', 'droga', 5, 'Producto C1-F', ${user.id}, now())`
    
    // Movimiento negativo (permitido)
    await prisma.$executeRaw`INSERT INTO deposito.movimientos (id, referencia_id, tipo, categoria, cantidad, producto_nombre, created_by, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), 'egreso_orden', 'droga', -5, 'Producto C1-F', ${user.id}, now())`

    // Movimiento cero (debe fallar)
    const error = await captureError(() => 
      prisma.$executeRaw`INSERT INTO deposito.movimientos (id, referencia_id, tipo, categoria, cantidad, producto_nombre, created_by, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), 'ingreso_acta', 'droga', 0, 'Producto C1-F', ${user.id}, now())`
    )
    assertConstraintError(error, 'chk_movimientos_cantidad_no_cero')
    
    // Fila residual: 0 (la transacción falló, o no insertó)
    // Para validar que no quedó registro con 0, contamos:
    type CountRow = { count: bigint }
    const residual = await prisma.$queryRaw<CountRow[]>`SELECT count(*)::bigint FROM deposito.movimientos WHERE cantidad = 0`
    expect(Number(residual[0].count)).toBe(0)
  })

  it('C1-G - Operaciones válidas', async () => {
    const user = await prisma.user.create({ data: { email: 'test_c1_g@example.com', name: 'Test', role: Role.ADMIN, passwordHash: 'hash' } })
    const droga = await prisma.inventarioDroga.create({
      data: { nombre: 'Droga C1-G', cantidad: 0 }
    })
    expect(droga.cantidad).toBe(0)

    const updated = await prisma.inventarioDroga.update({
      where: { id: droga.id },
      data: { cantidad: { increment: 10 } }
    })
    expect(updated.cantidad).toBe(10)

    const decremented = await prisma.inventarioDroga.update({
      where: { id: droga.id },
      data: { cantidad: { decrement: 10 } }
    })
    expect(decremented.cantidad).toBe(0)

    const mov = await prisma.movimiento.create({
      data: {
        tipo: 'egreso_orden',
        cantidad: -10,
        categoria: 'droga',
        productoNombre: 'Frasco C1-G',
        referenciaId: 'test',
        user: { connect: { id: user.id } }
      }
    })
    expect(mov.cantidad).toBe(-10)
  })

  it('C1-H - Última defensa (SQL parametrizado directo bypass)', async () => {
    const frasco = await prisma.inventarioFrasco.create({
      data: { articulo: 'Frasco C1-H', cantidadCajas: 10, unidadesPorCaja: 10, total: 100 }
    })

    const error = await captureError(() => 
      prisma.$executeRaw`UPDATE deposito.inventario_frascos SET cantidad_cajas = -5 WHERE id = ${frasco.id}`
    )
    assertConstraintError(error, 'chk_inv_frascos_cajas_no_negativa')
    
    const intacto = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
    expect(intacto?.cantidadCajas).toBe(10)
  })
})
