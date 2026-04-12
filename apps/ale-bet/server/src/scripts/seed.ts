import 'dotenv/config'
import { AppId, platformDb } from '@platform/db'
import { hashPassword } from '@platform/core'
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

  const productos = [
    {
      nombre: 'Amantina Premium',
      sku: 'AM',
      stockMinimo: 120,
      lote: {
        numero: 'AM0001',
        cajas: 12,
        sueltos: 3,
        fechaProduccion: new Date('2026-01-10T00:00:00.000Z'),
        fechaVencimiento: new Date('2028-01-10T00:00:00.000Z'),
      },
    },
    {
      nombre: 'Complefusel',
      sku: 'CF',
      stockMinimo: 90,
      lote: {
        numero: 'CF0001',
        cajas: 9,
        sueltos: 5,
        fechaProduccion: new Date('2026-02-14T00:00:00.000Z'),
        fechaVencimiento: new Date('2028-02-14T00:00:00.000Z'),
      },
    },
    {
      nombre: 'Olivitasan Plus',
      sku: 'OP',
      stockMinimo: 80,
      lote: {
        numero: 'OP0001',
        cajas: 15,
        sueltos: 1,
        fechaProduccion: new Date('2026-03-02T00:00:00.000Z'),
        fechaVencimiento: new Date('2028-03-02T00:00:00.000Z'),
      },
    },
  ]

  for (const productoInput of productos) {
    const producto = await prisma.producto.upsert({
      where: { sku: productoInput.sku },
      update: {
        nombre: productoInput.nombre,
        stockMinimo: productoInput.stockMinimo,
        activo: true,
      },
      create: {
        nombre: productoInput.nombre,
        sku: productoInput.sku,
        stockMinimo: productoInput.stockMinimo,
      },
    })

    await prisma.lote.upsert({
      where: { numero: productoInput.lote.numero },
      update: {
        productoId: producto.id,
        cajas: productoInput.lote.cajas,
        sueltos: productoInput.lote.sueltos,
        fechaProduccion: productoInput.lote.fechaProduccion,
        fechaVencimiento: productoInput.lote.fechaVencimiento,
        activo: true,
      },
      create: {
        numero: productoInput.lote.numero,
        productoId: producto.id,
        cajas: productoInput.lote.cajas,
        sueltos: productoInput.lote.sueltos,
        fechaProduccion: productoInput.lote.fechaProduccion,
        fechaVencimiento: productoInput.lote.fechaVencimiento,
        activo: true,
      },
    })
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
