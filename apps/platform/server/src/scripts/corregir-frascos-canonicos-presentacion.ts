import 'dotenv/config'
import { platformDb } from '@platform/db'
import { CANONICAL_FRASCO_PRESENTATIONS, FrascoCanonicalPresentationService } from '../deposito/services/frasco-canonical-presentation-service'

const codes = CANONICAL_FRASCO_PRESENTATIONS.map(({ codigo }) => codigo)

async function operationalSnapshot() {
  const [products, inventories, movements, actas, estuches, etiquetas] = await Promise.all([
    platformDb.depositoProducto.findMany({
      where: { codigo: { in: codes } }, orderBy: { codigo: 'asc' },
      select: {
        id: true, codigo: true, nombreBase: true, nombreCompleto: true, presentacion: true, unidad: true,
        categoria: true, mercado: true, estado: true, activo: true, mercadosHabilitados: true,
        inventarioFrascos: { select: { id: true, unidadesPorCaja: true, cantidadCajas: true, total: true } },
        _count: { select: { movimientos: true, actaItems: true, ordenes: true } },
      },
    }),
    platformDb.inventarioFrasco.findMany({ where: { producto: { codigo: { in: codes } } }, orderBy: { productoId: 'asc' } }),
    platformDb.movimiento.count(), platformDb.acta.count(), platformDb.inventarioEstuche.count(), platformDb.inventarioEtiqueta.count(),
  ])
  return { products, inventories, counts: { movements, actas, estuches, etiquetas } }
}

function preservedSnapshot(snapshot: Awaited<ReturnType<typeof operationalSnapshot>>) {
  return {
    products: snapshot.products.map(({ nombreBase: _name, presentacion: _presentation, unidad: _unit, ...product }) => product),
    inventories: snapshot.inventories,
    counts: snapshot.counts,
  }
}

async function main() {
  const before = await operationalSnapshot()
  if (before.products.length !== 21 || before.inventories.length !== 21) {
    throw new Error(`Preflight failed: products=${before.products.length}, inventories=${before.inventories.length}`)
  }
  const service = new FrascoCanonicalPresentationService(platformDb)
  const first = await service.apply()
  const after = await operationalSnapshot()
  if (JSON.stringify(preservedSnapshot(before)) !== JSON.stringify(preservedSnapshot(after))) {
    throw new Error('Operational snapshot changed outside nombreBase/presentacion/unidad')
  }
  const replay = await service.apply()
  if (!replay.replay || replay.updated !== 0) throw new Error('Replay was not idempotent')
  console.log(JSON.stringify({ first, replay, beforeCounts: before.counts, afterCounts: after.counts, products: after.products }, null, 2))
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => platformDb.$disconnect())
