import { platformDb } from '@platform/db'
import { CatalogoInicialDrogasService } from '../deposito/services/catalogo-inicial-drogas-service'

async function main() {
  const before = {
    lots: await platformDb.inventarioDroga.count(),
    movements: await platformDb.movimiento.count(),
    acts: await platformDb.acta.count(),
  }
  const service = new CatalogoInicialDrogasService(platformDb)
  const first = await service.apply()
  const replay = await service.apply()
  const after = {
    lots: await platformDb.inventarioDroga.count(),
    movements: await platformDb.movimiento.count(),
    acts: await platformDb.acta.count(),
  }
  if (before.lots !== after.lots || before.movements !== after.movements || before.acts !== after.acts) {
    throw new Error('Drug catalog load changed operational records')
  }
  process.stdout.write(`${JSON.stringify({ first, replay, before, after }, null, 2)}\n`)
}

main().finally(() => platformDb.$disconnect())
