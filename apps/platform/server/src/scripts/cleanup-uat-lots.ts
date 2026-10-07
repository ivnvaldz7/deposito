import { platformDb } from '@platform/db';

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');

  console.log(`Starting UAT lot cleanup in ${isExecute ? 'EXECUTE' : 'DRY-RUN'} mode...`);

  const lots = await platformDb.lote.findMany({
    include: {
      producto: true,
      saldos: true,
      reservas: {
        include: {
          pedido: true
        }
      }
    }
  });

  const candidateLots = lots.filter(lot => {
    const num = lot.numero.toUpperCase();
    return num.includes('UAT') || num.includes('TEST') || num.includes('DEMO') || num.startsWith('LOTE-UAT-');
  });

  console.log(`Found ${candidateLots.length} candidate lots out of ${lots.length} total lots.`);

  let deletedCount = 0;
  let skippedCount = 0;

  for (const lot of candidateLots) {
    console.log(`\nAnalyzing lot: ${lot.numero} (ID: ${lot.id}) - Product: ${lot.producto.nombre}`);

    const saldos = lot.saldos;
    const reservas = lot.reservas;
    const movimientos = await platformDb.movimientoStock.findMany({
      where: { loteId: lot.id }
    });

    const activeReservas = reservas.filter(r => r.estado === 'ACTIVA');
    
    // Find item pedidos that reference this lot through reservas
    const itemPedidos = await platformDb.itemPedido.findMany({
      where: {
        productoId: lot.productoId,
        reservas: {
          some: {
            loteId: lot.id
          }
        },
        pedido: {
          estado: {
            not: 'CANCELADO'
          }
        }
      },
      include: {
        pedido: true
      }
    });

    // Find remitos that reference this lot through pedidos/reservas
    const remitos = await platformDb.remito.findMany({
      where: {
        pedido: {
          reservas: {
            some: {
              loteId: lot.id
            }
          }
        }
      }
    });

    const totalSaldoQty = saldos.reduce((acc, s) => acc + s.cantidad, 0);

    console.log(`  Saldos: ${saldos.length} (total qty: ${totalSaldoQty})`);
    console.log(`  Reservas: ${reservas.length} (${activeReservas.length} active)`);
    console.log(`  Movimientos: ${movimientos.length}`);
    console.log(`  ItemPedidos (non-CANCELADO) referencing lot: ${itemPedidos.length}`);
    console.log(`  Remitos referencing lot: ${remitos.length}`);

    const hasRealPedidos = itemPedidos.length > 0;
    const hasRemitos = remitos.length > 0;

    if (hasRealPedidos || hasRemitos) {
      console.log(`  [SKIPPED] Lot has non-cancelled pedidos or remitos associated.`);
      skippedCount++;
      continue;
    }

    console.log(`  [OK] Lot is safe to delete.`);

    if (isExecute) {
      console.log(`  Executing deletion...`);
      try {
        await platformDb.$transaction(async (tx) => {
          if (reservas.length > 0) {
            await tx.reservaStock.deleteMany({
              where: { loteId: lot.id }
            });
            console.log(`    Deleted ${reservas.length} reservas.`);
          }

          if (movimientos.length > 0) {
            await tx.movimientoStock.deleteMany({
              where: { loteId: lot.id }
            });
            console.log(`    Deleted ${movimientos.length} movimientos.`);
          }

          if (saldos.length > 0) {
            await tx.saldoStock.deleteMany({
              where: { loteId: lot.id }
            });
            console.log(`    Deleted ${saldos.length} saldos.`);
          }

          await tx.lote.delete({
            where: { id: lot.id }
          });
          console.log(`    Deleted lot ${lot.numero}.`);
        });
        deletedCount++;
      } catch (error) {
        console.error(`  [ERROR] Failed to delete lot ${lot.numero}:`, error);
        skippedCount++;
      }
    } else {
      console.log(`  [DRY-RUN] Would delete ${reservas.length} reservas, ${movimientos.length} movimientos, ${saldos.length} saldos, and lot ${lot.numero}.`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Candidate lots found: ${candidateLots.length}`);
  console.log(`  Lots deleted: ${deletedCount}`);
  console.log(`  Lots skipped: ${skippedCount}`);
  console.log(`  Canonical lots untouched: ${lots.length - candidateLots.length}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await platformDb.$disconnect();
  });
