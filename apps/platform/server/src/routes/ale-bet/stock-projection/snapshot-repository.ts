import type { PrismaClient } from '@platform/db'
import {
  assertRequiredProjectionLocations,
  buildStockProjectionSnapshot,
  REQUIRED_STOCK_PROJECTION_LOCATION_CODES,
  type StockProjectionSnapshot,
  type StockProjectionSource,
} from './snapshot'

type StockProjectionReadClient = Pick<PrismaClient, 'producto' | 'ubicacionStock'>

export async function readStockProjectionSource(
  prisma: StockProjectionReadClient,
): Promise<StockProjectionSource> {
  const ubicaciones = await prisma.ubicacionStock.findMany({
    where: { codigo: { in: [...REQUIRED_STOCK_PROJECTION_LOCATION_CODES] } },
    select: { id: true, codigo: true, activo: true },
  })
  const locationIds = Object.values(assertRequiredProjectionLocations(ubicaciones))

  const productos = await prisma.producto.findMany({
    where: { activo: true },
    select: {
      id: true,
      nombre: true,
      activo: true,
      lotes: {
        select: {
          id: true,
          numero: true,
          activo: true,
          createdAt: true,
          fechaVencimiento: true,
          saldos: {
            where: { ubicacionId: { in: locationIds } },
            select: { ubicacionId: true, cantidad: true },
          },
        },
      },
    },
  })

  return { ubicaciones, productos }
}

export async function buildCurrentStockProjectionSnapshot(
  prisma: StockProjectionReadClient,
): Promise<StockProjectionSnapshot> {
  return buildStockProjectionSnapshot(await readStockProjectionSource(prisma), new Date())
}
