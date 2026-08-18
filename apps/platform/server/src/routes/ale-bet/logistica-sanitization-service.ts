import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@platform/db'
import { LOGISTICA_INITIAL_ROWS, buildTechnicalSku } from './logistica-initial-load-data'

const canonicalRows = [...LOGISTICA_INITIAL_ROWS]
const canonicalByName = new Map(canonicalRows.map((row) => [row.product, row]))

type ManifestLot = { id: string; cajas: number; sueltos: number }
export type ManifestProduct = {
  id: string
  nombre: string
  sku: string
  unidadesPorCaja: number
  lots: ManifestLot[]
  balances: number[]
  reservations: number
  movements: number
  items: number
}
type ManifestInput = { products: ManifestProduct[]; mixedOrderIds?: string[] }

export type SanitizationManifest = {
  fingerprint: string
  safe: boolean
  blockers: string[]
  canonical: ManifestProduct[]
  deletableDemo: ManifestProduct[]
  retainedDemo: ManifestProduct[]
  mixedOrderIds: string[]
}

export class LogisticsSanitizationBlocked extends Error {}

const stable = (value: unknown) => JSON.stringify(value, (_key, nested) => nested instanceof Map ? [...nested.entries()] : nested)
const totalPhysical = (product: ManifestProduct) => product.lots.reduce((sum, lot) => sum + lot.cajas * product.unidadesPorCaja + lot.sueltos, 0)
const totalBalance = (product: ManifestProduct) => product.balances.reduce((sum, value) => sum + value, 0)
const isDemoProduct = (product: ManifestProduct) => /^(DEMO\b|TEST\b)/i.test(product.nombre.trim()) || /^(DEMO-|TEST-)/i.test(product.sku.trim())

export function buildSanitizationManifest(input: ManifestInput): SanitizationManifest {
  const blockers: string[] = []
  const products = [...input.products].sort((left, right) => left.id.localeCompare(right.id))
  const canonical: ManifestProduct[] = []
  for (const [name, row] of canonicalByName) {
    const candidates = products.filter((product) => product.nombre === name)
    if (candidates.length !== 1) {
      blockers.push(`canonical identity missing or ambiguous: ${name}`)
      continue
    }
    const product = candidates[0]
    if (product.sku !== buildTechnicalSku(row.product) || product.unidadesPorCaja !== row.unitsPerBox) {
      blockers.push(`canonical identity mismatch: ${name}`)
    }
    canonical.push(product)
  }

  const demoProducts = products.filter(isDemoProduct)
  // Physical stock, reservations and movement history are part of the DEMO graph;
  // they are deleted transactionally. Only mixed operational documents block.
  const deletableDemo = [...demoProducts]
  const retainedDemo: ManifestProduct[] = []

  const mixedOrderIds = [...new Set(input.mixedOrderIds ?? [])].sort()
  for (const pedidoId of mixedOrderIds) blockers.push(`mixed DEMO/canonical pedido: ${pedidoId}`)
  for (const product of canonical) {
    if (product.reservations !== 0) blockers.push(`canonical reservation exists: ${product.id}`)
  }

  const fingerprint = createHash('sha256').update(stable({ products, mixedOrderIds, blockers: [...blockers].sort() })).digest('hex')
  return { fingerprint, safe: blockers.length === 0, blockers, canonical, deletableDemo, retainedDemo, mixedOrderIds }
}

type DbClient = Prisma.TransactionClient | PrismaClient
async function getPlatformDb(): Promise<PrismaClient> { return (await import('@platform/db')).platformDb }

async function readManifestProducts(db: DbClient): Promise<{ products: ManifestProduct[]; mixedOrderIds: string[] }> {
  const names = [...canonicalByName.keys()]
  const products = await db.producto.findMany({
    where: { OR: [{ nombre: { in: names } }, { sku: { startsWith: 'LOG-' } }, { sku: { startsWith: 'DEMO-' } }, { sku: { startsWith: 'TEST-' } }, { nombre: { startsWith: 'DEMO' } }, { nombre: { startsWith: 'TEST' } }] },
    include: { lotes: { include: { saldos: true, reservas: true } } },
    orderBy: { id: 'asc' },
  })
  const ids = products.map((product) => product.id)
  const [movementGroups, itemGroups, demoItems] = await Promise.all([
    db.movimientoStock.groupBy({ by: ['productoId'], where: { productoId: { in: ids } }, _count: { _all: true } }),
    db.itemPedido.groupBy({ by: ['productoId'], where: { productoId: { in: ids } }, _count: { _all: true } }),
    db.itemPedido.findMany({ where: { productoId: { in: ids } }, select: { productoId: true, pedidoId: true, pedido: { select: { items: { select: { productoId: true } } } } } }),
  ])
  const movements = new Map(movementGroups.map((group) => [group.productoId, group._count._all]))
  const items = new Map(itemGroups.map((group) => [group.productoId, group._count._all]))
  const manifestProducts: ManifestProduct[] = products.map((product) => ({ id: product.id, nombre: product.nombre, sku: product.sku, unidadesPorCaja: product.unidadesPorCaja, lots: product.lotes.map((lot) => ({ id: lot.id, cajas: lot.cajas, sueltos: lot.sueltos })), balances: product.lotes.flatMap((lot) => lot.saldos.map((balance) => balance.cantidad)), reservations: product.lotes.reduce((sum, lot) => sum + lot.reservas.filter((reservation) => reservation.estado === 'ACTIVA').length, 0), movements: movements.get(product.id) ?? 0, items: items.get(product.id) ?? 0 }))
  const demoIds = new Set(manifestProducts.filter(isDemoProduct).map((product) => product.id))
  const mixedOrderIds = [...new Set(demoItems.filter((item) => item.pedido.items.some((line) => !demoIds.has(line.productoId))).map((item) => item.pedidoId))]
  return {
    products: manifestProducts,
    mixedOrderIds,
  }
}

export async function preflightLogisticsSanitization(db?: DbClient): Promise<SanitizationManifest> {
  const input = await readManifestProducts(db ?? await getPlatformDb())
  return buildSanitizationManifest(input)
}

async function lockSanitizationRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('ale_bet:logistics-sanitization-v2'))`)
  await tx.$executeRaw(Prisma.sql`SELECT p.id FROM "ale_bet"."Producto" p WHERE p.sku LIKE 'DEMO-%' OR p.sku LIKE 'TEST-%' OR p."nombre" ILIKE 'DEMO%' OR p."nombre" ILIKE 'TEST%' ORDER BY p.id FOR UPDATE`)
}

const requireSafe = (manifest: SanitizationManifest, expectedFingerprint: string): void => {
  if (manifest.fingerprint !== expectedFingerprint) throw new LogisticsSanitizationBlocked('manifest fingerprint drifted; run dry-run again')
  if (!manifest.safe) throw new LogisticsSanitizationBlocked(manifest.blockers.join('; '))
}

export async function applyLogisticsSanitization(expectedFingerprint: string, db?: PrismaClient) {
  return (db ?? await getPlatformDb()).$transaction(async (tx) => {
    await lockSanitizationRows(tx)
    const before = await preflightLogisticsSanitization(tx)
    requireSafe(before, expectedFingerprint)
    const demoIds = before.deletableDemo.map((product) => product.id)
    const lotIds = before.deletableDemo.flatMap((product) => product.lots.map((lot) => lot.id))
    const demoItems = await tx.itemPedido.findMany({ where: { productoId: { in: demoIds } }, select: { id: true, pedidoId: true } })
    const demoOnlyOrderIds = [...new Set(demoItems.map((item) => item.pedidoId))]
    const counts = {
      reservas: await tx.reservaStock.deleteMany({ where: { OR: [{ loteId: { in: lotIds } }, { pedidoId: { in: demoOnlyOrderIds } }] } }),
      movimientos: await tx.movimientoStock.deleteMany({ where: { OR: [{ productoId: { in: demoIds } }, { pedidoId: { in: demoOnlyOrderIds } }] } }),
      remitos: await tx.remito.deleteMany({ where: { pedidoId: { in: demoOnlyOrderIds } } }),
      auditorias: await tx.pedidoAuditoria.deleteMany({ where: { pedidoId: { in: demoOnlyOrderIds } } }),
      items: await tx.itemPedido.deleteMany({ where: { productoId: { in: demoIds } } }),
      pedidos: await tx.pedido.deleteMany({ where: { id: { in: demoOnlyOrderIds } } }),
      saldos: await tx.saldoStock.deleteMany({ where: { productoId: { in: demoIds } } }),
      lotes: await tx.lote.deleteMany({ where: { productoId: { in: demoIds } } }),
      productos: await tx.producto.deleteMany({ where: { id: { in: demoIds } } }),
    }
    const after = await preflightLogisticsSanitization(tx)
    const canonicalBalance = after.canonical.reduce((sum, product) => sum + totalBalance(product), 0)
    if (!after.safe || after.deletableDemo.length !== 0 || after.retainedDemo.length !== 0 || canonicalBalance !== 0) {
      throw new LogisticsSanitizationBlocked('postcondition failed: DEMO graph or canonical stock invariant remains')
    }
    return { beforeFingerprint: before.fingerprint, afterFingerprint: after.fingerprint, deletedDemo: before.deletableDemo.map((product) => ({ id: product.id, nombre: product.nombre, sku: product.sku })), counts, canonicalProducts: after.canonical.length, canonicalLots: after.canonical.reduce((sum, product) => sum + product.lots.length, 0), canonicalStock: canonicalBalance }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
