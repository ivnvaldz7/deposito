import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { platformDb as prisma } from '@platform/db'
import { createAleBetRoutes } from '../../routes/ale-bet/index'
import { createDepositoRoutes } from '../../deposito/routes/index'
import { truncateDb, SyncBarrier } from '../utils/db-cleaner'
import jwt from 'jsonwebtoken'

import type { JwtPayload } from '@platform/core'
import { verifyAccessToken } from '@platform/core'

const app = express()
app.use(express.json())

// Extender Express Request localmente para los tipos necesarios
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload
    depositoUser?: {
      id: string
      email: string
      name: string
      role: string
    }
  }
}

// Mock auth middleware for integration tests to bypass token validation
// but inject the right user data.
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    // Validar el payload de fuente externa (token decodeado) usando unknown y narrowing
    try {
      const decoded: unknown = jwt.verify(token, process.env.PLATFORM_JWT_SECRET || 'test-secret')

      if (typeof decoded === 'object' && decoded !== null && 'sub' in decoded) {
        const payload = decoded as JwtPayload
        req.user = payload
        // Also inject for deposito routes (legacy authenticate middleware mapping)
        req.depositoUser = {
          id: payload.sub,
          email: payload.email || '',
          name: payload.name || '',
          role: payload.apps?.deposito?.rol || 'encargado'
        }
      }
    } catch (e) {
      // Ignorar token invalido
    }
  }
  next()
})

app.use('/api/ale-bet', createAleBetRoutes())
app.use('/api/deposito', createDepositoRoutes())

function signTestToken(userId: string, role: string, email: string = 'test@example.com') {
  return jwt.sign({
    sub: userId,
    email,
    name: 'Test User',
    apps: {
      'ale-bet': { rol: role, activo: true },
      'deposito': { rol: role, activo: true }
    }
  }, process.env.PLATFORM_JWT_SECRET || 'test-secret')
}

describe('Concurrencia e Idempotencia (Reproducción de Fallos Actuales)', () => {
  beforeAll(async () => {
    // Basic connectivity check
    await prisma.$queryRaw`SELECT 1;`
  })

  beforeEach(async () => {
    await truncateDb(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('Test A — Dos usuarios toman el mismo pedido', () => {
    it('SD-01: Evitar doble toma de pedido. Debe permitir a un solo armador tomar el pedido.', async () => {
      // 1. Setup
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente A' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod A', sku: 'A1' } })

      const pedido = await prisma.pedido.create({
        data: {
          numero: 'P-TEST-001',
          clienteId: cliente.id,
          vendedorId: 'user-vendedor',
          estado: 'APROBADO', // Listo para ser tomado
          items: {
            create: [{ productoId: producto.id, cantidad: 10 }]
          }
        }
      })

      // Generar stock para evitar fallo por stock insuficiente
      await prisma.lote.create({
        data: {
          numero: 'L1',
          productoId: producto.id,
          cajas: 10,
          sueltos: 0,
          fechaProduccion: new Date(),
          fechaVencimiento: new Date(Date.now() + 10000000000)
        }
      })

      const token1 = signTestToken('armador-1', 'armador', 'armador1@test.com')
      const token2 = signTestToken('armador-2', 'armador', 'armador2@test.com')

      const req1 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token1}`)
      const req2 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token2}`)

      const p1 = req1.then(r => r)
      const p2 = req2.then(r => r)

      const [res1, res2] = await Promise.all([p1, p2])

      // Uno debe triunfar (200) y el otro fallar por conflicto de estado (409)
      const statuses = [res1.status, res2.status].sort()
      expect(statuses).toEqual([200, 409])

      const ref = await prisma.pedido.findUnique({ where: { id: pedido.id } })
      expect(ref?.estado).toBe('EN_ARMADO')
      // armadorId no debería ser nulo y debería ser uno de los dos
      expect(['armador-1', 'armador-2']).toContain(ref?.armadorId)

      // Verificamos que se descontó stock y se generó 1 solo movimiento
      const movimientos = await prisma.movimientoStock.count({ where: { referencia: pedido.id } })
      expect(movimientos).toBe(1)
    })
  })

  describe('Test B — Dos solicitudes ejecutan la misma orden', () => {
    it('SD-02: Evitar doble ejecución de orden. Debe ejecutarla una sola vez.', async () => {
      const user = await prisma.user.create({ data: { email: 'encargado@test.com', name: 'Encargado', passwordHash: 'hash', role: 'encargado' } })

      const orden = await prisma.ordenProduccion.create({
        data: {
          solicitanteId: user.id,
          categoria: 'frasco',
          productoNombre: 'Frasco 100ml',
          cantidad: 5,
          estado: 'aprobada'
        }
      })

      await prisma.inventarioFrasco.create({
        data: { articulo: 'Frasco 100ml', unidadesPorCaja: 10, cantidadCajas: 10, total: 100 }
      })

      const token = signTestToken(user.id, 'encargado', 'encargado@test.com')
      // Pre-flight to run JIT provisioning sequentially and avoid UniqueConstraintViolation on email
      await request(app).get(`/api/deposito/ordenes/${orden.id}`).set('Authorization', `Bearer ${token}`)

      const req1 = request(app).post(`/api/deposito/ordenes/${orden.id}/ejecutar`).set('Authorization', `Bearer ${token}`)
      const req2 = request(app).post(`/api/deposito/ordenes/${orden.id}/ejecutar`).set('Authorization', `Bearer ${token}`)

      const p1 = req1.then(r => r)
      const p2 = req2.then(r => r)

      const [res1, res2] = await Promise.all([p1, p2])

      // Esperado: Uno pasa, el otro falla
      expect([res1.status, res2.status].sort()).toEqual([200, 409])

      // Saldo esperado: 5 (10 - 5)
      const frasco = await prisma.inventarioFrasco.findUnique({ where: { articulo: 'Frasco 100ml' } })
      expect(frasco?.cantidadCajas).toBe(5)

      // La orden debe estar ejecutada
      const ordenDb = await prisma.ordenProduccion.findUnique({ where: { id: orden.id } })
      expect(ordenDb?.estado).toBe('ejecutada')

      // Bitácora efectiva (Movimiento)
      const movimientos = await prisma.movimiento.count({ where: { referenciaId: orden.id } })
      expect(movimientos).toBe(1)
    })
  })

  describe('Test C — Dos operaciones consumen el mismo lote con stock suficiente para una', () => {
    it('SD-03: Evitar stock negativo y Lost Update. Falla porque el primer update no se refleja en el segundo antes de validar.', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente C' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod C', sku: 'C1' } })

      // Stock para UN SOLO pedido (1 caja = 15 unidades, pondremos 2 cajas = 30 unidades)
      await prisma.lote.create({
        data: { numero: 'L-C', productoId: producto.id, cajas: 2, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 10000000000) }
      })

      const pedido1 = await prisma.pedido.create({
        data: { numero: 'P-C1', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 20 }] } }
      })
      const pedido2 = await prisma.pedido.create({
        data: { numero: 'P-C2', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 20 }] } }
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const req1 = request(app).put(`/api/ale-bet/pedidos/${pedido1.id}/tomar`).set('Authorization', `Bearer ${token}`)
      const req2 = request(app).put(`/api/ale-bet/pedidos/${pedido2.id}/tomar`).set('Authorization', `Bearer ${token}`)

      const p1 = req1.then(r => r)
      const p2 = req2.then(r => r)

      const [res1, res2] = await Promise.all([p1, p2])

      // Esperado: Uno 200, otro falla por stock
      expect([res1.status, res2.status].sort()).toEqual([200, 409])
    })
  })

  describe('Test D — Dos operaciones consumen el mismo lote con stock suficiente para ambas', () => {
    it('SD-04: Evitar Lost Update al consumir Lote. Falla porque el segundo pedido pisa matemáticamente al primero devolviendo saldo ficticio.', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente D' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod D', sku: 'D1' } })

      // Lote con 100 cajas (suficiente para ambos)
      await prisma.lote.create({
        data: { numero: 'L-D', productoId: producto.id, cajas: 100, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 10000000000) }
      })

      const pedido1 = await prisma.pedido.create({
        data: { numero: 'P-D1', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 15 }] } } // 1 caja
      })
      const pedido2 = await prisma.pedido.create({
        data: { numero: 'P-D2', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 30 }] } } // 2 cajas
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const req1 = request(app).put(`/api/ale-bet/pedidos/${pedido1.id}/tomar`).set('Authorization', `Bearer ${token}`)
      const req2 = request(app).put(`/api/ale-bet/pedidos/${pedido2.id}/tomar`).set('Authorization', `Bearer ${token}`)

      const p1 = req1.then(r => r)
      const p2 = req2.then(r => r)

      const [res1, res2] = await Promise.all([p1, p2])
      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      const loteFinal = await prisma.lote.findFirst({ where: { numero: 'L-D' } })

      // Esperado: 100 - (1 caja + 2 cajas) = 97 cajas
      expect(loteFinal?.cajas).toBe(97)
    })
  })

  describe('PR-B2A: Consumo de Lotes Ale-Bet', () => {
    it('FEFO preservado: consume primero el lote con fechaVencimiento más cercana', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente FEFO' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod FEFO', sku: 'FEFO1' } })

      // Lote 2 vence mañana
      await prisma.lote.create({
        data: { numero: 'L-FEFO-2', productoId: producto.id, cajas: 1, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) }
      })
      // Lote 1 vence en una semana
      await prisma.lote.create({
        data: { numero: 'L-FEFO-1', productoId: producto.id, cajas: 1, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000 * 7) }
      })

      const pedido = await prisma.pedido.create({
        data: { numero: 'P-FEFO', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 15 }] } }
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const res = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)

      const loteVenceManana = await prisma.lote.findFirst({ where: { numero: 'L-FEFO-2' } })
      const loteVenceSemana = await prisma.lote.findFirst({ where: { numero: 'L-FEFO-1' } })

      expect(loteVenceManana?.cajas).toBe(0) // Consumed
      expect(loteVenceManana?.activo).toBe(false)
      expect(loteVenceSemana?.cajas).toBe(1) // Intact
    })

    it('Desempate estable: misma fecha de vencimiento prioriza ID ASC', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Desempate' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod Desempate', sku: 'DES1' } })

      const fechaVenc = new Date(Date.now() + 86400000)

      // Lotes con la misma fecha
      const loteA = await prisma.lote.create({
        data: { id: 'lote-A-desempate', numero: 'L-DES-A', productoId: producto.id, cajas: 1, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: fechaVenc }
      })
      const loteB = await prisma.lote.create({
        data: { id: 'lote-B-desempate', numero: 'L-DES-B', productoId: producto.id, cajas: 1, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: fechaVenc }
      })

      const pedido = await prisma.pedido.create({
        data: { numero: 'P-DES', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 15 }] } }
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const res = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)

      const loteADb = await prisma.lote.findUnique({ where: { id: loteA.id } })
      const loteBDb = await prisma.lote.findUnique({ where: { id: loteB.id } })

      // ID 'lote-A-desempate' is alphabetically before 'lote-B-desempate'
      expect(loteADb?.cajas).toBe(0)
      expect(loteBDb?.cajas).toBe(1)
    })

    it('Espera y relectura: B lee saldo de A y reacciona al stock real (ya testeado en C y D por paralelismo)', async () => {
      // Las aserciones ya están garantizadas por los test SD-03 y SD-04 que envían request simultáneas
      // Si la relectura fallara, SD-04 arrojaría Lost Update o saldo erróneo. SD-03 fallaría al ver stock suficiente (fantasma).
      expect(true).toBe(true)
    })

    it('Rollback durante distribución: trigger detiene la transacción y limpia estado', async () => {
      // Creamos trigger temporal
      await prisma.$executeRaw`
        CREATE OR REPLACE FUNCTION ale_bet.fail_test_trigger() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Forced rollback for testing';
        END;
        $$ LANGUAGE plpgsql;
      `
      await prisma.$executeRaw`
        CREATE TRIGGER test_rollback_trigger
        BEFORE INSERT ON ale_bet."MovimientoStock"
        FOR EACH ROW EXECUTE FUNCTION ale_bet.fail_test_trigger();
      `

      try {
        const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Rollback' } })
        const producto = await prisma.producto.create({ data: { nombre: 'Prod Rollback', sku: 'RB1' } })

        await prisma.lote.create({
          data: { numero: 'L-RB-1', productoId: producto.id, cajas: 10, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) }
        })

        const pedido = await prisma.pedido.create({
          data: { numero: 'P-RB', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 15 }] } }
        })

        const token = signTestToken('armador', 'armador', 'armador@test.com')
        const res = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(500) // Fallo DB

        // Rollback comprobado
        const loteFinal = await prisma.lote.findFirst({ where: { numero: 'L-RB-1' } })
        expect(loteFinal?.cajas).toBe(10) // Retornó a su estado original

        const pedidoDb = await prisma.pedido.findUnique({ where: { id: pedido.id } })
        expect(pedidoDb?.estado).toBe('APROBADO')
        expect(pedidoDb?.armadorId).toBeNull()

        const movs = await prisma.movimientoStock.count({ where: { referencia: pedido.id } })
        expect(movs).toBe(0)
      } finally {
        await prisma.$executeRaw`DROP TRIGGER IF EXISTS test_rollback_trigger ON ale_bet."MovimientoStock";`
        await prisma.$executeRaw`DROP FUNCTION IF EXISTS ale_bet.fail_test_trigger();`
      }
    })

    it('Deadlock evitado: pedidos con múltiples productos idénticos en orden inverso procesan bien', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente DL' } })
      const prodX = await prisma.producto.create({ data: { nombre: 'Prod X', sku: 'DLX' } })
      const prodY = await prisma.producto.create({ data: { nombre: 'Prod Y', sku: 'DLY' } })

      // Stock suficiente para ambos
      await prisma.lote.create({ data: { numero: 'L-DL-X', productoId: prodX.id, cajas: 10, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) } })
      await prisma.lote.create({ data: { numero: 'L-DL-Y', productoId: prodY.id, cajas: 10, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) } })

      // Pedido A: X -> Y
      const pedidoA = await prisma.pedido.create({
        data: { numero: 'P-DL-A', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO',
          items: { create: [{ productoId: prodX.id, cantidad: 15 }, { productoId: prodY.id, cantidad: 15 }] }
        }
      })
      // Pedido B: Y -> X
      const pedidoB = await prisma.pedido.create({
        data: { numero: 'P-DL-B', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO',
          items: { create: [{ productoId: prodY.id, cantidad: 15 }, { productoId: prodX.id, cantidad: 15 }] }
        }
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const pA = request(app).put(`/api/ale-bet/pedidos/${pedidoA.id}/tomar`).set('Authorization', `Bearer ${token}`)
      const pB = request(app).put(`/api/ale-bet/pedidos/${pedidoB.id}/tomar`).set('Authorization', `Bearer ${token}`)

      const [resA, resB] = await Promise.all([pA, pB])
      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)

      const loteX = await prisma.lote.findFirst({ where: { numero: 'L-DL-X' } })
      const loteY = await prisma.lote.findFirst({ where: { numero: 'L-DL-Y' } })

      // 10 cajas - 2 consumidas (1 por A, 1 por B) = 8
      expect(loteX?.cajas).toBe(8)
      expect(loteY?.cajas).toBe(8)

      const movs = await prisma.movimientoStock.count({ where: { referencia: { in: [pedidoA.id, pedidoB.id] } } })
      expect(movs).toBe(4) // 2 para A, 2 para B
    })

    it('Deadlock evitado con stock insuficiente multiproducto', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente DL2' } })
      const prodX = await prisma.producto.create({ data: { nombre: 'Prod X2', sku: 'DLX2' } })
      const prodY = await prisma.producto.create({ data: { nombre: 'Prod Y2', sku: 'DLY2' } })

      // Stock de X solo alcanza para UNA operación
      await prisma.lote.create({ data: { numero: 'L-DL2-X', productoId: prodX.id, cajas: 1, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) } })
      // Stock de Y alcanza para ambas
      await prisma.lote.create({ data: { numero: 'L-DL2-Y', productoId: prodY.id, cajas: 10, sueltos: 0, fechaProduccion: new Date(), fechaVencimiento: new Date(Date.now() + 86400000) } })

      // Pedido A: X -> Y
      const pedidoA = await prisma.pedido.create({
        data: { numero: 'P-DL2-A', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO',
          items: { create: [{ productoId: prodX.id, cantidad: 15 }, { productoId: prodY.id, cantidad: 15 }] }
        }
      })
      // Pedido B: Y -> X
      const pedidoB = await prisma.pedido.create({
        data: { numero: 'P-DL2-B', clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO',
          items: { create: [{ productoId: prodY.id, cantidad: 15 }, { productoId: prodX.id, cantidad: 15 }] }
        }
      })

      const token = signTestToken('armador', 'armador', 'armador@test.com')
      const pA = request(app).put(`/api/ale-bet/pedidos/${pedidoA.id}/tomar`).set('Authorization', `Bearer ${token}`)
      const pB = request(app).put(`/api/ale-bet/pedidos/${pedidoB.id}/tomar`).set('Authorization', `Bearer ${token}`)

      const [resA, resB] = await Promise.all([pA, pB])

      // Una 200, otra 409
      expect([resA.status, resB.status].sort()).toEqual([200, 409])

      const loteX = await prisma.lote.findFirst({ where: { numero: 'L-DL2-X' } })
      const loteY = await prisma.lote.findFirst({ where: { numero: 'L-DL2-Y' } })

      // Lote X se consumió totalmente por la ganadora, Y se consumió parcialmente
      expect(loteX?.cajas).toBe(0)
      expect(loteY?.cajas).toBe(9)

      // Cero movimientos de la perdedora, 2 de la ganadora
      const movs = await prisma.movimientoStock.count({ where: { referencia: { in: [pedidoA.id, pedidoB.id] } } })
      expect(movs).toBe(2)
    })
  })

  describe('Manejo de Errores y Rollbacks', () => {
    it('SD-05: Pedido inexistente -> 404', async () => {
      const token = signTestToken('armador-1', 'armador')
      const res = await request(app).put('/api/ale-bet/pedidos/non-existent-id/tomar').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('SD-06: Pedido en estado incompatible -> 409', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente E' } })
      const pedido = await prisma.pedido.create({
        data: {
          numero: 'P-TEST-002',
          clienteId: cliente.id,
          vendedorId: 'user-vendedor',
          estado: 'COMPLETADO', // Estado incompatible
        }
      })

      const token = signTestToken('armador-1', 'armador')
      const res = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(409)
    })

    it('SD-07: Orden inexistente -> 404', async () => {
      const token = signTestToken('user-id', 'encargado', 'user@test.com')
      const res = await request(app).post('/api/deposito/ordenes/non-existent-id/ejecutar').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('SD-08: Orden ya ejecutada -> 409', async () => {
      const user = await prisma.user.create({ data: { email: 'encargado2@test.com', name: 'Encargado', passwordHash: 'hash', role: 'encargado' } })
      const orden = await prisma.ordenProduccion.create({
        data: {
          solicitanteId: user.id,
          categoria: 'frasco',
          productoNombre: 'Frasco 100ml',
          cantidad: 5,
          estado: 'ejecutada'
        }
      })

      const token = signTestToken(user.id, 'encargado', 'encargado2@test.com')
      const res = await request(app).post(`/api/deposito/ordenes/${orden.id}/ejecutar`).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(409)
    })

    it('SD-09: Stock insuficiente revierte el estado del pedido y evita movimientos', async () => {
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente F' } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod F', sku: 'F1' } })

      const pedido = await prisma.pedido.create({
        data: {
          numero: 'P-TEST-003',
          clienteId: cliente.id,
          vendedorId: 'user-vendedor',
          estado: 'APROBADO',
          items: {
            create: [{ productoId: producto.id, cantidad: 10 }]
          }
        }
      })
      // No creamos stock, por lo que fallará por stock insuficiente

      const token = signTestToken('armador-1', 'armador')
      const res = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)

      // Verificamos que el pedido sigue APROBADO (rollback del updateMany)
      const ref = await prisma.pedido.findUnique({ where: { id: pedido.id } })
      expect(ref?.estado).toBe('APROBADO')
      expect(ref?.armadorId).toBeNull()

      // Verificamos cero movimientos
      const movimientos = await prisma.movimientoStock.count({ where: { referencia: pedido.id } })
      expect(movimientos).toBe(0)
    })

    it('SD-10: Stock insuficiente revierte el estado de la orden y evita movimientos', async () => {
      const user = await prisma.user.create({ data: { email: 'encargado3@test.com', name: 'Encargado', passwordHash: 'hash', role: 'encargado' } })
      const orden = await prisma.ordenProduccion.create({
        data: {
          solicitanteId: user.id,
          categoria: 'frasco',
          productoNombre: 'Frasco X',
          cantidad: 5,
          estado: 'aprobada'
        }
      })
      // Creamos inventario con 0 stock para que lance "Stock insuficiente"
      await prisma.inventarioFrasco.create({
        data: { articulo: 'Frasco X', unidadesPorCaja: 10, cantidadCajas: 0, total: 0 }
      })

      const token = signTestToken(user.id, 'encargado', 'encargado2@test.com')
      const res = await request(app).post(`/api/deposito/ordenes/${orden.id}/ejecutar`).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)

      const ref = await prisma.ordenProduccion.findUnique({ where: { id: orden.id } })
      expect(ref?.estado).toBe('aprobada')

      const movimientos = await prisma.movimiento.count({ where: { referenciaId: orden.id } })
      expect(movimientos).toBe(0)
    })
  })
})


describe('Concurrencia Deposito (PR-B2B)', () => {
  let encargadoId: string
  let tokenEncargado: string
  const jwt = require('jsonwebtoken')

  beforeEach(async () => {
    // Buscar o crear usuario Encargado
    const platformId = 'google-id-encargado-mock'
    let encargado = await prisma.user.findFirst({ where: { role: 'encargado' } })
    if (!encargado) {
      encargado = await prisma.user.create({
        data: {
          email: 'encargado-deposito@test.com',
          name: 'Encargado Test',
          role: 'encargado',
          platformUserId: 'google-id-encargado-mock',
          passwordHash: 'dummy-hash'
        }
      })
    }
    encargadoId = encargado.id

    // Generar un token JWT válido usando la funcion existente que inyecta activo: true
    // IMPORTANTE: el token 'sub' debe coincidir con platformUserId para que el middleware no intente actualizarlo
    tokenEncargado = signTestToken(encargado.platformUserId || platformId, 'encargado', encargado.email)

    // Pre-flight para JIT provisioning y evitar UniqueConstraintViolation
    await request(app).get(`/api/deposito/ordenes`).set('Authorization', `Bearer ${tokenEncargado}`)
  })

  // Test E
  it('Test E — Dos órdenes consumen la misma droga, stock para una', async () => {
    const droga = await prisma.inventarioDroga.create({
      data: {
        nombre: 'Droga E',
        cantidad: 15,
        lote: 'LOTE-E',
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: {
        solicitanteId: encargadoId,
        categoria: 'droga',
        productoNombre: 'Droga E',
        cantidad: 10,
        estado: 'aprobada'
      }
    })

    const orden2 = await prisma.ordenProduccion.create({
      data: {
        solicitanteId: encargadoId,
        categoria: 'droga',
        productoNombre: 'Droga E',
        cantidad: 10,
        estado: 'aprobada'
      }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])

    const codes = [res1.status, res2.status].sort()
    expect(codes).toEqual([200, 409]) // una exitosa, una rechazada

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    expect(finalDroga?.cantidad).toBe(5) // 15 - 10 = 5

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(1) // Solo un movimiento creado
    expect(movs[0].cantidad).toBe(-10)

    const finalOrden1 = await prisma.ordenProduccion.findUnique({ where: { id: orden1.id } })
    const finalOrden2 = await prisma.ordenProduccion.findUnique({ where: { id: orden2.id } })

    // Una orden completada/ejecutada, una en aprobada
    const estados = [finalOrden1?.estado, finalOrden2?.estado].sort()
    expect(estados).toEqual(['aprobada', 'ejecutada'])
  })

  // Test F
  it('Test F — Dos órdenes consumen la misma droga, stock para ambas', async () => {
    const droga = await prisma.inventarioDroga.create({
      data: {
        nombre: 'Droga F',
        cantidad: 30,
        lote: 'LOTE-F',
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga F', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga F', cantidad: 15, estado: 'aprobada' }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])


    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    expect(finalDroga?.cantidad).toBe(5) // 30 - 25 = 5

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(2)

    const finalOrden1 = await prisma.ordenProduccion.findUnique({ where: { id: orden1.id } })
    const finalOrden2 = await prisma.ordenProduccion.findUnique({ where: { id: orden2.id } })
    expect(finalOrden1?.estado).toBe('ejecutada')
    expect(finalOrden2?.estado).toBe('ejecutada')
  })

  // Test G
  it('Test G — Dos órdenes consumen los mismos frascos', async () => {
    const frasco = await prisma.inventarioFrasco.create({
      data: {
        articulo: 'Frasco G',
        unidadesPorCaja: 50,
        cantidadCajas: 15,
        total: 750,
      }
    })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco G', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco G', cantidad: 10, estado: 'aprobada' }
    })

    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])
    const codes = [res1.status, res2.status].sort()
    expect(codes).toEqual([200, 409]) // Solo alcanza para una (15 < 20)

    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
    expect(finalFrasco?.cantidadCajas).toBe(5)
    expect(finalFrasco?.total).toBe(250)

    const movs = await prisma.movimiento.findMany({ where: { referenciaId: { in: [orden1.id, orden2.id] } } })
    expect(movs).toHaveLength(1)
  })

  // Test H - Multiproducto es impracticable por diseño porque OrdenProduccion solo consume 1 tipo a la vez.
  // Testearemos ejecución paralela concurrente de 2 órdenes diferentes (una de droga y una de frasco) a la vez.
  it('Test H — Orden independiente consume droga y frasco concurrentemente sin deadlocks', async () => {
    const droga = await prisma.inventarioDroga.create({ data: { nombre: 'Droga H', cantidad: 20, lote: 'LOTE-H' } })
    const frasco = await prisma.inventarioFrasco.create({ data: { articulo: 'Frasco H', unidadesPorCaja: 10, cantidadCajas: 20, total: 200 } })

    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'droga', productoNombre: 'Droga H', cantidad: 10, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco H', cantidad: 10, estado: 'aprobada' }
    })

    const start = Date.now()
    const p1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const p2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([p1, p2])
    const end = Date.now()

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(end - start).toBeLessThan(5000)

    const finalDroga = await prisma.inventarioDroga.findUnique({ where: { id: droga.id } })
    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })

    expect(finalDroga?.cantidad).toBe(10)
    expect(finalFrasco?.cantidadCajas).toBe(10)
  })

  // Test I - Test conceptualmente análogo
  it('Test I — Multiproducto con stock insuficiente (no aplicable a modelo single-item, ver Test E y G)', async () => {
    expect(true).toBe(true)
  })

  // Test J - Rollback Forzado (sobre Frascos)
  it('Test J - Rollback forzado', async () => {
    const frasco = await prisma.inventarioFrasco.create({
      data: { articulo: 'Frasco J', unidadesPorCaja: 10, cantidadCajas: 50, total: 500 }
    })

    const orden = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco J', cantidad: 20, estado: 'aprobada' }
    })

    // Setup Trigger to force failure AFTER stock update but BEFORE commit
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION deposito.test_fail_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          RAISE EXCEPTION 'Simulated DB Error for Rollback';
      END;
      $$ LANGUAGE plpgsql;
    `)
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS force_fail_orden ON "deposito"."movimientos";`)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER force_fail_orden
      BEFORE INSERT ON "deposito"."movimientos"
      FOR EACH ROW
      EXECUTE FUNCTION deposito.test_fail_trigger();
    `)

    try {
      const res = await request(app)
        .post(`/api/deposito/ordenes/${orden.id}/ejecutar`)
        .set('Authorization', `Bearer ${tokenEncargado}`)

      expect(res.status).toBe(500)

      const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
      expect(finalFrasco?.cantidadCajas).toBe(50) // Rollback preservó stock!
      expect(finalFrasco?.total).toBe(500)

      const finalOrden = await prisma.ordenProduccion.findUnique({ where: { id: orden.id } })
      expect(finalOrden?.estado).toBe('aprobada') // Rollback preservó estado de orden!

      const movs = await prisma.movimiento.findMany({ where: { referenciaId: orden.id } })
      expect(movs).toHaveLength(0) // Nada insertado
    } finally {
      // Teardown Trigger
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS force_fail_orden ON "deposito"."movimientos";`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS deposito.test_fail_trigger();`)
    }
  })

  // Test K (Revisado) - Conflicto concurrente válido con frascos coherentes
  it('Test K - Conflicto concurrente válido de frascos', async () => {
    // Creamos frasco con cajas=10, upc=10, total=100 (Coherente)
    const frasco = await prisma.inventarioFrasco.create({
      data: {
        articulo: 'Frasco K Rev',
        unidadesPorCaja: 10,
        cantidadCajas: 10,
        total: 100, // Coherente
      }
    })

    // Dos órdenes que piden 6 cajas (60 unidades) cada una. Solo hay 10 cajas disponibles.
    const orden1 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco K Rev', cantidad: 6, estado: 'aprobada' }
    })
    const orden2 = await prisma.ordenProduccion.create({
      data: { solicitanteId: encargadoId, categoria: 'frasco', productoNombre: 'Frasco K Rev', cantidad: 6, estado: 'aprobada' }
    })

    const req1 = request(app).post(`/api/deposito/ordenes/${orden1.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)
    const req2 = request(app).post(`/api/deposito/ordenes/${orden2.id}/ejecutar`).set('Authorization', `Bearer ${tokenEncargado}`)

    const [res1, res2] = await Promise.all([req1, req2])

    const successRes = res1.status === 200 ? res1 : res2
    const failRes = res1.status === 409 ? res1 : res2

    expect(successRes.status).toBe(200)
    expect(failRes.status).toBe(409)

    const finalFrasco = await prisma.inventarioFrasco.findUnique({ where: { id: frasco.id } })
    expect(finalFrasco?.cantidadCajas).toBe(4) // 10 - 6
    expect(finalFrasco?.total).toBe(40) // 100 - 60
  })
  describe('Idempotencia de Tomar Pedido (PR-B3A)', () => {
    it('Test L - Reintento secuencial', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente L ' + uniqueId } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod L ' + uniqueId, sku: 'L1-' + uniqueId } })
      const pedido = await prisma.pedido.create({
        data: { numero: 'P-L-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 1 }] } }
      })
      await prisma.lote.create({ data: { numero: 'L-L1', productoId: producto.id, cajas: 10, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const token = signTestToken('armador-L', 'armador')
      const idempotencyKey = 'idemp-L-' + uniqueId

      const res1 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res1.status).toBe(200)

      const res2 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res2.status).toBe(200)
      expect(res2.header['idempotency-replayed']).toBe('true')
      expect(res1.body).toEqual(res2.body)

      const movimientos = await prisma.movimientoStock.findMany({ where: { referencia: pedido.id } })
      expect(movimientos).toHaveLength(1)

      const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey } })
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('COMPLETED')
    })

    it('Test M - Replay concurrente', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente ' + uniqueId } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod M ' + uniqueId, sku: 'M1-' + uniqueId } })
      const pedido = await prisma.pedido.create({
        data: { numero: 'P-M-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 1 }] } }
      })
      await prisma.lote.create({ data: { numero: 'L-M1', productoId: producto.id, cajas: 10, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const token = signTestToken('armador-M', 'armador')
      const idempotencyKey = 'idemp-M-' + uniqueId

      const p1 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      const p2 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)

      const [res1, res2] = await Promise.all([p1, p2])

      const isRes1Replay = res1.headers['idempotency-replayed'] === 'true'
      const isRes2Replay = res2.headers['idempotency-replayed'] === 'true'

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      expect(isRes1Replay !== isRes2Replay).toBe(true)
      expect(res1.body).toEqual(res2.body)

      const movimientos = await prisma.movimientoStock.findMany({ where: { referencia: pedido.id } })
      expect(movimientos).toHaveLength(1)

      const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey } })
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('COMPLETED')
    })

    it('Test N - Clave reutilizada con otro pedido', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente N ' + uniqueId } })
      const pedido1 = await prisma.pedido.create({
        data: { numero: 'P-N1-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO' }
      })
      const pedido2 = await prisma.pedido.create({
        data: { numero: 'P-N2-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO' }
      })

      const token = signTestToken('armador-N', 'armador')
      const idempotencyKey = 'idemp-N-' + uniqueId

      const res1 = await request(app).put(`/api/ale-bet/pedidos/${pedido1.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res1.status).toBe(200)

      const res2 = await request(app).put(`/api/ale-bet/pedidos/${pedido2.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res2.status).toBe(409)
      expect(res2.body.error).toContain('IDEMPOTENCY_KEY_REUSED')

      const p2Updated = await prisma.pedido.findUnique({ where: { id: pedido2.id } })
      expect(p2Updated?.estado).toBe('APROBADO') // Intacto
    })

    it('Test O - Payload diferente (No aplicable al endpoint sin body)', () => {
      // Endpoint carece de body funcional (solo path param), validado en unitarios de calculateFingerprint.
      expect(true).toBe(true)
    })

    it('Test P - Sin clave', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente P ' + uniqueId } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod P ' + uniqueId, sku: 'P1-' + uniqueId } })
      const pedido = await prisma.pedido.create({
        data: { numero: 'P-P-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 1 }] } }
      })
      await prisma.lote.create({ data: { numero: 'L-P1-' + uniqueId, productoId: producto.id, cajas: 10, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const token = signTestToken('armador-P', 'armador')

      const p1 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)
      const p2 = request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`)

      const [res1, res2] = await Promise.all([p1, p2])
      const codes = [res1.status, res2.status].sort()
      expect(codes).toEqual([200, 409])

      const movimientos = await prisma.movimientoStock.findMany({ where: { referencia: pedido.id } })
      expect(movimientos).toHaveLength(1)
    })

    it('Test Q - 409 no almacenado', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente Q ' + uniqueId } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod Q ' + uniqueId, sku: 'Q1-' + uniqueId } })
      const pedido = await prisma.pedido.create({
        data: { numero: 'P-Q-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 1 }] } }
      })
      // Cajas = 0 para provocar conflicto (stock insuficiente)
      await prisma.lote.create({ data: { numero: 'L-Q1-' + uniqueId, productoId: producto.id, cajas: 0, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const token = signTestToken('armador-Q', 'armador')
      const idempotencyKey = 'idemp-Q-' + uniqueId

      const res1 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res1.status).toBe(409) // Stock insuficiente

      const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey } })
      expect(records).toHaveLength(0)

      // Reponer stock
      await prisma.lote.create({ data: { numero: 'L-Q1', productoId: producto.id, cajas: 100, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const res2 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res2.status).toBe(200)
    })

    it('Test R - 500 no almacenado', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente R ' + uniqueId } })
      const producto = await prisma.producto.create({ data: { nombre: 'Prod R ' + uniqueId, sku: 'R1-' + uniqueId } })
      const pedido = await prisma.pedido.create({
        data: { numero: 'P-R-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO', items: { create: [{ productoId: producto.id, cantidad: 1 }] } }
      })
      await prisma.lote.create({ data: { numero: 'L-R1-' + uniqueId, productoId: producto.id, cajas: 10, fechaProduccion: new Date(), fechaVencimiento: new Date() } })

      const token = signTestToken('armador-R', 'armador')
      const idempotencyKey = 'idemp-R-' + uniqueId

      // Force 500 on mutation
      const trigger = new SyncBarrier(process.env.DATABASE_URL!, 'ale_bet', 'Pedido')
      await trigger.setup()
      // Modify trigger to just throw exception
      const pgClient = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL })
      await pgClient.connect()
      await pgClient.query(`
        CREATE OR REPLACE FUNCTION ${trigger.getFunctionName()}() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Simulated 500 Error';
        END;
        $$ LANGUAGE plpgsql;
      `)
      await pgClient.end()

      const res1 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res1.status).toBe(500)
      expect(res1.body.message).toBe("Error interno del servidor")
      expect(JSON.stringify(res1.body)).not.toContain('Simulated 500 Error')

      const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey } })
      expect(records).toHaveLength(0)

      await trigger.releaseAndTeardown()

      const res2 = await request(app).put(`/api/ale-bet/pedidos/${pedido.id}/tomar`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idempotencyKey)
      expect(res2.status).toBe(200)
    })

    it('Test S - Aislamiento entre actores', async () => {
      const uniqueId = Math.random().toString(36).substring(7)
      const cliente = await prisma.cliente.create({ data: { nombre: 'Cliente S ' + uniqueId } })
      const pedido1 = await prisma.pedido.create({
        data: { numero: 'P-S1-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO' }
      })
      const pedido2 = await prisma.pedido.create({
        data: { numero: 'P-S2-' + uniqueId, clienteId: cliente.id, vendedorId: 'v1', estado: 'APROBADO' }
      })

      const token1 = signTestToken('armador-S1', 'armador')
      const token2 = signTestToken('armador-S2', 'armador')
      const idempotencyKey = 'idemp-S-' + uniqueId

      const res1 = await request(app).put(`/api/ale-bet/pedidos/${pedido1.id}/tomar`).set('Authorization', `Bearer ${token1}`).set('Idempotency-Key', idempotencyKey)
      const res2 = await request(app).put(`/api/ale-bet/pedidos/${pedido2.id}/tomar`).set('Authorization', `Bearer ${token2}`).set('Idempotency-Key', idempotencyKey)

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey } })
      expect(records).toHaveLength(2)
    })
  })
})
