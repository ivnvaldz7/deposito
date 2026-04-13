import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { hashPassword } from '@platform/core'
import { VENCIMIENTO_DEFAULT_AÑOS } from '../lib/constants'
import { prisma } from '../lib/prisma'

async function ensurePlatformUser(input: {
  email: string
  nombre: string
  password: string
  rol: 'admin' | 'vendedor' | 'armador'
}): Promise<void> {
  const password = await hashPassword(input.password)
  const existing = await platformDb.platformUser.findUnique({
    where: { email: input.email },
  })

  const user = existing
    ? await platformDb.platformUser.update({
        where: { id: existing.id },
        data: {
          nombre: input.nombre,
          password,
          activo: true,
        },
      })
    : await platformDb.platformUser.create({
        data: {
          email: input.email,
          nombre: input.nombre,
          password,
        },
      })

  await platformDb.appAccess.upsert({
    where: {
      userId_app: {
        userId: user.id,
        app: AppId.ale_bet,
      },
    },
    update: {
      rol: input.rol,
      activo: true,
    },
    create: {
      userId: user.id,
      app: AppId.ale_bet,
      rol: input.rol,
      activo: true,
    },
  })
}

async function main(): Promise<void> {
  await ensurePlatformUser({
    email: 'admin@alebet.com',
    nombre: 'Admin Ale-Bet',
    password: 'alebet123',
    rol: 'admin',
  })

  await ensurePlatformUser({
    email: 'vendedor@alebet.com',
    nombre: 'Vendedor Ale-Bet',
    password: 'alebet123',
    rol: 'vendedor',
  })

  await ensurePlatformUser({
    email: 'armador@alebet.com',
    nombre: 'Armador Ale-Bet',
    password: 'alebet123',
    rol: 'armador',
  })

  const now = new Date()
  const fechaVencimiento = new Date(now)
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + VENCIMIENTO_DEFAULT_AÑOS)

  const productos = [
    { nombre: 'AMANTINA 250 ML', sku: 'AM01', lotes: [{ numero: 'AM0138', cajas: 15, sueltos: 0 }] },
    { nombre: 'AMANTINA 500 ML', sku: 'AM02', lotes: [{ numero: 'AM0139', cajas: 20, sueltos: 0 }] },
    { nombre: 'AMANTINA PREMIUM 100 ML', sku: 'AP01', lotes: [{ numero: 'AP0060', cajas: 30, sueltos: 0 }] },
    { nombre: 'AMANTINA PREMIUM 250 ML', sku: 'AP02', lotes: [{ numero: 'AP0034', cajas: 24, sueltos: 0 }] },
    { nombre: 'AMANTINA PREMIUM 500 ML', sku: 'AP03', lotes: [{ numero: 'AP0079', cajas: 20, sueltos: 11 }] },
    { nombre: 'AMINOÁCIDOS 20 ML', sku: 'AO01', lotes: [{ numero: 'AO0248', cajas: 15, sueltos: 0 }] },
    { nombre: 'AMINOÁCIDOS 50 ML GALLO', sku: 'AO02', lotes: [{ numero: 'AO0274', cajas: 40, sueltos: 21 }] },
    { nombre: 'AMINOÁCIDOS 50 ML MASCOTA', sku: 'AO03', lotes: [{ numero: 'AO0274', cajas: 40, sueltos: 0 }] },
    { nombre: 'AMINOÁCIDOS 1 L', sku: 'AO04', lotes: [{ numero: 'AO0287', cajas: 12, sueltos: 5 }] },
    { nombre: 'AMINOÁCIDOS 1 L AVES', sku: 'AO05', lotes: [{ numero: 'AO0282', cajas: 12, sueltos: 6 }] },
    { nombre: 'AMINOÁCIDOS 5 L', sku: 'AO06', lotes: [{ numero: 'AO0287', cajas: 4, sueltos: 7 }] },
    { nombre: 'ANTITÉRMICO 1 L', sku: 'AT01', lotes: [{ numero: 'AT0015', cajas: 12, sueltos: 0 }] },
    { nombre: 'CALCITROVIT 500 ML', sku: 'CV01', lotes: [{ numero: 'CV0018', cajas: 20, sueltos: 0 }] },
    { nombre: 'CETRI-AMON 1 L', sku: 'CA01', lotes: [{ numero: 'CA0123', cajas: 12, sueltos: 6 }] },
    { nombre: 'CETRI-AMON 5 L', sku: 'CA02', lotes: [{ numero: 'CA0129', cajas: 4, sueltos: 3 }] },
    {
      nombre: 'COMPLEJO B B12 B15 20 ML',
      sku: 'CB01',
      lotes: [
        { numero: 'CB0090', cajas: 12, sueltos: 0 },
        { numero: 'CB0092', cajas: 12, sueltos: 0 },
      ],
    },
    { nombre: 'COMPLEJO B B12 B15 100 ML', sku: 'CB02', lotes: [{ numero: 'CB0091', cajas: 24, sueltos: 12 }] },
    { nombre: 'COMPLEJO B B12 B15 250 ML', sku: 'CB03', lotes: [{ numero: 'CB0093', cajas: 24, sueltos: 65 }] },
    { nombre: 'COMPLEJO B HIERRO CERDOS 25 ML', sku: 'HB01', lotes: [{ numero: 'HB0025', cajas: 20, sueltos: 0 }] },
    { nombre: 'COMPLEJO B HIERRO CERDOS 100 ML', sku: 'HB02', lotes: [{ numero: 'HB0025', cajas: 24, sueltos: 0 }] },
    { nombre: 'COMPLEJO B HIERRO EQUINO 25 ML', sku: 'HB03', lotes: [{ numero: 'HB0028', cajas: 20, sueltos: 0 }] },
    { nombre: 'COMPLEJO B HIERRO EQUINOS 100 ML', sku: 'HB04', lotes: [{ numero: 'HB0028', cajas: 24, sueltos: 12 }] },
    { nombre: 'ENERGIZANTE 25 ML', sku: 'EN01', lotes: [{ numero: 'EN0124', cajas: 20, sueltos: 0 }] },
    { nombre: 'ENERGIZANTE 100 ML', sku: 'EN02', lotes: [{ numero: 'EN0129', cajas: 24, sueltos: 21 }] },
    { nombre: 'ENERGIZANTE 250 ML', sku: 'EN03', lotes: [{ numero: 'EN0126', cajas: 24, sueltos: 14 }] },
    { nombre: 'ENERGIZANTE 250 ML VACAS', sku: 'EN04', lotes: [{ numero: 'EN0125', cajas: 24, sueltos: 7 }] },
    { nombre: 'ENERGIZANTE 500 ML', sku: 'EN05', lotes: [{ numero: 'EN0122', cajas: 20, sueltos: 0 }] },
    { nombre: 'IVERSAN 500 ML', sku: 'IV01', lotes: [{ numero: 'IV0038', cajas: 20, sueltos: 0 }] },
    { nombre: 'JERINGA ATP 35 GR', sku: 'EN06', lotes: [{ numero: 'EN0112', cajas: 24, sueltos: 0 }] },
    { nombre: 'OLIVITASAN 25 ML', sku: 'OL01', lotes: [{ numero: 'OL0897', cajas: 20, sueltos: 5 }] },
    { nombre: 'OLIVITASAN 100 ML', sku: 'OL02', lotes: [{ numero: 'OL0907', cajas: 40, sueltos: 6 }] },
    { nombre: 'OLIVITASAN 300 ML', sku: 'OL03', lotes: [{ numero: 'OL0907', cajas: 24, sueltos: 6 }] },
    { nombre: 'OLIVITASAN 500 ML', sku: 'OL04', lotes: [{ numero: 'OL0908', cajas: 20, sueltos: 13 }] },
    { nombre: 'OLIVITASAN PLUS 50 ML', sku: 'PL01', lotes: [{ numero: 'PL0578', cajas: 40, sueltos: 12 }] },
    { nombre: 'OLIVITASAN PLUS 250 ML', sku: 'PL02', lotes: [{ numero: 'PL0585', cajas: 24, sueltos: 0 }] },
    { nombre: 'OLIVITASAN PLUS 500 ML', sku: 'PL03', lotes: [{ numero: 'PL0589', cajas: 20, sueltos: 12 }] },
    { nombre: 'SUPERCOMPLEJO B 1 L AVES', sku: 'SC01', lotes: [{ numero: 'SC0012', cajas: 12, sueltos: 0 }] },
    { nombre: 'SUPERCOMPLEJO B 1 L EQUINO', sku: 'SC02', lotes: [{ numero: 'SC0012', cajas: 12, sueltos: 0 }] },
    { nombre: 'TILCOSAN 100 ML', sku: 'TM01', lotes: [{ numero: 'TM0035', cajas: 24, sueltos: 6 }] },
    { nombre: 'TILCOSAN 250 ML', sku: 'TM02', lotes: [{ numero: 'TM0036', cajas: 24, sueltos: 12 }] },
    { nombre: 'VITAMINA B1 100 ML', sku: 'VB01', lotes: [{ numero: 'VB0017', cajas: 24, sueltos: 7 }] },
    { nombre: 'VITAMINA B12 50 ML', sku: 'BB01', lotes: [{ numero: 'BB005', cajas: 0, sueltos: 19 }] },
    { nombre: 'VITAMINA B12 100 ML', sku: 'BB02', lotes: [{ numero: 'BB005', cajas: 4, sueltos: 0 }] },
  ] as const

  await prisma.itemPedido.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.movimientoStock.deleteMany()
  await prisma.lote.deleteMany()
  await prisma.producto.deleteMany()

  for (const productoInput of productos) {
    const producto = await prisma.producto.create({
      data: {
        nombre: productoInput.nombre,
        sku: productoInput.sku,
        stockMinimo: 100,
        activo: true,
      },
    })

    for (const loteInput of productoInput.lotes) {
      await prisma.lote.create({
        data: {
          numero: loteInput.numero,
          productoId: producto.id,
          cajas: loteInput.cajas,
          sueltos: loteInput.sueltos,
          fechaProduccion: now,
          fechaVencimiento,
          activo: true,
        },
      })
    }
  }

  const clientes = [
    {
      nombre: 'Veterinaria Central',
      contacto: 'María Gómez',
      direccion: 'Av. Siempre Viva 123',
    },
    {
      nombre: 'Agroinsumos Norte',
      contacto: 'Juan Pérez',
      direccion: 'Ruta 8 Km 55',
    },
  ]

  for (const clienteInput of clientes) {
    const existing = await prisma.cliente.findFirst({
      where: { nombre: clienteInput.nombre },
    })

    if (existing) {
      await prisma.cliente.update({
        where: { id: existing.id },
        data: {
          contacto: clienteInput.contacto,
          direccion: clienteInput.direccion,
          activo: true,
        },
      })
      continue
    }

    await prisma.cliente.create({
      data: clienteInput,
    })
  }

  console.log('Seed de Ale-Bet completado')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await platformDb.$disconnect()
  })
