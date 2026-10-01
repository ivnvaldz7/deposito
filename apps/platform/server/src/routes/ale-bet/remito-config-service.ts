import { Prisma } from '@platform/db'

const CONFIG_ID = 'DEFAULT'
export const REMITO_PUNTO_VENTA = '00001'
export const REMITO_CAI_INICIAL = '52166218186464'
export const REMITO_CAI_VENCIMIENTO_INICIAL = new Date('2027-04-17T00:00:00.000Z')

type Tx = Prisma.TransactionClient

export class RemitoConfigurationConflict extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemitoConfigurationConflict'
  }
}

function day(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function isCaiExpired(fecha: Date, now = new Date()): boolean {
  return day(fecha) < day(now)
}

export async function getOrCreateRemitoConfiguration(tx: Tx) {
  return tx.configuracionRemito.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      puntoVenta: REMITO_PUNTO_VENTA,
      proximoCorrelativo: null,
      cai: REMITO_CAI_INICIAL,
      caiVencimiento: REMITO_CAI_VENCIMIENTO_INICIAL,
    },
    update: {},
  })
}

export function formatRemitoNumber(puntoVenta: string, correlativo: number): string {
  return `${puntoVenta}-${String(correlativo).padStart(8, '0')}`
}

export async function takeNextRemitoNumber(tx: Tx) {
  await getOrCreateRemitoConfiguration(tx)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."ConfiguracionRemito" WHERE id = ${CONFIG_ID} FOR UPDATE
  `)
  const configuration = await tx.configuracionRemito.findUniqueOrThrow({ where: { id: CONFIG_ID } })
  if (configuration.proximoCorrelativo === null) {
    throw new RemitoConfigurationConflict('Configurá el próximo correlativo del remito antes de emitir')
  }

  const number = formatRemitoNumber(configuration.puntoVenta, configuration.proximoCorrelativo)
  const updated = await tx.configuracionRemito.update({
    where: { id: CONFIG_ID },
    data: { proximoCorrelativo: { increment: 1 } },
  })
  return {
    numero: number,
    caiSnapshot: { numero: configuration.cai, vencimiento: configuration.caiVencimiento },
    caiVencido: isCaiExpired(configuration.caiVencimiento),
    proximoCorrelativo: updated.proximoCorrelativo,
  }
}

export async function updateRemitoConfiguration(
  tx: Tx,
  input: { proximoCorrelativo?: number; cai?: string; caiVencimiento?: Date },
) {
  await getOrCreateRemitoConfiguration(tx)
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "ale_bet"."ConfiguracionRemito" WHERE id = ${CONFIG_ID} FOR UPDATE
  `)
  const current = await tx.configuracionRemito.findUniqueOrThrow({ where: { id: CONFIG_ID } })
  const hasCaiUpdate = input.cai !== undefined || input.caiVencimiento !== undefined
  if (hasCaiUpdate && !isCaiExpired(current.caiVencimiento)) {
    throw new RemitoConfigurationConflict('El CAI vigente solo se puede renovar después de su vencimiento')
  }
  if (input.proximoCorrelativo !== undefined && current.numeracionInicializadaAt) {
    throw new RemitoConfigurationConflict('El correlativo ya fue inicializado y no puede reiniciarse')
  }
  if (hasCaiUpdate && (input.cai === undefined || input.caiVencimiento === undefined)) {
    throw new RemitoConfigurationConflict('Ingresá el número y vencimiento del CAI renovado')
  }
  return tx.configuracionRemito.update({
    where: { id: CONFIG_ID },
    data: {
      ...(input.proximoCorrelativo !== undefined ? { proximoCorrelativo: input.proximoCorrelativo, numeracionInicializadaAt: new Date() } : {}),
      ...(hasCaiUpdate ? { cai: input.cai, caiVencimiento: input.caiVencimiento } : {}),
    },
  })
}
