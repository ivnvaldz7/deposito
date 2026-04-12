import { PrismaClient, Categoria } from '@prisma/client'
import { buildProductoLookupKey } from '../src/lib/producto-catalogo'

const prisma = new PrismaClient()

type UnmatchedEntry = {
  table: string
  id: string
  categoria: Categoria
  nombre: string
}

async function main() {
  const productos = await prisma.producto.findMany({
    select: { id: true, categoria: true, nombreCompleto: true },
  })

  const productoLookup = new Map<string, string>()
  for (const producto of productos) {
    productoLookup.set(buildProductoLookupKey(producto.categoria, producto.nombreCompleto), producto.id)
  }

  const unmatched: UnmatchedEntry[] = []
  const stats = {
    inventarioDrogas: 0,
    inventarioEstuches: 0,
    inventarioEtiquetas: 0,
    inventarioFrascos: 0,
    actaItems: 0,
    ordenes: 0,
  }

  const inventarioDrogas = await prisma.inventarioDroga.findMany({
    where: { productoId: null },
    select: { id: true, nombre: true },
  })
  for (const row of inventarioDrogas) {
    const productoId = productoLookup.get(buildProductoLookupKey('droga', row.nombre))
    if (!productoId) {
      unmatched.push({ table: 'inventario_drogas', id: row.id, categoria: 'droga', nombre: row.nombre })
      continue
    }
    await prisma.inventarioDroga.update({ where: { id: row.id }, data: { productoId } })
    stats.inventarioDrogas += 1
  }

  const inventarioEstuches = await prisma.inventarioEstuche.findMany({
    where: { productoId: null },
    select: { id: true, articulo: true },
  })
  for (const row of inventarioEstuches) {
    const productoId = productoLookup.get(buildProductoLookupKey('estuche', row.articulo))
    if (!productoId) {
      unmatched.push({ table: 'inventario_estuches', id: row.id, categoria: 'estuche', nombre: row.articulo })
      continue
    }
    await prisma.inventarioEstuche.update({ where: { id: row.id }, data: { productoId } })
    stats.inventarioEstuches += 1
  }

  const inventarioEtiquetas = await prisma.inventarioEtiqueta.findMany({
    where: { productoId: null },
    select: { id: true, articulo: true },
  })
  for (const row of inventarioEtiquetas) {
    const productoId = productoLookup.get(buildProductoLookupKey('etiqueta', row.articulo))
    if (!productoId) {
      unmatched.push({ table: 'inventario_etiquetas', id: row.id, categoria: 'etiqueta', nombre: row.articulo })
      continue
    }
    await prisma.inventarioEtiqueta.update({ where: { id: row.id }, data: { productoId } })
    stats.inventarioEtiquetas += 1
  }

  const inventarioFrascos = await prisma.inventarioFrasco.findMany({
    where: { productoId: null },
    select: { id: true, articulo: true },
  })
  for (const row of inventarioFrascos) {
    const productoId = productoLookup.get(buildProductoLookupKey('frasco', row.articulo))
    if (!productoId) {
      unmatched.push({ table: 'inventario_frascos', id: row.id, categoria: 'frasco', nombre: row.articulo })
      continue
    }
    await prisma.inventarioFrasco.update({ where: { id: row.id }, data: { productoId } })
    stats.inventarioFrascos += 1
  }

  const actaItems = await prisma.actaItem.findMany({
    where: { productoId: null },
    select: { id: true, categoria: true, productoNombre: true },
  })
  for (const row of actaItems) {
    const productoId = productoLookup.get(buildProductoLookupKey(row.categoria, row.productoNombre))
    if (!productoId) {
      unmatched.push({ table: 'acta_items', id: row.id, categoria: row.categoria, nombre: row.productoNombre })
      continue
    }
    await prisma.actaItem.update({ where: { id: row.id }, data: { productoId } })
    stats.actaItems += 1
  }

  const ordenes = await prisma.ordenProduccion.findMany({
    where: { productoId: null },
    select: { id: true, categoria: true, productoNombre: true },
  })
  for (const row of ordenes) {
    const productoId = productoLookup.get(buildProductoLookupKey(row.categoria, row.productoNombre))
    if (!productoId) {
      unmatched.push({ table: 'ordenes_produccion', id: row.id, categoria: row.categoria, nombre: row.productoNombre })
      continue
    }
    await prisma.ordenProduccion.update({ where: { id: row.id }, data: { productoId } })
    stats.ordenes += 1
  }

  console.log('Backfill productoId completado')
  console.log(JSON.stringify({ stats, unmatched }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
