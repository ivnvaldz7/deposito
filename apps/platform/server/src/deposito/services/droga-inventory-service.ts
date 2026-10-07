type DrugLot = {
  id: string
  lote: string | null
  vencimiento: Date | null
  cantidad: number
  createdAt: Date
  stockMinimo?: number | null
}

type CatalogDrug = {
  id: string
  codigo?: string | null
  nombreCompleto: string
  stockMinimo: number | null
  inventarioDrogas: DrugLot[]
}

export function aggregateDrugCatalog(products: CatalogDrug[]) {
  return products.map((product) => {
    const lotes = [...product.inventarioDrogas].sort((left, right) => {
      const leftExpiry = left.vencimiento?.getTime() ?? Number.POSITIVE_INFINITY
      const rightExpiry = right.vencimiento?.getTime() ?? Number.POSITIVE_INFINITY
      return leftExpiry - rightExpiry || left.id.localeCompare(right.id)
    })
    const positiveExpiries = lotes
      .filter((lot) => lot.cantidad > 0 && lot.vencimiento !== null)
      .map((lot) => lot.vencimiento as Date)

    return {
      productoId: product.id,
      ...(product.codigo ? { codigo: product.codigo } : {}),
      nombre: product.nombreCompleto,
      stockMinimo: product.stockMinimo ?? null,
      cantidadTotal: lotes.reduce((total, lot) => total + lot.cantidad, 0),
      proximoVencimiento: positiveExpiries[0] ?? null,
      lotes: lotes.map((lot) => ({ ...lot, stockMinimo: product.stockMinimo ?? null })),
    }
  })
}

export class DrugLotConflictError extends Error {
  readonly statusCode = 409
}

type DrugInventoryTransaction = {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ id: string; vencimiento: Date | null }>>
  inventarioDroga: {
    update: (args: { where: { id: string }; data: { cantidad: { increment: number } } }) => Promise<unknown>
    create: (args: { data: { productoId: string; nombre: string; lote: string; vencimiento: Date; cantidad: number } }) => Promise<unknown>
  }
}

type AddDrugLotInput = {
  productoId: string
  nombre: string
  lote: string
  vencimiento: Date
  cantidad: number
}

export function normalizeDrugLot(lote: string): string {
  return lote.trim().replace(/\s+/g, ' ').toUpperCase()
}

export async function addDrugLotInventory(tx: DrugInventoryTransaction, input: AddDrugLotInput) {
  const lote = normalizeDrugLot(input.lote)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.productoId}:${lote}`}, 0))`
  const rows = await tx.$queryRaw`
    SELECT id, vencimiento
    FROM deposito.inventario_drogas
    WHERE producto_id = ${input.productoId} AND lote = ${lote}
    FOR UPDATE
  `
  const existing = rows[0]
  if (existing) {
    if (existing.vencimiento?.getTime() !== input.vencimiento.getTime()) {
      throw new DrugLotConflictError('El lote ya existe con un vencimiento diferente')
    }
    return tx.inventarioDroga.update({
      where: { id: existing.id },
      data: { cantidad: { increment: input.cantidad } },
    })
  }

  return tx.inventarioDroga.create({ data: { ...input, lote } })
}
