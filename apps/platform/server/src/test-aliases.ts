import { platformDb as prisma } from '@platform/db'

async function main() {
  console.log('Client Aliases:', await prisma.clientAlias.findMany())
  console.log('Product Aliases:', await prisma.productAlias.findMany())
}

main().finally(() => prisma.$disconnect())
