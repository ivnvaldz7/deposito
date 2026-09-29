import { platformDb } from '@platform/db'
import { CatalogoProductoService } from '../deposito/services/catalogo-producto-service'

const MATERIALES = [
  'PROSPECTO OLIVITASAN',
  'PROSPECTO OLIVITASAN PLUS',
  'PROSPECTO ENERGIZANTE',
  'PROSPECTO COMPLEJO B B12 B15',
  'PROSPECTO PREMIUM',
  'CAJA N°1',
  'CAJA N°2',
  'CAJA N°3',
  'CAJA N°5',
  'CAJA N°6',
  'CAJA N°8',
  'CAJA N°9',
  'CAJA N°10',
  'CAJA N°11',
  'CAJA N°12',
  'CAJA N°16',
  'TAPA VERDE',
  'TAPA AZUL',
  'TAPA ROJA',
] as const

async function main() {
  const actor = await platformDb.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  if (!actor) throw new Error('No existe un usuario de Depósito para auditar la carga inicial')

  const service = new CatalogoProductoService(platformDb)
  let created = 0
  let existing = 0
  for (const nombre of MATERIALES) {
    const product = await platformDb.depositoProducto.findFirst({
      where: { nombreCompleto: nombre, categoria: 'material_empaque', mercado: null },
      select: { id: true },
    })
    if (product) {
      existing += 1
      await platformDb.inventarioMaterialEmpaque.upsert({
        where: { productoId: product.id },
        create: { productoId: product.id, articulo: nombre, cantidad: 0 },
        update: {},
      })
      continue
    }
    await service.createManual({
      nombreBase: nombre,
      nombreCompleto: nombre,
      categoria: 'material_empaque',
      mercadosHabilitados: [],
      stockMinimo: null,
    }, actor.id)
    created += 1
  }
  console.log(JSON.stringify({ created, existing, total: MATERIALES.length }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await platformDb.$disconnect()
})
