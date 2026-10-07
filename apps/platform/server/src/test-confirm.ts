import { platformDb as prisma } from '@platform/db'
import { interpretOrder } from './routes/ale-bet/automation/interpreter'
import { confirmDraftInTransaction, applyDraftEdit } from './routes/ale-bet/automation/automation-service'

async function main() {
  const products = await prisma.producto.findMany({ where: { activo: true } })
  const customers = await prisma.cliente.findMany({ where: { activo: true } })
  const mappedProducts = products.map(p => ({...p, aliases: []}))
  const mappedCustomers = customers.map(c => ({...c, aliases: []}))
  
  const text = 'ZENON\n12 cetri 1lt'
  const parsed = interpretOrder(text, mappedProducts, mappedCustomers)
  
  const draft = await prisma.orderInterpretationDraft.create({
    data: {
      originalText: text,
      proposedSnapshot: parsed as any,
      estado: 'READY',
      createdBy: 'test'
    }
  })
  
  console.log('Draft created, version:', draft.version)
  
  // Fake an edit
  await applyDraftEdit(draft.id, draft.version, {
    clienteId: customers.find(c => c.nombre === 'ZENON')!.id,
    lines: [
      { productId: products.find(p => p.nombre === 'CETRI-AMON 1 L')!.id, cajas: 0, unidades: 12, mode: 'UNITS' }
    ]
  })
  
  const updated = await prisma.orderInterpretationDraft.findUnique({ where: { id: draft.id } })
  console.log('After edit, version:', updated.version)
  
  // Try confirm
  try {
    await prisma.$transaction(async tx => {
      await confirmDraftInTransaction(tx as any, { draftId: draft.id, expectedVersion: updated.version, actorId: 'test' })
    })
    console.log('Confirmed successfully!')
  } catch(e) {
    console.error('Error in confirm:', e)
  }
}

main().finally(() => prisma.$disconnect())
