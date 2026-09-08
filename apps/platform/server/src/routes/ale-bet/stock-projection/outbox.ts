import type { Prisma } from '@platform/db'

export type StockProjectionOutboxCause =
  | 'MANUAL_ADJUST'
  | 'SALDO_APERTURA'
  | 'TRANSFER'
  | 'CONSUMO_PEDIDO'

export async function markStockProjectionDirty(
  tx: Prisma.TransactionClient,
  input: { productId: string; causeType: StockProjectionOutboxCause; causeId: string },
): Promise<void> {
  await tx.stockProjectionOutbox.upsert({
    where: {
      productId_causeType_causeId: {
        productId: input.productId,
        causeType: input.causeType,
        causeId: input.causeId,
      },
    },
    create: {
      productId: input.productId,
      causeType: input.causeType,
      causeId: input.causeId,
      estado: 'PENDING',
    },
    update: {
      estado: 'PENDING',
    },
  })
}
