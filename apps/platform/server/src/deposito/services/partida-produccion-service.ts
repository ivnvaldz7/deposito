import { Prisma, PrismaClient, Mercado } from '@platform/db'

export class PartidaError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID' | 'CONFLICT', message: string) { super(message) }
}

type ItemInput = { productoId: string; cantidadSolicitada: number; mercado?: Mercado }
type ItemUpdate = { id: string; cantidadFinal?: number | null }
type Db = PrismaClient | Prisma.TransactionClient

function effective(item: { cantidadSolicitada: number; cantidadFinal: number | null }) {
  return item.cantidadFinal ?? item.cantidadSolicitada
}

export class PartidaProduccionService {
  constructor(private readonly db: PrismaClient) {}

  private validateItem(producto: { activo: boolean; categoria: string; nombreCompleto: string; mercadosHabilitados: Mercado[] }, item: ItemInput | { mercado: Mercado | null; cantidadSolicitada: number; cantidadFinal: number | null }) {
    const cantidad = 'cantidadFinal' in item ? effective(item) : item.cantidadSolicitada
    if (!producto.activo) throw new PartidaError('INVALID', `Producto inactivo: ${producto.nombreCompleto}`)
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new PartidaError('INVALID', 'Las cantidades deben ser mayores a cero')
    const requiresMercado = producto.categoria === 'estuche' || producto.categoria === 'etiqueta'
    if (requiresMercado && !item.mercado) throw new PartidaError('INVALID', `${producto.categoria} requiere mercado`)
    if (!requiresMercado && item.mercado) throw new PartidaError('INVALID', `${producto.categoria} no admite mercado`)
    if (requiresMercado && item.mercado && !producto.mercadosHabilitados.includes(item.mercado)) {
      throw new PartidaError('INVALID', `Mercado no habilitado para ${producto.nombreCompleto}`)
    }
    if (producto.categoria !== 'droga' && !Number.isInteger(cantidad)) {
      throw new PartidaError('INVALID', `${producto.categoria} requiere cantidades enteras`)
    }
  }

  private include = {
    solicitante: { select: { id: true, name: true, role: true } },
    confirmadoPor: { select: { id: true, name: true } },
    items: { include: { producto: true } },
  } as const

  async list(options: { userId?: string; role?: string }) {
    return this.db.partidaProduccion.findMany({
      where: options.role === 'solicitante' && options.userId ? { solicitanteId: options.userId } : {},
      include: this.include, orderBy: { createdAt: 'desc' },
    })
  }

  async getById(id: string) {
    return this.db.partidaProduccion.findUnique({ where: { id }, include: this.include })
  }

  async create(data: { solicitanteId: string; notas?: string; items: ItemInput[] }) {
    if (data.items.length === 0) throw new PartidaError('INVALID', 'Debe incluir al menos un producto')
    const products = await this.db.depositoProducto.findMany({ where: { id: { in: data.items.map((item) => item.productoId) } } })
    const byId = new Map(products.map((producto) => [producto.id, producto]))
    for (const item of data.items) {
      const producto = byId.get(item.productoId)
      if (!producto) throw new PartidaError('INVALID', 'Producto inexistente')
      this.validateItem(producto, item)
    }
    return this.db.$transaction((tx) => tx.partidaProduccion.create({
      data: { solicitanteId: data.solicitanteId, notas: data.notas, estado: 'SOLICITADO', items: { create: data.items } },
      include: this.include,
    }))
  }

  async ajustarCantidades(id: string, updates: ItemUpdate[]) {
    if (updates.length === 0) throw new PartidaError('INVALID', 'Debe indicar al menos una cantidad final')
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM deposito.partidas_produccion WHERE id = ${id} FOR UPDATE`
      const partida = await tx.partidaProduccion.findUnique({ where: { id }, include: { items: { include: { producto: true } } } })
      if (!partida) throw new PartidaError('NOT_FOUND', 'Solicitud no encontrada')
      if (partida.estado !== 'SOLICITADO') throw new PartidaError('CONFLICT', 'Solo se ajustan solicitudes SOLICITADO')
      const items = new Map(partida.items.map((item) => [item.id, item]))
      for (const update of updates) {
        const item = items.get(update.id)
        if (!item) throw new PartidaError('INVALID', 'Ítem no pertenece a la solicitud')
        if (update.cantidadFinal !== undefined && update.cantidadFinal !== null) {
          this.validateItem(item.producto, { ...item, cantidadFinal: update.cantidadFinal })
        }
      }
      for (const update of updates) await tx.itemSolicitud.update({ where: { id: update.id }, data: { cantidadFinal: update.cantidadFinal } })
      return tx.partidaProduccion.findUniqueOrThrow({ where: { id }, include: this.include })
    })
  }

  async rechazar(id: string, motivoRechazo: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM deposito.partidas_produccion WHERE id = ${id} FOR UPDATE`
      const changed = await tx.partidaProduccion.updateMany({ where: { id, estado: 'SOLICITADO' }, data: { estado: 'RECHAZADO', motivoRechazo } })
      if (!changed.count) throw new PartidaError('CONFLICT', 'La solicitud no puede rechazarse')
      return tx.partidaProduccion.findUniqueOrThrow({ where: { id }, include: this.include })
    })
  }

  async confirmar(id: string, actorId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM deposito.partidas_produccion WHERE id = ${id} FOR UPDATE`
      const partida = await tx.partidaProduccion.findUnique({ where: { id }, include: { items: { include: { producto: true } } } })
      if (!partida) throw new PartidaError('NOT_FOUND', 'Solicitud no encontrada')
      if (partida.estado !== 'SOLICITADO') throw new PartidaError('CONFLICT', 'La solicitud ya fue resuelta')

      const plans: Array<{ item: typeof partida.items[number]; cantidad: number; inventoryId: string; lotes?: Array<{ id: string; cantidad: number; lote: string | null }> }> = []
      for (const item of [...partida.items].sort((a, b) => a.id.localeCompare(b.id))) {
        this.validateItem(item.producto, item)
        const cantidad = effective(item)
        if (item.producto.categoria === 'droga') {
          const lotes = await tx.$queryRaw<Array<{ id: string; cantidad: number; lote: string | null }>>`
            SELECT id, cantidad, lote FROM deposito.inventario_drogas
            WHERE producto_id = ${item.productoId} AND cantidad > 0
            ORDER BY CASE WHEN vencimiento IS NULL THEN 1 ELSE 0 END, vencimiento ASC, id ASC FOR UPDATE`
          const disponible = lotes.reduce((sum, lote) => sum + lote.cantidad, 0)
          if (disponible < cantidad) throw new PartidaError('CONFLICT', `Stock insuficiente de droga: ${item.producto.nombreCompleto}`)
          plans.push({ item, cantidad, inventoryId: '', lotes })
          continue
        }
        if (item.producto.categoria === 'frasco') {
          const rows = await tx.$queryRaw<Array<{ id: string; total: number; unidades_por_caja: number }>>`
            SELECT id, total, unidades_por_caja FROM deposito.inventario_frascos
            WHERE producto_id = ${item.productoId} FOR UPDATE`
          const row = rows[0]
          if (!row || row.total < cantidad) throw new PartidaError('CONFLICT', `Stock insuficiente de frasco: ${item.producto.nombreCompleto}`)
          plans.push({ item, cantidad, inventoryId: row.id })
          continue
        }
        const table = item.producto.categoria === 'estuche' ? 'inventario_estuches' : 'inventario_etiquetas'
        const rows = await tx.$queryRaw<Array<{ id: string; cantidad: number }>>(Prisma.sql`
          SELECT id, cantidad FROM deposito.${Prisma.raw(table)}
          WHERE producto_id = ${item.productoId} AND mercado = ${item.mercado}::deposito."Mercado" FOR UPDATE`)
        const row = rows[0]
        if (!row || row.cantidad < cantidad) throw new PartidaError('CONFLICT', `Stock insuficiente de ${item.producto.categoria}: ${item.producto.nombreCompleto}`)
        plans.push({ item, cantidad, inventoryId: row.id })
      }

      for (const plan of plans) {
        const { item, cantidad } = plan
        if (item.producto.categoria === 'droga') {
          let restante = cantidad
          for (const lote of plan.lotes ?? []) {
            if (restante <= 0) break
            const tomado = Math.min(lote.cantidad, restante)
            await tx.inventarioDroga.update({ where: { id: lote.id }, data: { cantidad: { decrement: tomado } } })
            await tx.movimiento.create({ data: { tipo: 'egreso_partida', categoria: 'droga', productoNombre: item.producto.nombreCompleto, productoId: item.productoId, lote: lote.lote, cantidad: -tomado, referenciaId: id, referenciaTipo: 'partida', createdBy: actorId } })
            restante -= tomado
          }
          continue
        }
        if (item.producto.categoria === 'frasco') {
          const inv = await tx.inventarioFrasco.findUniqueOrThrow({ where: { id: plan.inventoryId } })
          const total = inv.total - cantidad
          await tx.inventarioFrasco.update({ where: { id: inv.id }, data: { total, cantidadCajas: Math.floor(total / inv.unidadesPorCaja) } })
        } else if (item.producto.categoria === 'estuche') {
          await tx.inventarioEstuche.update({ where: { id: plan.inventoryId }, data: { cantidad: { decrement: cantidad } } })
        } else {
          await tx.inventarioEtiqueta.update({ where: { id: plan.inventoryId }, data: { cantidad: { decrement: cantidad } } })
        }
        await tx.movimiento.create({ data: { tipo: 'egreso_partida', categoria: item.producto.categoria, productoNombre: item.producto.nombreCompleto, productoId: item.productoId, cantidad: -cantidad, referenciaId: id, referenciaTipo: 'partida', createdBy: actorId } })
      }
      return tx.partidaProduccion.update({ where: { id }, data: { estado: 'CONFIRMADO', confirmadoPorId: actorId, confirmadoAt: new Date() }, include: this.include })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}
