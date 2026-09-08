import 'dotenv/config'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { writeFileSync } from 'node:fs'

process.env.PLATFORM_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/platform_test'
process.env.DATABASE_URL = process.env.PLATFORM_DATABASE_URL

async function main() {
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length)
  if (!output) throw new Error('--output=<archivo nuevo> es obligatorio')
  const { platformDb: db } = await import('@platform/db')
  const { signAccessToken } = await import('@platform/core')
  const runId = crypto.randomUUID()
  const evidence: Record<string, unknown> = { runId }
  const fixtureProductIds: string[] = []
  let fixtureCustomerId: string | undefined
  const save = () => writeFileSync(output, JSON.stringify(evidence, null, 2))
  writeFileSync(output, '{}', { flag: 'wx' })
  try {
    const [connection] = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
    assert.equal(connection.database, 'platform_test')
    evidence.database = connection.database
    const user = await db.platformUser.findFirstOrThrow({ where: { activo: true, appAccess: { some: { app: 'ale_bet', rol: 'admin', activo: true } } } })
    const auth = signAccessToken({ sub: user.id, email: user.email, apps: { 'ale-bet': { rol: 'admin', activo: true } } })
    async function http(path: string, method = 'GET', body?: object, key?: string) {
      const response = await fetch(`http://localhost:3102/api/ale-bet${path}`, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: response.status, replayed: response.headers.get('Idempotency-Replayed'), body: await response.json() }
    }
    const customer = await db.cliente.create({ data: { nombre: `UAT RUNTIME ${runId}`, estado: 'VALIDADO' } })
    fixtureCustomerId = customer.id
    const location = await db.ubicacionStock.findUniqueOrThrow({ where: { codigo: 'DEPOSITO' } })
    async function fixture(suffix: string, quantity: number) {
      const product = await db.producto.create({ data: { nombre: `UAT RUNTIME ${suffix} ${runId}`, sku: `UAT-${suffix}-${runId}`, unidadesPorCaja: 12 } })
      fixtureProductIds.push(product.id)
      const lote = await db.lote.create({ data: { productoId: product.id, numero: `UAT-${runId}`, cajas: quantity / 12, sueltos: 0 } })
      await db.saldoStock.create({ data: { productoId: product.id, loteId: lote.id, ubicacionId: location.id, cantidad: quantity } })
      await db.movimientoStock.create({ data: { productoId: product.id, loteId: lote.id, cantidad: quantity, tipo: 'AJUSTE', referencia: `Fixture aislado UAT ${runId}`, usuarioId: user.id, destinoUbicacionId: location.id } })
      return { product, lote }
    }
    async function draft(product: { nombre: string }, quantity = 12) {
      const response = await http('/automation/drafts', 'POST', { originalText: `Cliente: ${customer.nombre}\n${quantity} ${product.nombre}` })
      assert.equal(response.status, 201)
      assert.equal(response.body.estado, 'READY')
      // The actual HTTP process must have written this draft to platform_test.
      assert.equal((await db.orderInterpretationDraft.findUniqueOrThrow({ where: { id: response.body.id } })).originalText, response.body.originalText)
      return response.body
    }
    async function compare(productId: string, draftId: string, expected: number) {
      const [automation, productos, stock] = await Promise.all([http(`/automation/drafts/${draftId}`), http('/productos'), http('/stock')])
      for (const response of [automation, productos, stock]) assert.equal(response.status, 200)
      const product = productos.body.find((entry: { id: string }) => entry.id === productId)
      const stockProduct = stock.body.productos.find((entry: { id: string }) => entry.id === productId)
      const availability = automation.body.availability.find((entry: { productId: string }) => entry.productId === productId)
      const physical = (await db.saldoStock.aggregate({ where: { productoId: productId }, _sum: { cantidad: true } }))._sum.cantidad
      const reservations = await db.reservaStock.findMany({ where: { lote: { productoId: productId } } })
      const movements = await db.movimientoStock.findMany({ where: { productoId: productId, tipo: 'SALIDA_PEDIDO' } })
      assert.equal(physical, expected)
      assert.equal(product.fisico, expected); assert.equal(product.disponible, expected)
      assert.equal(stockProduct.stock, expected); assert.equal(stockProduct.stockDisponiblePedido, expected)
      assert.equal(availability.availableUnits, expected)
      assert.equal(reservations.filter((entry) => entry.estado === 'ACTIVA').length, 0)
      return { expected, physical, automation: availability, productos: { fisico: product.fisico, disponible: product.disponible }, stock: { stock: stockProduct.stock, stockDisponiblePedido: stockProduct.stockDisponiblePedido }, reservations, movements }
    }
    const controlled = await fixture('CONTROL', 108)
    evidence.controlledFixture = { customerId: customer.id, productId: controlled.product.id, loteId: controlled.lote.id }
    const preview = await draft(controlled.product, 1)
    const steps = [await compare(controlled.product.id, preview.id, 108)]
    evidence.steps = steps; save()
    for (const expected of [96, 84, 72]) {
      const created = await draft(controlled.product)
      const key = crypto.randomUUID()
      const confirmed = await http(`/automation/drafts/${created.id}/confirm`, 'POST', { expectedVersion: created.version }, key)
      assert.equal(confirmed.status, 200)
      assert.equal(confirmed.body.pedido.origen, 'AUTOMATION')
      const step = await compare(controlled.product.id, preview.id, expected)
      const pedidoId = confirmed.body.pedido.id
      assert.equal(step.reservations.filter((entry) => entry.pedidoId === pedidoId && entry.estado === 'CONSUMIDA').length, 1)
      assert.equal(step.movements.filter((entry) => entry.pedidoId === pedidoId && entry.cantidad === -12).length, 1)
      steps.push(step)
      if (expected === 96) {
        const replay = await http(`/automation/drafts/${created.id}/confirm`, 'POST', { expectedVersion: created.version }, key)
        assert.equal(replay.status, 200); assert.equal(replay.replayed, 'true'); assert.equal(replay.body.pedido.id, pedidoId)
        evidence.idempotency = { pedidoId, key, replayed: replay.replayed, state: await compare(controlled.product.id, preview.id, 96) }
        const edit = await http(`/pedidos/${pedidoId}`, 'PATCH', { expectedVersion: confirmed.body.pedido.version, clienteId: customer.id, items: [{ productoId: controlled.product.id, cantidad: 24 }] }, crypto.randomUUID())
        const cancel = await http(`/pedidos/${pedidoId}/cancelar`, 'PUT', { expectedVersion: confirmed.body.pedido.version }, crypto.randomUUID())
        assert.equal(edit.status, 409); assert.equal(cancel.status, 409)
        const billingAuth = signAccessToken({ sub: user.id, email: user.email, apps: { 'ale-bet': { rol: 'facturacion', activo: true } } })
        const billing = await fetch(`http://localhost:3102/api/ale-bet/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${billingAuth}` } })
        assert.equal(billing.status, 200)
        const tray = await fetch('http://localhost:3102/api/ale-bet/pedidos', { headers: { Authorization: `Bearer ${billingAuth}` } })
        assert.equal(tray.status, 200)
        const billingOrders: Array<{ id: string }> = await tray.json()
        assert(billingOrders.some((entry) => entry.id === pedidoId))
        evidence.contract = { edit, cancel, billingStatus: billing.status, billingPedido: await billing.json(), inBillingTray: true }
      }
      save()
    }
    const concurrent = await fixture('CONCURRENT', 12)
    const drafts = await Promise.all([draft(concurrent.product), draft(concurrent.product)])
    const responses = await Promise.all(drafts.map((created) => http(`/automation/drafts/${created.id}/confirm`, 'POST', { expectedVersion: created.version }, crypto.randomUUID())))
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
    const concurrentState = await compare(concurrent.product.id, drafts[0].id, 0)
    assert.equal(concurrentState.movements.length, 1)
    evidence.concurrency = { productId: concurrent.product.id, responses, state: concurrentState }
    evidence.result = 'PASS'; save()
    console.log(JSON.stringify({ database: connection.database, sequence: steps.map((step) => step.physical), idempotency: 'PASS', concurrency: responses.map((response) => response.status), output }))
  } catch (error) { evidence.error = String(error); save(); throw error }
  finally {
    try {
      // Delete only fixtures created by this invocation; preserve their complete
      // verification evidence in the report, and avoid polluting Facturación.
      if (fixtureCustomerId) {
        const customerId = fixtureCustomerId
        await db.$transaction(async (tx) => {
          const orders = await tx.pedido.findMany({ where: { clienteId: customerId }, select: { id: true } })
          const ids = orders.map((entry) => entry.id)
          await tx.orderInterpretationDraft.deleteMany({ where: { originalText: { startsWith: `Cliente: UAT RUNTIME ${runId}\n` } } })
          await tx.movimientoStock.deleteMany({ where: { productoId: { in: fixtureProductIds } } })
          await tx.stockProjectionOutbox.deleteMany({ where: { productId: { in: fixtureProductIds } } })
          await tx.reservaStock.deleteMany({ where: { pedidoId: { in: ids } } })
          await tx.pedidoAuditoria.deleteMany({ where: { pedidoId: { in: ids } } })
          await tx.itemPedido.deleteMany({ where: { pedidoId: { in: ids } } })
          await tx.pedido.deleteMany({ where: { id: { in: ids } } })
          await tx.saldoStock.deleteMany({ where: { productoId: { in: fixtureProductIds } } })
          await tx.lote.deleteMany({ where: { productoId: { in: fixtureProductIds } } })
          await tx.producto.deleteMany({ where: { id: { in: fixtureProductIds } } })
          await tx.cliente.delete({ where: { id: customerId } })
        })
        evidence.fixtureCleanup = { customerId, productIds: fixtureProductIds, result: 'PASS' }; save()
      }
    } finally { await db.$disconnect() }
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
