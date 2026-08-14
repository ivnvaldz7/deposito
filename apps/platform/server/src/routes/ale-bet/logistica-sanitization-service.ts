import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@platform/db'
import { LOGISTICA_INITIAL_ROWS, buildTechnicalSku } from './logistica-initial-load-data'

const canonicalRows = [...LOGISTICA_INITIAL_ROWS]
const canonicalByName = new Map(canonicalRows.map((row) => [row.product, row]))
const demoDeleteAllowlist = new Map([
  ['DEMO-PRO-H', { nombre: 'DEMO Producto H', unidadesPorCaja: 20 }],
  ['DEMO-PRO-I', { nombre: 'DEMO Producto I', unidadesPorCaja: 12 }],
])

type ManifestLot = { id: string; cajas: number; sueltos: number }
type ManifestProduct = { id: string; nombre: string; sku: string; unidadesPorCaja: number; lots: ManifestLot[]; balances: number[]; reservations: number; movements: number; items: number }
type ManifestInput = { products: ManifestProduct[] }

export type SanitizationManifest = {
  fingerprint: string
  safe: boolean
  blockers: string[]
  canonical: ManifestProduct[]
  deletableDemo: ManifestProduct[]
  retainedDemo: ManifestProduct[]
}

export class LogisticsSanitizationBlocked extends Error {}

const stable = (value: unknown) => JSON.stringify(value, (_key, nested) => nested instanceof Map ? [...nested.entries()] : nested)
const totalPhysical = (product: ManifestProduct) => product.lots.reduce((sum, lot) => sum + lot.cajas * product.unidadesPorCaja + lot.sueltos, 0)
const totalBalance = (product: ManifestProduct) => product.balances.reduce((sum, value) => sum + value, 0)

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
  const canonicalIds = new Set(canonical.map((product) => product.id))
  const extraLogProducts = products.filter((product) => product.sku.startsWith('LOG-') && !canonicalIds.has(product.id))
  if (extraLogProducts.length > 0) blockers.push(`unexpected LOG products: ${extraLogProducts.map((product) => product.sku).join(',')}`)
  const deletableDemo: ManifestProduct[] = []
  const retainedDemo: ManifestProduct[] = []
  for (const product of products.filter((candidate) => candidate.sku.startsWith('DEMO-'))) {
    const allowlisted = demoDeleteAllowlist.get(product.sku)
    if (!allowlisted) { retainedDemo.push(product); continue }
    const safe = product.nombre === allowlisted.nombre && product.unidadesPorCaja === allowlisted.unidadesPorCaja && totalPhysical(product) === 0 && totalBalance(product) === 0 && product.reservations === 0 && product.movements === 0 && product.items === 0
    if (!safe) blockers.push(`DEMO deletion unsafe: ${product.sku}`)
    else deletableDemo.push(product)
  }
  const presentAllowedDemo = products.filter((product) => demoDeleteAllowlist.has(product.sku))
  if (presentAllowedDemo.length !== 0 && deletableDemo.length !== demoDeleteAllowlist.size) blockers.push('expected isolated DEMO H/I identities are incomplete')
  if (retainedDemo.length !== 10) blockers.push(`expected 10 retained DEMO products, found ${retainedDemo.length}`)
  for (const product of canonical) {
    if (product.reservations !== 0) blockers.push(`canonical reservation exists: ${product.id}`)
  }
  const canonicalIdsExpected = new Set(canonicalRows.map((row) => row.product))
  if (canonicalIdsExpected.size !== 43) blockers.push('canonical manifest source is not exactly 43 products')
  const fingerprint = createHash('sha256').update(stable({ products, blockers: [...blockers].sort() })).digest('hex')
  return { fingerprint, safe: blockers.length === 0, blockers, canonical, deletableDemo, retainedDemo }
}

type DbClient = Prisma.TransactionClient | PrismaClient

async function getPlatformDb(): Promise<PrismaClient> {
  return (await import('@platform/db')).platformDb
}

async function readManifestProducts(db: DbClient): Promise<ManifestProduct[]> {
  const names = [...canonicalByName.keys()]
  const products = await db.producto.findMany({
    where: { OR: [{ nombre: { in: names } }, { sku: { startsWith: 'LOG-' } }, { sku: { startsWith: 'DEMO-' } }] },
    include: { lotes: { include: { saldos: true, reservas: true } } },
    orderBy: { id: 'asc' },
  })
  const ids = products.map((product) => product.id)
  const [movementGroups, itemGroups] = await Promise.all([
    db.movimientoStock.groupBy({ by: ['productoId'], where: { productoId: { in: ids } }, _count: { _all: true } }),
    db.itemPedido.groupBy({ by: ['productoId'], where: { productoId: { in: ids } }, _count: { _all: true } }),
  ])
  const movements = new Map(movementGroups.map((group) => [group.productoId, group._count._all]))
  const items = new Map(itemGroups.map((group) => [group.productoId, group._count._all]))
  return products.map((product) => ({
    id: product.id, nombre: product.nombre, sku: product.sku, unidadesPorCaja: product.unidadesPorCaja,
    lots: product.lotes.map((lot) => ({ id: lot.id, cajas: lot.cajas, sueltos: lot.sueltos })),
    balances: product.lotes.flatMap((lot) => lot.saldos.map((balance) => balance.cantidad)),
    reservations: product.lotes.reduce((sum, lot) => sum + lot.reservas.length, 0),
    movements: movements.get(product.id) ?? 0, items: items.get(product.id) ?? 0,
  }))
}

export async function preflightLogisticsSanitization(db?: DbClient): Promise<SanitizationManifest> {
  return buildSanitizationManifest({ products: await readManifestProducts(db ?? await getPlatformDb()) })
}

async function lockSanitizationRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('ale_bet:logistics-sanitization-v1'))`)
  await tx.$executeRaw(Prisma.sql`
    SELECT p.id FROM "ale_bet"."Producto" p
    WHERE p.sku LIKE 'LOG-%' OR p.sku LIKE 'DEMO-%'
    ORDER BY p.id FOR UPDATE
  `)
  await tx.$executeRaw(Prisma.sql`
    SELECT l.id FROM "ale_bet"."Lote" l
    JOIN "ale_bet"."Producto" p ON p.id = l."productoId"
    WHERE p.sku LIKE 'LOG-%' OR p.sku LIKE 'DEMO-%'
    ORDER BY l.id FOR UPDATE
  `)
  await tx.$executeRaw(Prisma.sql`
    SELECT s.id FROM "ale_bet"."SaldoStock" s
    JOIN "ale_bet"."Producto" p ON p.id = s."productoId"
    WHERE p.sku LIKE 'LOG-%' OR p.sku LIKE 'DEMO-%'
    ORDER BY s.id FOR UPDATE
  `)
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
    const deletableIds = before.deletableDemo.map((product) => product.id)
    const canonicalIds = before.canonical.map((product) => product.id)
    const canonicalLotIds = before.canonical.flatMap((product) => product.lots.map((lot) => lot.id))
    if (deletableIds.length > 0) {
      await tx.saldoStock.deleteMany({ where: { productoId: { in: deletableIds } } })
      await tx.lote.deleteMany({ where: { productoId: { in: deletableIds } } })
      await tx.producto.deleteMany({ where: { id: { in: deletableIds } } })
    }
    await tx.saldoStock.updateMany({ where: { productoId: { in: canonicalIds } }, data: { cantidad: 0 } })
    await tx.lote.updateMany({ where: { id: { in: canonicalLotIds } }, data: { cajas: 0, sueltos: 0 } })
    const after = await preflightLogisticsSanitization(tx)
    const canonicalPhysical = after.canonical.reduce((sum, product) => sum + totalPhysical(product), 0)
    const canonicalBalance = after.canonical.reduce((sum, product) => sum + totalBalance(product), 0)
    if (!after.safe || canonicalPhysical !== 0 || canonicalBalance !== 0 || after.canonical.some((product) => product.reservations !== 0)) {
      throw new LogisticsSanitizationBlocked('postcondition failed: canonical stock is not zero')
    }
    return { beforeFingerprint: before.fingerprint, afterFingerprint: after.fingerprint, deletedDemo: before.deletableDemo.map((product) => ({ id: product.id, nombre: product.nombre, sku: product.sku })), retainedDemo: before.retainedDemo.map((product) => ({ id: product.id, nombre: product.nombre, sku: product.sku })), canonicalProducts: canonicalIds.length, canonicalLots: canonicalLotIds.length, alreadyApplied: before.deletableDemo.length === 0 && canonicalPhysical === 0 && canonicalBalance === 0 }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
