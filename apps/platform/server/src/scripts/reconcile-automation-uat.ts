import 'dotenv/config'
import { writeFileSync } from 'node:fs'

// This command is deliberately bound to the audited local UAT database and IDs.
const databaseUrl = 'postgresql://postgres:postgres@localhost:5432/platform_test'
process.env.PLATFORM_DATABASE_URL = databaseUrl
process.env.DATABASE_URL = databaseUrl
const pedidoIds = ['cmtlu0wu0000ay8ojb68zy8tg', 'cmtluhy2b000hy8ojg4jiztj1', 'cmtluisih0001f0ojva3q5z9q']
const badAliasId = 'cmtlrvv1g000iqoojcau02g6c'

async function main() {
  const { platformDb: db } = await import('@platform/db')
  try {
    const [connection] = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
    if (connection?.database !== 'platform_test') throw new Error('Reconciliación permitida solo en platform_test')
    const before = await db.pedido.findMany({ where: { id: { in: pedidoIds } }, include: { items: true, reservas: true, interpretationDraft: true, auditorias: true, remitos: true } })
    const alias = await db.productAlias.findUnique({ where: { id: badAliasId } })
    if (before.length !== pedidoIds.length) throw new Error('Falta un pedido del alcance auditado')
    if (alias && (alias.alias !== 'b12b25 250ml' || alias.productId !== 'cmsrty880000sdkoj8tzb9cwk')) throw new Error('El alias cambió desde la auditoría')
    console.log(JSON.stringify({ database: connection.database, apply: process.argv.includes('--apply'), pedidos: before.map((pedido) => ({ id: pedido.id, origen: pedido.origen, estado: pedido.estado, reservas: pedido.reservas })), alias }, null, 2))
    if (!process.argv.includes('--apply')) return
    const backup = process.argv.find((arg) => arg.startsWith('--backup='))?.slice('--backup='.length)
    if (!backup) throw new Error('--backup=<archivo nuevo> es obligatorio')
    const productIds = [...new Set(before.flatMap((pedido) => pedido.items.map((item) => item.productoId)))]
    const inventory = await db.producto.findMany({ where: { id: { in: productIds } }, include: { lotes: { include: { saldos: true, reservas: true } } } })
    const movements = await db.movimientoStock.findMany({ where: { productoId: { in: productIds } } })
    writeFileSync(backup, JSON.stringify({ capturedAt: new Date().toISOString(), database: connection.database, before, alias, inventory, movements }, null, 2), { flag: 'wx' })
    const { reconcileLegacyAutomationOrder } = await import('../routes/ale-bet/automation/reconcile-legacy')
    const result = await db.$transaction(async (tx) => {
      const results = []
      for (const pedidoId of pedidoIds) {
        const pedido = before.find((entry) => entry.id === pedidoId)!
        if (pedido.items.length !== 1 || pedido.items[0].productoId !== 'cmsrty87v000ndkojjdfay68b' || pedido.items[0].cantidad !== 12) throw new Error('Items cambiaron desde la auditoría')
        results.push(await reconcileLegacyAutomationOrder(tx, pedidoId, pedido.interpretationDraft!.confirmedBy!))
      }
      // Match the audited identity as well as the ID; never delete unrelated aliases.
      await tx.productAlias.deleteMany({ where: { id: badAliasId, alias: 'b12b25 250ml', productId: 'cmsrty880000sdkoj8tzb9cwk' } })
      return results
    })
    console.log(JSON.stringify(result, null, 2))
  } finally { await db.$disconnect() }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
