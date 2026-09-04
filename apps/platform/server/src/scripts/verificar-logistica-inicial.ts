import 'dotenv/config'
import { platformDb as prisma } from '@platform/db'
import { calcularUnidades } from '../routes/ale-bet/constants'

async function main() {
  const products = await prisma.producto.findMany({ where: { sku: { startsWith: 'LOG-' } }, include: { lotes: true } })
  const total = products.reduce((sum, product) => sum + product.lotes.reduce((inner, lot) => inner + calcularUnidades(lot.cajas, lot.sueltos, product.unidadesPorCaja), 0), 0)
  const movements = await prisma.movimientoStock.count({ where: { productoId: { in: products.map((product) => product.id) } } })
  const nullDates = products.flatMap((product) => product.lotes).filter((lot) => lot.fechaProduccion === null && lot.fechaVencimiento === null).length
  console.log(JSON.stringify({ products: products.length, lots: products.flatMap((product) => product.lotes).length, total, movements, nullDates }, null, 2))
}

main().finally(() => prisma.$disconnect())
