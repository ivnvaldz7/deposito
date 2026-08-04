import 'dotenv/config';
import { platformDb as prisma } from '@platform/db';

async function main() {
  console.log('🌱 Seed: Ale-Bet DEMO UAT\n');

  let devUser = await prisma.platformUser.findFirst({
    where: { email: { contains: 'dev' } }
  });

  if (!devUser) {
    devUser = await prisma.platformUser.findFirst();
  }

  if (!devUser) {
    throw new Error('No user found to act as actor.');
  }

  // 1. Clientes
  const clientes = [
    { nombre: 'DEMO Veterinaria Centro', estado: 'VALIDADO', condicionIva: 'Responsable Inscripto', cuit: '30-11111111-1', direccion: 'Calle Falsa 123' },
    { nombre: 'DEMO Agropecuaria Norte', estado: 'VALIDADO', condicionIva: 'Monotributo', cuit: '20-22222222-2', direccion: 'Ruta 9 Km 50' },
    { nombre: 'DEMO Cliente Pendiente', estado: 'PENDIENTE_CLIENTE', contacto: 'Juan Perez', referencia: 'Viene de Instagram' }
  ];

  for (const c of clientes) {
    const existing = await prisma.cliente.findFirst({
      where: { nombre: c.nombre }
    });
    if (!existing) {
      await prisma.cliente.create({
        data: {
          nombre: c.nombre,
          estado: c.estado as any,
          condicionIva: c.condicionIva,
          cuit: c.cuit,
          direccion: c.direccion,
          contacto: c.contacto,
          referencia: c.referencia
        }
      });
    }
  }

  // 2. Transportistas
  const transportistas = [
    { nombre: 'DEMO Transporte Norte', direccion: 'Av. Circunvalación 100' },
    { nombre: 'DEMO Expreso Central', direccion: 'Parque Industrial 5' }
  ];

  for (const t of transportistas) {
    const existing = await prisma.transportista.findFirst({
      where: { nombre: t.nombre, direccion: t.direccion }
    });
    if (!existing) {
      await prisma.transportista.create({ data: t });
    }
  }

  // 3. Productos DEMO
  // 12 products
  // units per box: 4, 12, 15, 20, 24, 30, 40
  const productosData = [
    // 4 products - stock comodo
    { nombre: 'DEMO Amantina A', sku: 'DEMO-AMA-A', ubc: 20, stock: 'comodo' },
    { nombre: 'DEMO Amantina B', sku: 'DEMO-AMA-B', ubc: 12, stock: 'comodo' },
    { nombre: 'DEMO Aminoácidos C', sku: 'DEMO-AMI-C', ubc: 24, stock: 'comodo' },
    { nombre: 'DEMO Olivitasan D', sku: 'DEMO-OLI-D', ubc: 30, stock: 'comodo' },
    // 3 products - stock bajo
    { nombre: 'DEMO Energizante E', sku: 'DEMO-ENE-E', ubc: 4, stock: 'bajo' },
    { nombre: 'DEMO Complejo F', sku: 'DEMO-COM-F', ubc: 40, stock: 'bajo' },
    { nombre: 'DEMO Producto G', sku: 'DEMO-PRO-G', ubc: 15, stock: 'bajo' },
    // 2 products - stock cero
    { nombre: 'DEMO Producto H', sku: 'DEMO-PRO-H', ubc: 20, stock: 'cero' },
    { nombre: 'DEMO Producto I', sku: 'DEMO-PRO-I', ubc: 12, stock: 'cero' },
    // 3 products - mixtos (cajas + sueltos clear)
    { nombre: 'DEMO Producto J', sku: 'DEMO-PRO-J', ubc: 24, stock: 'mixto' },
    { nombre: 'DEMO Producto K', sku: 'DEMO-PRO-K', ubc: 4, stock: 'mixto' },
    { nombre: 'DEMO Producto L', sku: 'DEMO-PRO-L', ubc: 30, stock: 'mixto' }
  ];

  const now = new Date();
  const nextMonth = new Date(now); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const next6Months = new Date(now); next6Months.setMonth(next6Months.getMonth() + 6);
  const nextYear = new Date(now); nextYear.setFullYear(nextYear.getFullYear() + 1);

  for (const p of productosData) {
    let prod = await prisma.producto.findFirst({
      where: { nombre: p.nombre }
    });

    if (prod) {
      if (prod.unidadesPorCaja !== p.ubc) {
        prod = await prisma.producto.update({
          where: { id: prod.id },
          data: { unidadesPorCaja: p.ubc }
        });
      }
    } else {
      prod = await prisma.producto.create({
        data: {
          nombre: p.nombre,
          sku: p.sku,
          unidadesPorCaja: p.ubc,
          stockMinimo: 10
        }
      });
    }

    let lotesParams: any[] = [];

    if (p.stock === 'comodo') {
      lotesParams = [
        { lote: `L-${p.sku}-1`, cajas: 15, sueltos: 0, vencimiento: next6Months },
        { lote: `L-${p.sku}-2`, cajas: 25, sueltos: 0, vencimiento: nextYear }
      ];
    } else if (p.stock === 'bajo') {
      lotesParams = [
        { lote: `L-${p.sku}-1`, cajas: 1, sueltos: Math.min(2, p.ubc - 1), vencimiento: next6Months }
      ];
    } else if (p.stock === 'cero') {
      // Create a lot but with zero units
      lotesParams = [
        { lote: `L-${p.sku}-1`, cajas: 0, sueltos: 0, vencimiento: nextYear }
      ];
    } else if (p.stock === 'mixto') {
      lotesParams = [
        { lote: `L-${p.sku}-1`, cajas: 2, sueltos: p.ubc - 1, vencimiento: nextMonth },
        { lote: `L-${p.sku}-2`, cajas: 4, sueltos: Math.floor(p.ubc / 2), vencimiento: nextYear }
      ];
    }

    for (const lp of lotesParams) {
      const loteNumber = lp.lote;

      const existingLote = await prisma.lote.findFirst({
        where: { numero: loteNumber, productoId: prod.id }
      });

      if (!existingLote) {
        await prisma.$transaction(async (tx) => {
          const l = await tx.lote.create({
            data: {
              numero: loteNumber,
              productoId: prod.id,
              cajas: lp.cajas,
              sueltos: lp.sueltos,
              fechaProduccion: now,
              fechaVencimiento: lp.vencimiento,
              activo: true
            }
          });

          const totalUnits = lp.cajas * p.ubc + lp.sueltos;

          if (totalUnits > 0) {
            await tx.movimientoStock.create({
              data: {
                productoId: prod.id,
                cantidad: totalUnits,
                tipo: 'ENTRADA_MANUAL',
                referencia: `Stock Inicial DEMO - ${loteNumber}`,
                usuarioId: devUser!.id,
                loteId: l.id
              }
            });
          }
        });
      }
    }
  }

  // Verification step
  console.log('\n--- VERIFICACIÓN ---');
  const allDemoProducts = await prisma.producto.findMany({
    where: { sku: { startsWith: 'DEMO-' } },
    include: {
      lotes: {
        include: {
          reservas: true
        }
      }
    }
  });

  console.log('Producto | unidades/caja | lotes | físico | reservado | disponible');
  console.log('-------------------------------------------------------------------------');
  for (const prod of allDemoProducts) {
    let fisico = 0;
    let reservado = 0;
    const lotesCount = prod.lotes.length;
    for (const lote of prod.lotes) {
      fisico += (lote.cajas * prod.unidadesPorCaja) + lote.sueltos;
      const resStock = lote.reservas.reduce((acc, r) => acc + r.cantidad, 0);
      reservado += resStock;
    }
    const disponible = fisico - reservado;

    // Check maximum of sueltos in lots
    for (const lote of prod.lotes) {
      if (lote.sueltos >= prod.unidadesPorCaja || lote.sueltos < 0) {
        console.error(`🚨 ALERTA: Lote ${lote.numero} de ${prod.nombre} viola sueltos (tiene ${lote.sueltos}, max < ${prod.unidadesPorCaja})`);
      }
    }

    if (fisico < 0) {
      console.error(`🚨 ALERTA: Stock negativo en ${prod.nombre}`);
    }

    console.log(`${prod.nombre.padEnd(25)} | ${String(prod.unidadesPorCaja).padEnd(13)} | ${String(lotesCount).padEnd(5)} | ${String(fisico).padEnd(6)} | ${String(reservado).padEnd(9)} | ${disponible}`);
  }

  console.log('\n--- Clientes DEMO ---');
  const demoClientes = await prisma.cliente.findMany({ where: { nombre: { startsWith: 'DEMO' } } });
  for (const c of demoClientes) {
    console.log(`${c.nombre} - ${c.estado}`);
  }

  console.log('\n--- Transportistas DEMO ---');
  const demoTransp = await prisma.transportista.findMany({ where: { nombre: { startsWith: 'DEMO' } } });
  for (const t of demoTransp) {
    console.log(`${t.nombre}`);
  }

  console.log('\nALEBET-01 DATOS DEMO UAT CARGADOS');
}

main().catch((error) => { console.error('❌ Error en seed Ale-Bet DEMO:', error); process.exit(1); });
