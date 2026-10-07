import { platformDb as prisma } from '@platform/db'
import { interpretOrder } from './routes/ale-bet/automation/interpreter'
import type { MatchProduct, MatchCustomer } from './routes/ale-bet/automation/contracts'

async function main() {
  const texts = [
    `ZENON\n200 olivitasan 500`,
    `TRT CHACO\n12 cetri 1lt`,
    `DISTRIBUIDORA TAURO\n40 plus 500ml`
  ]

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
  
  for (const text of texts) {
    const proposal = interpretOrder(text, mappedProducts, mappedCustomers)
    console.log(`---\nOriginal:\n${text}\nCliente interpretado: ${proposal.customerCandidate ? proposal.customerCandidate.nombre : 'No resuelto (Candidate Text: ' + proposal.customerCandidateText + ')'}`)
  }
}

main().finally(() => prisma.$disconnect())
