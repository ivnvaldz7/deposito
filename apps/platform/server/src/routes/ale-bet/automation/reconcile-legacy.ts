import { Prisma } from '@platform/db'
import { consumeActiveReservations } from '../reservas-service'
import { z } from 'zod'

const confirmedSnapshot = z.object({ customerCandidate: z.object({ customerId: z.string() }), lines: z.array(z.object({
  productCandidate: z.object({ productId: z.string() }),
  quantity: z.object({ totalUnits: z.number().int().positive() }),
})) })

// Explicit maintenance only: never run during a read, startup, or confirmation.
export async function reconcileLegacyAutomationOrder(tx: Prisma.TransactionClient, pedidoId: string, actorId: string) {
  await tx.$queryRaw`SELECT id FROM "ale_bet"."OrderInterpretationDraft" WHERE "pedidoId" = ${pedidoId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "ale_bet"."Pedido" WHERE id = ${pedidoId} FOR UPDATE`
  const pedido = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true, reservas: true, interpretationDraft: true, auditorias: true, remitos: true } })
  const repaired = pedido.auditorias.some((entry) => entry.accion === 'AUTOMATION_LEGACY_STOCK_RECONCILIADO')
  if (repaired && pedido.origen === 'AUTOMATION') return { pedidoId, repaired: false }
  const draft = pedido.interpretationDraft
  if (pedido.origen !== 'MANUAL' || !['APROBADO', 'EN_ARMADO', 'PREPARADO'].includes(pedido.estado)
    || !draft || draft.estado !== 'CONFIRMED' || !draft.confirmedBy
    || !pedido.auditorias.some((entry) => entry.accion === 'BORRADOR_CREADO_AUTOMATION')
    || !pedido.auditorias.some((entry) => entry.accion === 'PEDIDO_APROBADO_AUTOMATION')) {
    throw new Error(`Procedencia Automation no demostrada o estado incompatible: ${pedidoId}`)
  }
  if (pedido.remitos.length || pedido.cancelacionSolicitadaAt
    || await tx.movimientoStock.count({ where: { pedidoId, tipo: 'SALIDA_PEDIDO' } })) {
    throw new Error(`Pedido con documentos, cancelación o salidas previas: ${pedidoId}`)
  }
  const snapshot = confirmedSnapshot.parse(draft.editedSnapshot ?? draft.proposedSnapshot)
  if (snapshot.customerCandidate.customerId !== pedido.clienteId) throw new Error(`Cliente distinto al draft confirmado: ${pedidoId}`)
  const quantities = new Map<string, number>()
  for (const line of snapshot.lines) quantities.set(line.productCandidate.productId, (quantities.get(line.productCandidate.productId) ?? 0) + line.quantity.totalUnits)
  const itemQuantities = new Map<string, number>()
  for (const item of pedido.items) itemQuantities.set(item.productoId, (itemQuantities.get(item.productoId) ?? 0) + item.cantidad)
  if (quantities.size !== itemQuantities.size || [...quantities].some(([id, count]) => itemQuantities.get(id) !== count)) throw new Error(`Items distintos al draft confirmado: ${pedidoId}`)
  if (!pedido.items.length || pedido.reservas.some((reserva) => reserva.estado !== 'ACTIVA' || !pedido.items.some((item) => item.id === reserva.itemPedidoId))) {
    throw new Error(`Reservas incompatibles: ${pedidoId}`)
  }
  for (const item of pedido.items) {
    const quantity = pedido.reservas.filter((reserva) => reserva.itemPedidoId === item.id).reduce((sum, reserva) => sum + reserva.cantidad, 0)
    if (quantity !== item.cantidad) throw new Error(`Reserva incompleta: ${item.id}`)
    const lotIds = pedido.reservas.filter((reserva) => reserva.itemPedidoId === item.id).map((reserva) => reserva.loteId)
    if (await tx.lote.count({ where: { id: { in: lotIds }, productoId: { not: item.productoId } } })) throw new Error(`Reserva de otro producto: ${item.id}`)
  }
  await consumeActiveReservations(tx, pedidoId, actorId, { skipOutbox: true })
  await tx.pedido.update({ where: { id: pedidoId }, data: { origen: 'AUTOMATION', estado: 'APROBADO', vendedorId: null, armadorId: null, preparadoAt: null, version: { increment: 1 } } })
  await tx.pedidoAuditoria.create({ data: {
    pedidoId, actorId, accion: 'AUTOMATION_LEGACY_STOCK_RECONCILIADO',
    motivo: 'Reconciliación explícita de pedidos UAT confirmados por Automation antes del consumo físico',
    anterior: { origen: pedido.origen, estado: pedido.estado, vendedorId: pedido.vendedorId, armadorId: pedido.armadorId, preparadoAt: pedido.preparadoAt?.toISOString() ?? null, reservas: pedido.reservas.map((reserva) => ({ id: reserva.id, cantidad: reserva.cantidad, estado: reserva.estado })) },
    nuevo: { origen: 'AUTOMATION', estado: 'APROBADO', draftId: draft.id, reservas: 'CONSUMIDA' },
  } })
  await tx.stockProjectionOutbox.createMany({ data: [...new Set(pedido.items.map((item) => item.productoId))].map((productId) => ({ productId, causeType: 'AUTOMATION_LEGACY_RECONCILIADO', causeId: pedidoId, estado: 'PENDING' as const })), skipDuplicates: true })
  return { pedidoId, repaired: true }
}
