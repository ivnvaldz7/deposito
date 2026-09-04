import { platformDb as prisma } from '@platform/db'
import { interpretOrder } from './routes/ale-bet/automation/interpreter'
import type { MatchProduct, MatchCustomer } from './routes/ale-bet/automation/contracts'

async function main() {
  const originalText = `FEDERAL 3
400 plus 500ml
504 b12b15 100ml
240 b12b25 250ml
12 cetri 1lt`

  const [products, customers, productAliases, clientAliases] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true, sku: true, unidadesPorCaja: true } }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    prisma.productAlias.findMany(),
    prisma.clientAlias.findMany()
  ])
  
  const mappedProducts: MatchProduct[] = products.map(p => ({
    ...p,
    aliases: productAliases.filter(a => a.productId === p.id).map(a => a.alias)
  }))
  const mappedCustomers: MatchCustomer[] = customers.map(c => ({
    ...c,
    aliases: clientAliases.filter(a => a.clientId === c.id).map(a => a.alias)
  }))
  
  const proposal = interpretOrder(originalText, mappedProducts, mappedCustomers)
  
  console.log('Customer Candidate:', proposal.customerCandidate ? proposal.customerCandidate.nombre : 'None')
  console.log('Customer Text:', proposal.customerCandidateText)
  
  for (const line of proposal.lines) {
    console.log(`Line: ${line.originalText}`)
    console.log(`  Units: ${line.quantity.totalUnits ?? line.quantity.explicitUnits}`)
    console.log(`  Product: ${line.productCandidate ? line.productCandidate.nombre : 'None'}`)
    if (line.alternatives.length > 0) {
      console.log(`  Alternatives: ${line.alternatives.map(a => a.nombre).join(', ')}`)
    }
  }
}

main().finally(() => prisma.$disconnect())
