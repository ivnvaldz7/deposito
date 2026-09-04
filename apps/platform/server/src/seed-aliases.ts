import { platformDb as prisma } from '@platform/db'
import { normalizeForMatch } from './routes/ale-bet/automation/interpreter'

async function main() {
  const [plus, cetri, b12, b12_250, federal] = await Promise.all([
    prisma.producto.findFirst({ where: { sku: 'P500' } }),
    prisma.producto.findFirst({ where: { sku: 'CETRI' } }),
    prisma.producto.findFirst({ where: { sku: 'B12' } }),
    prisma.producto.findFirst({ where: { sku: 'B12-250' } }),
    prisma.cliente.findFirst({ where: { nombre: 'EL FEDERAL' } })
  ])

  if (cetri) {
    await prisma.productAlias.createMany({
      data: ['CETRI', 'CETRI 1LT'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: cetri.id })),
      skipDuplicates: true
    })
  }
  if (b12) {
    await prisma.productAlias.createMany({
      data: ['b12b15 100', 'b12b15 100ml'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: b12.id })),
      skipDuplicates: true
    })
  }
  if (b12_250) {
    await prisma.productAlias.createMany({
      data: ['b12b25 250ml'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), productId: b12_250.id })),
      skipDuplicates: true
    })
  }
  if (federal) {
    await prisma.clientAlias.createMany({
      data: ['FEDERAL', 'FEDERAL 3'].map(a => ({ alias: a, aliasNormalized: normalizeForMatch(a), clientId: federal.id })),
      skipDuplicates: true
    })
  }
  console.log('Aliases seeded successfully!')
}

main().catch(console.error).finally(() => prisma.$disconnect())
