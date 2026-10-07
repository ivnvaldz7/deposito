import { platformDb as prisma } from '@platform/db'
import { normalizeForMatch } from './routes/ale-bet/automation/interpreter'

async function main() {
  const [cetri, b15, b25] = await Promise.all([
    prisma.producto.findFirst({ where: { nombre: 'CETRI-AMON 1 L' } }),
    prisma.producto.findFirst({ where: { nombre: 'COMPLEJO B B12 B15 100 ML' } }),
    prisma.producto.findFirst({ where: { nombre: 'COMPLEJO B B12 B15 250 ML' } })
  ])

  if (cetri) {
    await prisma.productAlias.createMany({
      data: ['CETRI', 'CETRI 1LT'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: cetri.id })),
      skipDuplicates: true
    })
  }
  if (b15) {
    await prisma.productAlias.createMany({
      data: ['B12B15 100', 'B12B15 100ML'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: b15.id })),
      skipDuplicates: true
    })
  }
  if (b25) {
    await prisma.productAlias.createMany({
      data: ['B12B25 250', 'B12B25 250ML'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: b25.id })),
      skipDuplicates: true
    })
  }
  
  console.log('Aliases creados.')
}

main().finally(() => prisma.$disconnect())
