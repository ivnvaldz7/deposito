import { platformDb as prisma, Prisma } from '@platform/db'
import { LOGISTICA_INITIAL_ROWS, buildTechnicalSku, summarizeLogisticaRows, unitsToBoxesAndLoose } from './logistica-initial-load-data'

export { LOGISTICA_INITIAL_ROWS, buildTechnicalSku, summarizeLogisticaRows, unitsToBoxesAndLoose } from './logistica-initial-load-data'

/* Dataset is isolated in logistica-initial-load-data.ts so its contract is testable without a database. */
/*
AMANTINA 250 ML|AM0141|15|99
AMANTINA 500 ML|AM0140|20|20
AMANTINA 500 ML|AM0141|20|1408
AMANTINA PREMIUM 100 ML|AP0060|30|0
AMANTINA PREMIUM 250 ML|AP0034|24|0
AMANTINA PREMIUM 500 ML|AP0082|20|1375
AMINOÁCIDOS 20 ML|AO0248|15|0
AMINOÁCIDOS 50 ML AVES|AO0294|40|41
AMINOÁCIDOS 50 ML MASCOTA|AO0294|40|114
AMINOÁCIDOS 1 L|AO0295|12|262
AMINOÁCIDOS 1 L AVES|AO0282|12|36
AMINOÁCIDOS 5 L|AO0294|4|3
ANTITÉRMICO 1 L|AT0017|12|288
CALCITROVIT 500 ML|CV0018|20|0
CETRI-AMON 1 L|CA0131|12|8
CETRI-AMON 5 L|CA0131|4|0
COMPLEJO B B12 B15 20 ML|CB0092|12|28
COMPLEJO B B12 B15 100 ML|CB0094|24|1375
COMPLEJO B B12 B15 250 ML|CB0093|24|33
COMPLEJO B HIERRO CERDOS 25 ML|HB0025|20|100
COMPLEJO B HIERRO CERDOS 100 ML|HB0030|24|123
COMPLEJO B HIERRO EQUINOS 25 ML|HB0028|20|17
COMPLEJO B HIERRO EQUINOS 100 ML|HB0030|24|947
ENERGIZANTE 25 ML|EN0124|20|29
ENERGIZANTE 100 ML|EN0129|24|0
ENERGIZANTE 100 ML|EN0131|24|1344
ENERGIZANTE 250 ML|EN0131|24|493
ENERGIZANTE 250 ML VACAS|EN0129|24|144
ENERGIZANTE 500 ML|EN0122|20|0
IVERSAN 500 ML|IV0038|20|0
JERINGA ATP 35 GR|EN0116|24|472
OLIVITASAN 25 ML|OL0910|20|135
OLIVITASAN 100 ML|OL0909|40|254
OLIVITASAN 300 ML|OL0917|24|109
OLIVITASAN 500 ML|OL0920|20|820
OLIVITASAN 500 ML|OL0919|20|1000
OLIVITASAN PLUS 50 ML|PL0578|40|46
OLIVITASAN PLUS 250 ML|PL0605|24|384
OLIVITASAN PLUS 500 ML|PL0608|20|800
OLIVITASAN PLUS 500 ML|PL0609|20|1240
SUPERCOMPLEJO B 1 L AVES|SC0014|12|80
SUPERCOMPLEJO B 1 L EQUINOS|SC0014|12|0
TILCOSAN 100 ML|TM0036|24|577
TILCOSAN 250 ML|TM0038|24|2421
VITAMINA B1 100 ML|VB0017|24|121
VITAMINA B12 50 ML|BB005|30|20
VITAMINA B12 100 ML|BB005|24|248
*/

export class LogisticsLoadConflict extends Error {}

export async function preflightInitialLogisticsLoad(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const names = [...new Set(LOGISTICA_INITIAL_ROWS.map((row) => row.product))]
  const existingProducts = await db.producto.findMany({ where: { nombre: { in: names } }, include: { lotes: true } })
  const byName = new Map(existingProducts.map((product) => [product.nombre, product]))
  const conflicts: string[] = []
  let existingLots = 0
  for (const row of LOGISTICA_INITIAL_ROWS) {
    const product = byName.get(row.product)
    if (product && product.unidadesPorCaja !== row.unitsPerBox) conflicts.push(`${row.product}: unidadesPorCaja ${product.unidadesPorCaja} != ${row.unitsPerBox}`)
    const lot = product?.lotes.find((candidate) => candidate.numero === row.lot)
    if (lot) {
      existingLots += 1
      const expected = unitsToBoxesAndLoose(row.total, row.unitsPerBox)
      if (lot.cajas !== expected.boxes || lot.sueltos !== expected.loose || lot.fechaProduccion !== null || lot.fechaVencimiento !== null) {
        conflicts.push(`${row.product}/${row.lot}: lote existente divergente`)
      }
    }
  }
  const summary = summarizeLogisticaRows(LOGISTICA_INITIAL_ROWS)
  return { ...summary, exactMatches: existingProducts.length, newProducts: names.length - existingProducts.length, existingLots, newLots: summary.positiveLots - existingLots, conflicts }
}

export async function applyInitialLogisticsLoad(db: typeof prisma = prisma) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('ale_bet:initial-logistics-load'))`)
    const preflight = await preflightInitialLogisticsLoad(tx)
    if (preflight.conflicts.length) throw new LogisticsLoadConflict(preflight.conflicts.join('; '))
    let productsCreated = 0
    let lotsCreated = 0
    for (const row of LOGISTICA_INITIAL_ROWS) {
      let product = await tx.producto.findFirst({ where: { nombre: row.product } })
      if (!product) {
        product = await tx.producto.create({ data: { nombre: row.product, sku: buildTechnicalSku(row.product), unidadesPorCaja: row.unitsPerBox, stockMinimo: 100, activo: true } })
        productsCreated += 1
      }
      if (row.total === 0) continue
      const existing = await tx.lote.findUnique({ where: { numero_productoId: { numero: row.lot, productoId: product.id } } })
      if (existing) continue
      const value = unitsToBoxesAndLoose(row.total, row.unitsPerBox)
      await tx.lote.create({ data: { productoId: product.id, numero: row.lot, cajas: value.boxes, sueltos: value.loose, fechaProduccion: null, fechaVencimiento: null, activo: true } })
      lotsCreated += 1
    }
    return { productsCreated, lotsCreated, totalStock: 17_014 }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
