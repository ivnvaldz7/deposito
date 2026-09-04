import { platformDb as prisma } from '@platform/db'

async function main() {
  const result = await prisma.productAlias.deleteMany({
    where: {
      alias: { in: ['B12B25 250', 'B12B25 250ML'] }
    }
  })
  console.log(`Borrados: ${result.count}`)
}
main().finally(() => prisma.$disconnect())
