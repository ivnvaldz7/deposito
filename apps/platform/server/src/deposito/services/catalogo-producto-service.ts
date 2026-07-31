import {
  Categoria,
  EstadoProductoCatalogo,
  Mercado,
  OrigenProductoCatalogo,
  Prisma,
  PrismaClient,
  TipoAuditoriaCatalogo,
} from '@platform/db'

const MARKET_CATEGORIES: readonly Categoria[] = ['etiqueta', 'estuche']
const PRESENTATION_CATEGORIES: readonly Categoria[] = ['etiqueta', 'estuche', 'frasco']
const CODE_REQUIRED_CATEGORIES: readonly Categoria[] = ['etiqueta', 'estuche']

type TransactionClient = Prisma.TransactionClient

export interface CatalogoValidationInput {
  categoria: Categoria
  codigo?: string | null
  mercadosHabilitados?: Mercado[]
  presentacion?: number | null
}

export interface CatalogoCreateInput extends CatalogoValidationInput {
  nombreBase: string
  nombreCompleto: string
  presentacion?: number | null
  volumen?: Prisma.Decimal | null
  unidad?: string | null
  variante?: string | null
}

export interface CatalogoUpdateInput {
  nombreBase?: string
  nombreCompleto?: string
  presentacion?: number | null
  codigo?: string | null
  categoria?: Categoria
  mercadosHabilitados?: Mercado[]
  volumen?: Prisma.Decimal | null
  unidad?: string | null
  variante?: string | null
}

export function hasValidCodigo(codigo: string | null | undefined): boolean {
  return typeof codigo === 'string' && codigo.trim().length > 0
}

export function normalizeCodigo(codigo: string | null | undefined): string | null {
  return hasValidCodigo(codigo) ? codigo!.trim().toUpperCase() : null
}

export function validateCodigoPrefix(categoria: Categoria, codigo: string | null | undefined): void {
  const normalized = normalizeCodigo(codigo)
  if (normalized === null) return
  if (categoria === 'etiqueta' && !normalized.startsWith('IGET')) {
    throw new CatalogoError('INVALID', 'El código de etiqueta debe comenzar con IGET')
  }
  if (categoria === 'estuche' && !normalized.startsWith('IGES')) {
    throw new CatalogoError('INVALID', 'El código de estuche debe comenzar con IGES')
  }
}

function validateResultingCodigo(categoria: Categoria, codigo: string | null): void {
  if (CODE_REQUIRED_CATEGORIES.includes(categoria) && !hasValidCodigo(codigo)) {
    throw new CatalogoError('INVALID', 'El código es obligatorio para etiquetas y estuches')
  }
  validateCodigoPrefix(categoria, codigo)
}

export function deriveMigratedEstado(activo: boolean, codigo: string | null | undefined, categoria: Categoria): EstadoProductoCatalogo {
  if (!activo) return 'INACTIVO'
  const codeRequired = CODE_REQUIRED_CATEGORIES.includes(categoria)
  if (codeRequired && !hasValidCodigo(codigo)) return 'PENDIENTE_REVISION'
  return 'ACTIVO'
}

export function validateCatalogoInput(input: CatalogoValidationInput): void {
  const mercados = input.mercadosHabilitados ?? []
  const usesMarkets = MARKET_CATEGORIES.includes(input.categoria)
  const requiresPresentation = PRESENTATION_CATEGORIES.includes(input.categoria)
  if (usesMarkets && mercados.length === 0) throw new Error('La categoría requiere al menos un mercado habilitado')
  if (!usesMarkets && mercados.length > 0) throw new Error('La categoría no utiliza mercados habilitados')
  if (requiresPresentation && (!Number.isInteger(input.presentacion) || (input.presentacion ?? 0) <= 0)) {
    throw new Error('La presentación es obligatoria para esta categoría')
  }
}

export function validateTransition(
  actual: EstadoProductoCatalogo | null,
  siguiente: EstadoProductoCatalogo,
  codigo: string | null | undefined,
  categoria: Categoria,
): void {
  const codeRequired = CODE_REQUIRED_CATEGORIES.includes(categoria)
  if (siguiente === 'ACTIVO' && codeRequired && !hasValidCodigo(codigo)) throw new Error('Un producto activo requiere un código válido')
  const permitted =
    (actual === null && siguiente === 'ACTIVO') ||
    (actual === 'PENDIENTE_REVISION' && siguiente === 'ACTIVO') ||
    (actual === 'ACTIVO' && siguiente === 'INACTIVO') ||
    (actual === 'INACTIVO' && siguiente === 'ACTIVO')
  if (!permitted) throw new Error('La transición de estado no está permitida')
}

export function validateCatalogoUpdate(
  estado: EstadoProductoCatalogo | null,
  actual: { categoria: Categoria; codigo: string | null; mercadosHabilitados: readonly Mercado[] },
  input: CatalogoUpdateInput,
): void {
  if (estado !== 'ACTIVO' && estado !== 'INACTIVO') return
  const codigoNormalizado = input.codigo === undefined ? undefined : normalizeCodigo(input.codigo)
  const asignaCodigoHistoricoInactivo =
    estado === 'INACTIVO' &&
    actual.codigo === null &&
    codigoNormalizado !== undefined &&
    codigoNormalizado !== null
  const cambiaIdentidad =
    (input.codigo !== undefined && codigoNormalizado !== actual.codigo && !asignaCodigoHistoricoInactivo) ||
    (input.categoria !== undefined && input.categoria !== actual.categoria) ||
    (input.mercadosHabilitados !== undefined && JSON.stringify(input.mercadosHabilitados) !== JSON.stringify(actual.mercadosHabilitados))
  if (cambiaIdentidad) throw new CatalogoError('CONFLICT', 'Código, categoría y mercados están bloqueados después de activar')
  if (input.volumen !== undefined || input.unidad !== undefined || input.variante !== undefined) {
    throw new CatalogoError('CONFLICT', 'Solo el nombre y la presentación se pueden editar después de activar')
  }
}

export function isMarketCategory(categoria: Categoria): boolean {
  return MARKET_CATEGORIES.includes(categoria)
}

export function isCodigoRequiredForCategoria(categoria: Categoria): boolean {
  return CODE_REQUIRED_CATEGORIES.includes(categoria)
}

function audit(
  tx: TransactionClient,
  productoId: string,
  usuarioId: string,
  tipo: TipoAuditoriaCatalogo,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
) {
  return tx.auditoriaCatalogoProducto.create({
    data: { productoId, usuarioId, tipo, valorAnterior: before ?? undefined, valorNuevo: after ?? undefined },
  })
}

async function seedInitialInventory(
  tx: TransactionClient,
  producto: { id: string; categoria: Categoria; nombreCompleto: string; mercadosHabilitados: Mercado[] },
) {
  if (producto.categoria === 'etiqueta') {
    await tx.inventarioEtiqueta.createMany({
      data: producto.mercadosHabilitados.map((mercado) => ({ productoId: producto.id, articulo: producto.nombreCompleto, mercado, cantidad: 0 })),
      skipDuplicates: true,
    })
  }
  if (producto.categoria === 'estuche') {
    await tx.inventarioEstuche.createMany({
      data: producto.mercadosHabilitados.map((mercado) => ({ productoId: producto.id, articulo: producto.nombreCompleto, mercado, cantidad: 0 })),
      skipDuplicates: true,
    })
  }
}

export class CatalogoProductoService {
  constructor(private readonly db: PrismaClient) {}

  async createManual(input: CatalogoCreateInput, usuarioId: string) {
    validateCatalogoInput(input)
    const codigo = normalizeCodigo(input.codigo)
    validateCodigoPrefix(input.categoria, codigo)
    validateTransition(null, 'ACTIVO', codigo, input.categoria)
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.create({
        data: {
          nombreBase: input.nombreBase,
          nombreCompleto: input.nombreCompleto,
          categoria: input.categoria,
          codigo,
          estado: 'ACTIVO',
          activo: true,
          origen: 'MANUAL',
          presentacion: input.presentacion ?? null,
          mercadosHabilitados: input.mercadosHabilitados ?? [],
          volumen: input.volumen ?? null,
          unidad: input.unidad ?? null,
          variante: input.variante ?? null,
        },
      })
      await seedInitialInventory(tx, producto)
      await audit(tx, producto.id, usuarioId, 'CREADO', null, { estado: producto.estado, codigo: producto.codigo })
      await audit(tx, producto.id, usuarioId, 'ACTIVADO', null, { estado: producto.estado })
      return producto
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async activate(productoId: string, usuarioId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado === 'ACTIVO') return producto
      if (producto.estado !== 'PENDIENTE_REVISION') throw new CatalogoError('CONFLICT', 'Solo un producto pendiente puede activarse')
      validateCatalogoInput(producto)
      validateCodigoPrefix(producto.categoria, producto.codigo)
      validateTransition(producto.estado, 'ACTIVO', producto.codigo, producto.categoria)
      const actualizado = await tx.depositoProducto.update({ where: { id: producto.id }, data: { estado: 'ACTIVO', activo: true } })
      await seedInitialInventory(tx, actualizado)
      await audit(tx, actualizado.id, usuarioId, 'ACTIVADO', { estado: producto.estado }, { estado: actualizado.estado })
      if (producto.origen === OrigenProductoCatalogo.IMPORTACION) {
        await audit(tx, actualizado.id, usuarioId, 'IMPORTACION_APROBADA', { estado: producto.estado }, { estado: actualizado.estado })
      }
      return actualizado
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async reactivate(productoId: string, usuarioId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado === 'ACTIVO') return producto
      if (producto.estado !== 'INACTIVO') throw new CatalogoError('CONFLICT', 'Solo un producto inactivo puede reactivarse')
      validateCatalogoInput(producto)
      validateCodigoPrefix(producto.categoria, producto.codigo)
      validateTransition(producto.estado, 'ACTIVO', producto.codigo, producto.categoria)
      const actualizado = await tx.depositoProducto.update({ where: { id: producto.id }, data: { estado: 'ACTIVO', activo: true } })
      await seedInitialInventory(tx, actualizado)
      await audit(tx, actualizado.id, usuarioId, 'REACTIVADO', { estado: producto.estado }, { estado: actualizado.estado })
      return actualizado
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async deactivate(productoId: string, usuarioId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado === 'INACTIVO') return producto
      validateTransition(producto.estado, 'INACTIVO', producto.codigo, producto.categoria)
      const actualizado = await tx.depositoProducto.update({ where: { id: productoId }, data: { estado: 'INACTIVO', activo: false } })
      await audit(tx, productoId, usuarioId, 'DESACTIVADO', { estado: producto.estado }, { estado: actualizado.estado })
      return actualizado
    })
  }

  async update(productoId: string, input: CatalogoUpdateInput, usuarioId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      const categoria = input.categoria ?? producto.categoria
      const mercados = input.mercadosHabilitados ?? producto.mercadosHabilitados
      const codigo = input.codigo === undefined ? producto.codigo : normalizeCodigo(input.codigo)
      const presentacion = input.presentacion === undefined ? producto.presentacion : input.presentacion
      validateCatalogoUpdate(producto.estado, producto, input)
      validateCatalogoInput({ categoria, mercadosHabilitados: mercados, codigo, presentacion })
      // For etiqueta/estuche the RESULTING code (input.codigo if provided, else the
      // existing one) must remain valid and prefix-correct. This closes the gap where
      // a PATCH could clear or omit the code of a pending etiqueta/estuche.
      validateResultingCodigo(categoria, codigo)
      const data: Prisma.DepositoProductoUpdateInput = {
        ...(input.nombreBase !== undefined ? { nombreBase: input.nombreBase } : {}),
        ...(input.nombreCompleto !== undefined ? { nombreCompleto: input.nombreCompleto } : {}),
        ...(input.presentacion !== undefined ? { presentacion: input.presentacion } : {}),
        ...(input.codigo !== undefined ? { codigo } : {}),
        ...(input.categoria !== undefined ? { categoria } : {}),
        ...(input.mercadosHabilitados !== undefined ? { mercadosHabilitados: mercados } : {}),
        ...(input.volumen !== undefined ? { volumen: input.volumen } : {}),
        ...(input.unidad !== undefined ? { unidad: input.unidad } : {}),
        ...(input.variante !== undefined ? { variante: input.variante } : {}),
      }
      const actualizado = await tx.depositoProducto.update({ where: { id: productoId }, data })
      const tipo = input.codigo !== undefined
        ? 'CODIGO_ACTUALIZADO'
        : input.nombreCompleto !== undefined || input.nombreBase !== undefined
          ? 'NOMBRE_ACTUALIZADO'
          : input.presentacion !== undefined
            ? 'PRESENTACION_ACTUALIZADA'
            : 'EDITADO'
      await audit(
        tx,
        productoId,
        usuarioId,
        tipo,
        JSON.parse(JSON.stringify(producto)) as Prisma.InputJsonValue,
        JSON.parse(JSON.stringify(actualizado)) as Prisma.InputJsonValue,
      )
      return actualizado
    })
  }

  async deletePending(productoId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado !== 'PENDIENTE_REVISION') throw new CatalogoError('CONFLICT', 'Solo se puede eliminar un producto pendiente de revisión')
      const [drogas, estuches, etiquetas, frascos, actas, ordenes] = await Promise.all([
        tx.inventarioDroga.count({ where: { productoId } }),
        tx.inventarioEstuche.count({ where: { productoId } }),
        tx.inventarioEtiqueta.count({ where: { productoId } }),
        tx.inventarioFrasco.count({ where: { productoId } }),
        tx.actaItem.count({ where: { productoId } }),
        tx.ordenProduccion.count({ where: { productoId } }),
      ])
      if (drogas + estuches + etiquetas + frascos + actas + ordenes > 0) {
        throw new CatalogoError('CONFLICT', 'El producto tiene historial o relaciones operativas')
      }
      // A pending import only has catalog audit records. They are not operational history
      // and must be removed before the restrictive catalog FK permits the hard delete.
      await tx.auditoriaCatalogoProducto.deleteMany({ where: { productoId } })
      await tx.depositoProducto.delete({ where: { id: productoId } })
    })
  }

  async createImportPending(input: CatalogoCreateInput, usuarioId: string) {
    const [producto] = await this.createImportPendingBatch([input], usuarioId)
    return producto
  }

  async createImportPendingBatch(inputs: CatalogoCreateInput[], usuarioId: string) {
    for (const input of inputs) {
      validateCatalogoInput(input)
      validateCodigoPrefix(input.categoria, input.codigo)
    }
    const codes = inputs.map((input) => normalizeCodigo(input.codigo)).filter((codigo): codigo is string => codigo !== null)
    if (new Set(codes).size !== codes.length) throw new CatalogoError('CONFLICT', 'El archivo contiene códigos duplicados')
    return this.db.$transaction(async (tx) => {
      const existing = codes.length
        ? await tx.depositoProducto.findMany({ where: { codigo: { in: codes } }, select: { codigo: true } })
        : []
      if (existing.length) throw new CatalogoError('CONFLICT', 'Uno o más códigos ya existen globalmente')
      const productos: Prisma.DepositoProductoGetPayload<null>[] = []
      for (const input of inputs) {
        const codigo = normalizeCodigo(input.codigo)
        const producto = await tx.depositoProducto.create({
          data: {
            ...input,
            codigo,
            estado: 'PENDIENTE_REVISION',
            activo: false,
            origen: OrigenProductoCatalogo.IMPORTACION,
            presentacion: input.presentacion ?? null,
            mercadosHabilitados: input.mercadosHabilitados ?? [],
          },
        })
        await audit(tx, producto.id, usuarioId, 'IMPORTACION_CREADA', null, { estado: producto.estado, codigo: producto.codigo })
        productos.push(producto)
      }
      return productos
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}

export class CatalogoError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message)
  }
}
