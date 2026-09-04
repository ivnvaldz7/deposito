import type { Prisma, PrismaClient } from '@platform/db'

type CandidateKind = 'legacy-equivalent' | 'test-residue' | 'inactive-test' | 'manual-duplicate'
type InventoryKind = 'etiqueta' | 'estuche'

export interface CleanupManifestEntry {
  id: string
  codigo: string | null
  estado: 'PENDIENTE_REVISION' | 'INACTIVO' | 'ACTIVO'
  origen: 'MIGRACION' | 'IMPORTACION' | 'MANUAL'
  categoria: 'frasco' | 'etiqueta' | 'estuche' | 'droga'
  kind: CandidateKind
  canonicalCode?: string
  nombreCompleto?: string
  allowedZeroInventory?: InventoryKind
}

const legacy = (id: string, codigo: string, canonicalCode: string): CleanupManifestEntry => ({
  id, codigo, canonicalCode, estado: 'PENDIENTE_REVISION', origen: 'IMPORTACION', categoria: 'frasco', kind: 'legacy-equivalent',
})
const residue = (id: string, codigo: string): CleanupManifestEntry => ({
  id, codigo, estado: 'PENDIENTE_REVISION', origen: 'IMPORTACION', categoria: 'frasco', kind: 'test-residue',
})

export const CATALOG_CLEANUP_MANIFEST: readonly CleanupManifestEntry[] = [
  legacy('413e54c5-97da-4f59-b0ec-5e7867c593ef', 'ENV001', 'ENV063'),
  legacy('9b84ad83-aa98-4d7e-9bf9-a43028eac6f2', 'ENV048', 'ENV063'),
  legacy('a81ea571-77f3-4394-bc65-85cd4ce34f30', 'ENV003', 'ENV064'),
  legacy('e5567a7d-5c2f-4842-9383-cfd706621642', 'ENV043', 'ENV064'),
  legacy('37b5543e-6c74-47e9-b584-1f44d2f76aa8', 'ENV004', 'ENV065'),
  legacy('e477c27b-8477-4d33-a165-87e9b58b7fd2', 'ENV005', 'ENV066'),
  legacy('5ef55a2b-da2d-4cab-9a99-fd8ef1d98441', 'ENV061', 'ENV066'),
  legacy('cf32cf99-5161-4e7a-9e2c-a3bab62bb02f', 'ENV008', 'ENV070'),
  legacy('39f76d22-6da7-45d9-9d2f-54f184b37504', 'ENV010', 'ENV071'),
  legacy('b52e2210-5ed9-4adb-9b19-7db238df8dcf', 'ENV011', 'ENV072'),
  legacy('4fecdc23-0a39-4cf5-b42f-a1c6ef77be02', 'ENV012', 'ENV073'),
  legacy('98a5a161-d590-4433-b70e-f3298baf3322', 'ENV014', 'ENV074'),
  legacy('fec20bba-da47-43db-bbdc-5b6b24bc52a3', 'ENV060', 'ENV074'),
  legacy('fc468c66-360f-408a-993b-dd458f3310ac', 'ENV015', 'ENV076'),
  legacy('e1f8069f-b435-4641-9e36-ceaddf1ee830', 'ENV016', 'ENV077'),
  legacy('cc6352ef-e622-4cb6-98c9-f0b0f93d085d', 'ENV017', 'ENV078'),
  legacy('9a90df47-ad55-4d4e-9d7c-620a17c1ec44', 'ENV018', 'ENV079'),
  legacy('4d6617ff-8dde-4b10-b917-09af77549ee4', 'ENV019', 'ENV080'),
  legacy('fd9b203c-c91d-4684-b3f1-a11fae535467', 'ENV052', 'ENV080'),
  legacy('2571e17d-8bf6-43c7-bab3-afae593fdab9', 'ENV021', 'ENV082'),
  legacy('96c66e21-b898-4910-9a73-5eb521340746', 'ENV027', 'ENV082'),
  legacy('97fa2b16-1f9f-4a83-8035-2d66fbc8f90b', 'ENV022', 'ENV083'),
  residue('0e565a0d-c1e4-4b03-bc47-c6a4067bd47e', 'ENV002'),
  residue('cff00dc2-df1d-494c-89ea-7a1642f9236b', 'ENV006'),
  residue('bf22d929-d313-4d31-9a14-241e5ff5f49d', 'ENV007'),
  residue('14d15e54-89f5-4b77-9624-af79ab6f17eb', 'ENV009'),
  residue('e20ebe22-d8bb-451d-b4c6-557a783e0f58', 'ENV013'),
  residue('4ba76b37-d742-4bac-93a5-2efb596ab048', 'ENV020'),
  residue('589264e0-9f9e-4683-b100-fb83962ca25a', 'ENV024'),
  residue('622dabef-b7c9-4590-b4f7-a6344744c5dc', 'ENV028'),
  residue('e7992ddf-5ae4-420d-8e2f-53516b750361', 'ENV040'),
  residue('d92892ba-8f00-4a1b-bda8-307512eef7d1', 'ENV051'),
  residue('3384d2e7-00c5-4e9b-8030-402a38fe6a9d', 'ENV062'),
  { id: '337c593b-40f2-4f99-bae5-1182f5bda741', codigo: null, nombreCompleto: 'VITAMINA A', estado: 'INACTIVO', origen: 'MANUAL', categoria: 'droga', kind: 'inactive-test' },
  { id: '63f1eb4a-d2d6-4678-b6cb-c9edc1f8a15a', codigo: 'ENV0010', nombreCompleto: 'MARRON', estado: 'INACTIVO', origen: 'MANUAL', categoria: 'frasco', kind: 'inactive-test' },
  { id: 'be177f76-bf07-4d15-9e79-f510169ccc38', codigo: 'IGET00245', estado: 'ACTIVO', origen: 'MANUAL', categoria: 'etiqueta', kind: 'manual-duplicate', allowedZeroInventory: 'etiqueta' },
  { id: '91c553ca-5262-42c3-ad82-bee0d835dc7f', codigo: null, nombreCompleto: 'DORADO', estado: 'ACTIVO', origen: 'MANUAL', categoria: 'frasco', kind: 'manual-duplicate' },
  { id: '124678e0-25ec-4ba0-94d5-da4b0db28433', codigo: 'IGES0012', estado: 'ACTIVO', origen: 'MANUAL', categoria: 'estuche', kind: 'manual-duplicate', allowedZeroInventory: 'estuche' },
  { id: 'c6d10fab-2196-4f17-a65e-1806374ecad4', codigo: 'IGES0056', estado: 'ACTIVO', origen: 'MANUAL', categoria: 'estuche', kind: 'manual-duplicate', allowedZeroInventory: 'estuche' },
] as const

export interface CleanupCandidateSnapshot {
  id: string
  codigo: string | null
  nombreCompleto: string
  presentacion: number | null
  categoria: string
  estado: string | null
  origen: string
  inventarioDroga: Array<{ id: string; cantidad: number }>
  inventarioEstuche: Array<{ id: string; cantidad: number }>
  inventarioEtiqueta: Array<{ id: string; cantidad: number }>
  inventarioFrasco: Array<{ id: string; cantidadCajas: number; total: number }>
  movimientos: number
  actaItems: number
  ordenes: number
  importaciones: number
}

type CanonicalIdentity = Pick<CleanupCandidateSnapshot, 'codigo' | 'nombreCompleto' | 'presentacion' | 'categoria'>

function normalizedIdentity(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/^FRASCOS?\s+/, '').replace(/\bX\b/g, ' ').replace(/TRANSPARENTE$/g, '')
    .replace(/(\d)(ML|GR|L)\b/g, '$1 $2').replace(/\s+/g, ' ').trim()
}

function semanticPresentation(item: Pick<CleanupCandidateSnapshot, 'presentacion' | 'nombreCompleto'>): number | null {
  if (item.presentacion !== null) return item.presentacion
  const match = normalizedIdentity(item.nombreCompleto).match(/(\d+)\s*(?:ML|GR|L)\b/)
  return match ? Number(match[1]) : null
}

export function classifyCleanupCandidate(entry: CleanupManifestEntry, candidate: CleanupCandidateSnapshot, canonical?: CanonicalIdentity) {
  const reasons: string[] = []
  if (/^ENV(?:06[3-9]|07\d|08[0-3])$/.test(candidate.codigo ?? '')) reasons.push('protected canonical code')
  if (candidate.id !== entry.id || candidate.codigo !== entry.codigo || candidate.estado !== entry.estado || candidate.origen !== entry.origen || candidate.categoria !== entry.categoria) reasons.push('manifest evidence drift')
  if (entry.nombreCompleto && normalizedIdentity(candidate.nombreCompleto) !== normalizedIdentity(entry.nombreCompleto)) reasons.push('manifest identity drift')
  if (entry.canonicalCode) {
    if (!canonical || canonical.codigo !== entry.canonicalCode || canonical.categoria !== candidate.categoria || semanticPresentation(canonical) !== semanticPresentation(candidate) || normalizedIdentity(canonical.nombreCompleto) !== normalizedIdentity(candidate.nombreCompleto)) reasons.push(`semantic identity differs from ${entry.canonicalCode}`)
  }
  if (candidate.movimientos + candidate.actaItems + candidate.ordenes + candidate.importaciones > 0) reasons.push('operational relations found')
  if (candidate.inventarioDroga.length > 0 || candidate.inventarioFrasco.length > 0) reasons.push('undeclared inventory relation')
  const inventories = entry.allowedZeroInventory === 'etiqueta' ? candidate.inventarioEtiqueta : entry.allowedZeroInventory === 'estuche' ? candidate.inventarioEstuche : []
  if (!entry.allowedZeroInventory && candidate.inventarioEstuche.length + candidate.inventarioEtiqueta.length > 0) reasons.push('undeclared inventory relation')
  if (inventories.some((inventory) => inventory.cantidad !== 0)) reasons.push('inventory is not zero')
  return reasons.length > 0 ? { safe: false as const, reasons } : { safe: true as const, inventoryIds: inventories.map((inventory) => inventory.id) }
}

export interface CatalogCleanupResult {
  before: number
  deleted: Array<{ id: string; codigo: string | null; kind: CandidateKind; canonicalCode?: string; auditoriasEliminadas: number }>
  missing: string[]
  skipped: Array<{ id: string; codigo: string | null; reasons: string[] }>
  final: number
  auditoriasEliminadas: number
  replay: boolean
}

export class CatalogoSaneamientoService {
  private readonly manifest: readonly CleanupManifestEntry[]
  private readonly protectedCodes: readonly string[]

  constructor(private readonly db: PrismaClient, options: { manifest?: readonly CleanupManifestEntry[]; protectedCodes?: readonly string[] } = {}) {
    this.manifest = options.manifest ?? CATALOG_CLEANUP_MANIFEST
    this.protectedCodes = options.protectedCodes ?? Array.from({ length: 21 }, (_, index) => `ENV${String(index + 63).padStart(3, '0')}`)
  }

  async run(): Promise<CatalogCleanupResult> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('deposito.catalogo.final-cleanup'))`
      const before = await tx.depositoProducto.count()
      const ids = this.manifest.map((entry) => entry.id).sort()
      const protectedCodes = [...this.protectedCodes].sort()
      await tx.$queryRaw`SELECT id FROM deposito.productos WHERE id = ANY(${ids}::text[]) OR codigo = ANY(${protectedCodes}::text[]) ORDER BY id FOR UPDATE`
      const preOperational = await operationalSnapshot(tx)

      const candidates = await tx.depositoProducto.findMany({
        where: { id: { in: ids } },
        include: {
          inventarioDrogas: { select: { id: true, cantidad: true } },
          inventarioEstuches: { select: { id: true, cantidad: true } },
          inventarioEtiquetas: { select: { id: true, cantidad: true } },
          inventarioFrascos: { select: { id: true, cantidadCajas: true, total: true } },
          _count: { select: { movimientos: true, actaItems: true, ordenes: true, importacionesInicialesEstuche: true, auditoriasCatalogo: true } },
        },
      })
      const canonicalCodes = [...new Set(this.manifest.flatMap((entry) => entry.canonicalCode ? [entry.canonicalCode] : []))]
      const canonical = await tx.depositoProducto.findMany({ where: { codigo: { in: canonicalCodes } } })
      const protectedCanonical = await tx.depositoProducto.findMany({ where: { codigo: { in: protectedCodes } }, select: { id: true, codigo: true }, orderBy: { codigo: 'asc' } })
      if (protectedCanonical.length !== protectedCodes.length || protectedCanonical.some((item, index) => item.codigo !== protectedCodes[index])) throw new Error('Canonical ENV063-ENV083 set is incomplete or changed')
      const canonicalByCode = new Map(canonical.map((item) => [item.codigo!, item]))
      const byId = new Map(candidates.map((item) => [item.id, item]))
      const deleted: CatalogCleanupResult['deleted'] = []
      const missing: string[] = []
      const skipped: CatalogCleanupResult['skipped'] = []

      const approved: Array<{ entry: CleanupManifestEntry; auditorias: number }> = []
      for (const entry of this.manifest) {
        const candidate = byId.get(entry.id)
        if (!candidate) { missing.push(entry.id); continue }
        const decision = classifyCleanupCandidate(entry, {
          id: candidate.id, codigo: candidate.codigo, nombreCompleto: candidate.nombreCompleto,
          presentacion: candidate.presentacion, categoria: candidate.categoria, estado: candidate.estado, origen: candidate.origen,
          inventarioDroga: candidate.inventarioDrogas.map((item) => ({ id: item.id, cantidad: item.cantidad })),
          inventarioEstuche: candidate.inventarioEstuches.map((item) => ({ id: item.id, cantidad: item.cantidad })),
          inventarioEtiqueta: candidate.inventarioEtiquetas.map((item) => ({ id: item.id, cantidad: item.cantidad })),
          inventarioFrasco: candidate.inventarioFrascos.map((item) => ({ id: item.id, cantidadCajas: item.cantidadCajas, total: item.total })),
          movimientos: candidate._count.movimientos, actaItems: candidate._count.actaItems, ordenes: candidate._count.ordenes,
          importaciones: candidate._count.importacionesInicialesEstuche,
        }, entry.canonicalCode ? canonicalByCode.get(entry.canonicalCode) : undefined)
        if (!decision.safe) { skipped.push({ id: entry.id, codigo: entry.codigo, reasons: decision.reasons }); continue }
        approved.push({ entry, auditorias: candidate._count.auditoriasCatalogo })
      }
      const replay = missing.length === this.manifest.length && skipped.length === 0
      if (!replay && (missing.length > 0 || skipped.length > 0)) throw new Error(`Cleanup preflight drift: missing=${missing.length}, skipped=${skipped.length}`)
      for (const { entry, auditorias } of approved) {
        await deleteCleanupCandidate(tx, entry)
        deleted.push({ id: entry.id, codigo: entry.codigo, kind: entry.kind, auditoriasEliminadas: auditorias, ...(entry.canonicalCode ? { canonicalCode: entry.canonicalCode } : {}) })
      }
      const final = await tx.depositoProducto.count()
      const postOperational = await operationalSnapshot(tx)
      if (JSON.stringify(preOperational) !== JSON.stringify(postOperational)) throw new Error('Operational stock, movements, or Actas changed during cleanup')
      const postCanonical = await tx.depositoProducto.findMany({ where: { codigo: { in: protectedCodes } }, select: { id: true, codigo: true }, orderBy: { codigo: 'asc' } })
      if (JSON.stringify(protectedCanonical) !== JSON.stringify(postCanonical)) throw new Error('Canonical codes changed during cleanup')
      if (await orphanInventoryCount(tx) !== 0) throw new Error('Orphan inventory detected after cleanup')
      return { before, deleted, missing, skipped, final, auditoriasEliminadas: deleted.reduce((sum, item) => sum + item.auditoriasEliminadas, 0), replay }
    }, { isolationLevel: 'Serializable' })
  }
}

async function operationalSnapshot(tx: Prisma.TransactionClient) {
  const [movimientos, actas, drogas, estuches, etiquetas, frascos] = await Promise.all([
    tx.movimiento.count(), tx.acta.count(),
    tx.inventarioDroga.aggregate({ _sum: { cantidad: true } }),
    tx.inventarioEstuche.aggregate({ _sum: { cantidad: true } }),
    tx.inventarioEtiqueta.aggregate({ _sum: { cantidad: true } }),
    tx.inventarioFrasco.aggregate({ _sum: { cantidadCajas: true, total: true } }),
  ])
  return { movimientos, actas, droga: drogas._sum.cantidad ?? 0, estuche: estuches._sum.cantidad ?? 0, etiqueta: etiquetas._sum.cantidad ?? 0, frascoCajas: frascos._sum.cantidadCajas ?? 0, frascoTotal: frascos._sum.total ?? 0 }
}

async function orphanInventoryCount(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT (
      (SELECT count(*) FROM deposito.inventario_drogas i LEFT JOIN deposito.productos p ON p.id=i.producto_id WHERE i.producto_id IS NOT NULL AND p.id IS NULL) +
      (SELECT count(*) FROM deposito.inventario_estuches i LEFT JOIN deposito.productos p ON p.id=i.producto_id WHERE i.producto_id IS NOT NULL AND p.id IS NULL) +
      (SELECT count(*) FROM deposito.inventario_etiquetas i LEFT JOIN deposito.productos p ON p.id=i.producto_id WHERE i.producto_id IS NOT NULL AND p.id IS NULL) +
      (SELECT count(*) FROM deposito.inventario_frascos i LEFT JOIN deposito.productos p ON p.id=i.producto_id WHERE i.producto_id IS NOT NULL AND p.id IS NULL)
    )::int AS count`
  return rows[0]?.count ?? 0
}

async function deleteCleanupCandidate(tx: Prisma.TransactionClient, entry: CleanupManifestEntry): Promise<void> {
  if (entry.allowedZeroInventory === 'etiqueta') await tx.inventarioEtiqueta.deleteMany({ where: { productoId: entry.id, cantidad: 0 } })
  if (entry.allowedZeroInventory === 'estuche') await tx.inventarioEstuche.deleteMany({ where: { productoId: entry.id, cantidad: 0 } })
  await tx.auditoriaCatalogoProducto.deleteMany({ where: { productoId: entry.id } })
  await tx.depositoProducto.delete({ where: { id: entry.id } })
}
