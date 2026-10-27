import type { FrascoStock } from '../lib/frasco-stock'
import { codeForCatalogSequence, isInitialEstuchesMarket } from './importacion-inicial-estuches-helpers'
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
const PRESENTATION_CATEGORIES: readonly Categoria[] = ['etiqueta', 'estuche']
const CODE_REQUIRED_CATEGORIES: readonly Categoria[] = ['etiqueta', 'estuche']
const ETIQUETA_UNITS = ['ML', 'L', 'CM3'] as const

function etiquetaUnitLabel(unidad: string): string {
  return unidad === 'CM3' ? 'cm³' : unidad
}

function normalizeEtiquetaUnit(unidad: string | null | undefined): string | null {
  if (!unidad) return null
  const normalized = unidad.trim().toUpperCase().replace('CM³', 'CM3')
  return ETIQUETA_UNITS.includes(normalized as typeof ETIQUETA_UNITS[number]) ? normalized : null
}

function etiquetaUnitFromInput(input: CatalogoCreateInput): string {
  const declared = normalizeEtiquetaUnit(input.unidad)
  if (declared) return declared
  const match = input.nombreCompleto.match(/\b\d+(?:[.,]\d+)?\s*(CM3\b|CM³|ML\b|L\b)/i)
  return normalizeEtiquetaUnit(match?.[1]) ?? 'ML'
}

function canonicalManualProductName(input: CatalogoCreateInput): string {
  const nombreBase = input.nombreBase.trim().replace(/\s+/g, ' ').toUpperCase()
  const nombreCompleto = input.nombreCompleto.trim().replace(/\s+/g, ' ').toUpperCase()
  const hasVolume = /\b\d+(?:[.,]\d+)?\s*(?:ML\b|L\b|CM3\b|CM³)/i.test(nombreCompleto)
  const requiresVolumeInName = input.categoria === 'etiqueta' || input.categoria === 'estuche'
  if (requiresVolumeInName && input.presentacion && nombreCompleto === nombreBase && !hasVolume) {
    return `${nombreBase} ${input.presentacion} ${input.categoria === 'etiqueta' ? etiquetaUnitLabel(etiquetaUnitFromInput(input)) : 'ML'}`
  }
  return nombreCompleto.replace(/\bCM3\b/gi, 'cm³').replace(/CM³/gi, 'cm³')
}

type TransactionClient = Prisma.TransactionClient

export interface CatalogoValidationInput {
  categoria: Categoria
  codigo?: string | null
  mercadosHabilitados?: Mercado[]
  presentacion?: number | null
  unidad?: string | null
  estado?: EstadoProductoCatalogo | null
  stockMinimo?: number | null
}

export interface CatalogoCreateInput extends CatalogoValidationInput {
  nombreBase: string
  nombreCompleto: string
  presentacion?: number | null
  volumen?: Prisma.Decimal | null
  unidad?: string | null
  variante?: string | null
  stockInicialFrasco?: FrascoStock
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
  stockMinimo?: number | null
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
  if (input.stockMinimo !== undefined && input.stockMinimo !== null && (!Number.isInteger(input.stockMinimo) || input.stockMinimo < 0)) throw new Error('El stock mínimo debe ser un entero no negativo')
  const mercados = input.mercadosHabilitados ?? []
  const usesMarkets = MARKET_CATEGORIES.includes(input.categoria)
  const requiresPresentation = PRESENTATION_CATEGORIES.includes(input.categoria)
  if (input.categoria === 'estuche' && mercados.length !== 1) {
    throw new Error('La categoría estuche requiere exactamente un mercado habilitado')
  }
  if (usesMarkets && mercados.length === 0) throw new Error('La categoría requiere al menos un mercado habilitado')
  if (!usesMarkets && mercados.length > 0) throw new Error('La categoría no utiliza mercados habilitados')

  if (input.categoria === 'etiqueta') {
    const unidad = normalizeEtiquetaUnit(input.unidad)
    if (input.unidad !== undefined && input.unidad !== null && !unidad) {
      throw new Error('La unidad de etiqueta debe ser ml, L o cm³')
    }
    if (unidad === 'CM3' && (mercados.length !== 1 || mercados[0] !== 'VENEZUELA')) {
      throw new Error('cm³ es exclusivo para etiquetas destinadas a Venezuela')
    }
  }

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
  // Los códigos ENV de frascos se completan y corrigen durante la operación
  // del depósito. A diferencia de etiquetas y estuches, no forman parte de
  // una identidad de mercado, por lo que se permite corregirlos aun activos.
  const actualizaCodigoDeFrasco =
    actual.categoria === 'frasco' &&
    input.codigo !== undefined
  const mercadosPropuestos = input.mercadosHabilitados
  const mercadosSeAmplianEnEtiquetaActiva =
    estado === 'ACTIVO' &&
    actual.categoria === 'etiqueta' &&
    mercadosPropuestos !== undefined &&
    actual.mercadosHabilitados.every((mercado) => mercadosPropuestos.includes(mercado))
  // Corrección puntual de catálogo: un insumo cargado por error como MP puede
  // convertirse en material de empaque sin crear un duplicado. El traslado del
  // saldo entre inventarios se hace de forma atómica en update().
  const corrigeMpComoMaterialEmpaque =
    estado === 'ACTIVO' &&
    actual.categoria === 'droga' &&
    input.categoria === 'material_empaque'
  const cambiaIdentidad =
    (input.codigo !== undefined && codigoNormalizado !== actual.codigo && !asignaCodigoHistoricoInactivo && !actualizaCodigoDeFrasco) ||
    (input.categoria !== undefined && input.categoria !== actual.categoria && !corrigeMpComoMaterialEmpaque) ||
    (mercadosPropuestos !== undefined && JSON.stringify(mercadosPropuestos) !== JSON.stringify(actual.mercadosHabilitados) && !mercadosSeAmplianEnEtiquetaActiva)
  if (cambiaIdentidad) throw new CatalogoError('CONFLICT', 'Código, categoría y mercados están bloqueados después de activar')
  if (actual.categoria !== 'frasco' && (input.volumen !== undefined || input.unidad !== undefined || input.variante !== undefined)) {
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
  producto: { id: string; categoria: Categoria; nombreCompleto: string; mercadosHabilitados: Mercado[]; presentacion: number | null },
  stockInicialFrasco?: FrascoStock,
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
  if (producto.categoria === 'frasco') {
    const inserted = await tx.inventarioFrasco.createMany({
      data: [{
        productoId: producto.id,
        articulo: producto.nombreCompleto,
        unidadesPorCaja: stockInicialFrasco?.unidadesPorCaja ?? 1,
        cantidadCajas: stockInicialFrasco?.cantidadCajas ?? 0,
        unidadesSueltas: stockInicialFrasco?.unidadesSueltas ?? 0,
        total: stockInicialFrasco?.total ?? 0,
      }],
      skipDuplicates: true,
    })
    if (stockInicialFrasco && inserted.count !== 1) throw new CatalogoError('CONFLICT', 'Ya existe un frasco con ese artículo')
  }
  if (producto.categoria === 'material_empaque') {
    await tx.inventarioMaterialEmpaque.createMany({
      data: [{ productoId: producto.id, articulo: producto.nombreCompleto, cantidad: 0 }],
      skipDuplicates: true,
    })
  }
}

async function ensureMarketInventory(tx: TransactionClient, producto: { id: string; categoria: Categoria; mercadosHabilitados: Mercado[] }, mercados: Mercado[]) {
  if (!mercados.length || (producto.categoria !== 'etiqueta' && producto.categoria !== 'estuche')) return
  const where = { productoId: producto.id, mercado: { in: mercados } }
  const rows = producto.categoria === 'etiqueta'
    ? await tx.inventarioEtiqueta.findMany({ where, select: { mercado: true } })
    : await tx.inventarioEstuche.findMany({ where, select: { mercado: true } })
  if (rows.length !== mercados.length) throw new CatalogoError('CONFLICT', 'Ya existe un artículo con ese nombre en el mercado seleccionado. Revisá la variante y la presentación.')
}

export class CatalogoProductoService {
  constructor(private readonly db: PrismaClient) {}

  async createManual(input: CatalogoCreateInput, usuarioId: string) {
    validateCatalogoInput(input)
    const canonicalInput = {
      ...input,
      unidad: input.categoria === 'etiqueta' ? etiquetaUnitFromInput(input) : input.unidad ?? null,
      nombreCompleto: canonicalManualProductName(input),
    }
    validateCatalogoInput(canonicalInput)
    const requestedCodigo = normalizeCodigo(canonicalInput.codigo)
    validateCodigoPrefix(canonicalInput.categoria, requestedCodigo)
    const automatic = !requestedCodigo && CODE_REQUIRED_CATEGORIES.includes(canonicalInput.categoria)
    for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await this.db.$transaction(async (tx) => {
        let codigo = requestedCodigo
        if (automatic) {
          const markets = canonicalInput.mercadosHabilitados ?? []
          const market = markets.includes('argentina') ? 'argentina' : markets.find(isInitialEstuchesMarket) ?? 'argentina'
          for (;;) {
            const args = { where: { mercado: market }, create: { mercado: market, ultimo: 1 }, update: { ultimo: { increment: 1 } } }
            const reserved = canonicalInput.categoria === 'etiqueta'
              ? await tx.secuenciaCodigoEtiqueta.upsert(args)
              : await tx.secuenciaCodigoEstuche.upsert(args)
            if (reserved.ultimo > 999) throw new CatalogoError('CONFLICT', 'Se agotaron los códigos disponibles para este mercado')
            const candidate = codeForCatalogSequence(canonicalInput.categoria === 'etiqueta' ? 'etiqueta' : 'estuche', market, reserved.ultimo)
            const existing = await tx.depositoProducto.findUnique({ where: { codigo: candidate }, select: { id: true } })
            if (!existing) { codigo = candidate; break }
          }
        }
        validateTransition(null, 'ACTIVO', codigo, canonicalInput.categoria)
        const producto = await tx.depositoProducto.create({
          data: {
            nombreBase: canonicalInput.nombreBase,
            nombreCompleto: canonicalInput.nombreCompleto,
            categoria: canonicalInput.categoria,
            codigo,
            estado: 'ACTIVO',
            activo: true,
            origen: 'MANUAL',
            presentacion: canonicalInput.presentacion ?? null,
            mercadosHabilitados: canonicalInput.mercadosHabilitados ?? [],
            mercado: canonicalInput.categoria === 'estuche' ? canonicalInput.mercadosHabilitados?.[0] : null,
            volumen: canonicalInput.volumen ?? null,
            unidad: canonicalInput.unidad ?? null,
            variante: canonicalInput.variante ?? null,
            stockMinimo: canonicalInput.stockMinimo ?? null,
          },
        })
        await seedInitialInventory(tx, producto, canonicalInput.stockInicialFrasco)
        await ensureMarketInventory(tx, producto, producto.mercadosHabilitados)
        await audit(tx, producto.id, usuarioId, 'CREADO', null, { estado: producto.estado, codigo: producto.codigo })
        await audit(tx, producto.id, usuarioId, 'ACTIVADO', null, { estado: producto.estado })
        return producto
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined
      if (automatic && (code === 'P2034' || code === 'P2002') && attempt < 3) continue
      if (code === 'P2002' || code === 'P2034') throw new CatalogoError('CONFLICT', 'El código o producto ya existe; intentá nuevamente')
      throw e
    }
    }
    throw new CatalogoError('CONFLICT', 'No se pudo asignar un código; intentá nuevamente')
  }

  async activate(productoId: string, usuarioId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado === 'ACTIVO') return producto
      if (producto.estado !== 'PENDIENTE_REVISION') throw new CatalogoError('CONFLICT', 'Solo un producto pendiente puede activarse')
      validateCatalogoInput({ ...producto, estado: 'ACTIVO' })
      validateCodigoPrefix(producto.categoria, producto.codigo)
      validateTransition(producto.estado, 'ACTIVO', producto.codigo, producto.categoria)
      const actualizado = await tx.depositoProducto.update({ where: { id: producto.id }, data: { estado: 'ACTIVO', activo: true } })
      await seedInitialInventory(tx, actualizado)
      await ensureMarketInventory(tx, actualizado, actualizado.mercadosHabilitados)
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
      validateCatalogoInput({ ...producto, estado: 'ACTIVO' })
      validateCodigoPrefix(producto.categoria, producto.codigo)
      validateTransition(producto.estado, 'ACTIVO', producto.codigo, producto.categoria)
      const actualizado = await tx.depositoProducto.update({ where: { id: producto.id }, data: { estado: 'ACTIVO', activo: true } })
      await seedInitialInventory(tx, actualizado)
      await ensureMarketInventory(tx, actualizado, actualizado.mercadosHabilitados)
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
    try {
      return await this.db.$transaction(async (tx) => {
        const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
        if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
        const categoria = input.categoria ?? producto.categoria
        const mercados = input.mercadosHabilitados ?? producto.mercadosHabilitados
        const codigo = input.codigo === undefined ? producto.codigo : normalizeCodigo(input.codigo)
        const presentacion = input.presentacion === undefined ? producto.presentacion : input.presentacion
        const corrigeMpComoMaterialEmpaque =
          producto.estado === 'ACTIVO' &&
          producto.categoria === 'droga' &&
          input.categoria === 'material_empaque'
        validateCatalogoUpdate(producto.estado, producto, input)
        validateCatalogoInput({ categoria, mercadosHabilitados: mercados, codigo, presentacion, ...(input.unidad !== undefined ? { unidad: input.unidad } : {}), estado: producto.estado })
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
          ...(input.categoria !== undefined || input.mercadosHabilitados !== undefined
            ? { mercado: categoria === 'estuche' ? mercados[0] : categoria === 'etiqueta' && producto.categoria === 'etiqueta' ? producto.mercado : null }
            : {}),
          ...(input.volumen !== undefined ? { volumen: input.volumen } : {}),
          ...(input.unidad !== undefined ? { unidad: categoria === 'etiqueta' ? normalizeEtiquetaUnit(input.unidad) : input.unidad } : {}),
          ...(input.variante !== undefined ? { variante: input.variante } : {}),
          ...(input.stockMinimo !== undefined ? { stockMinimo: input.stockMinimo } : {}),
        }
        if (corrigeMpComoMaterialEmpaque) {
          const lotes = await tx.inventarioDroga.findMany({ where: { productoId } })
          const cantidad = lotes.reduce((total, lote) => total + lote.cantidad, 0)
          if (!Number.isInteger(cantidad)) {
            throw new CatalogoError('CONFLICT', 'No se puede convertir una MP con saldo fraccionado a material de empaque')
          }
          await tx.inventarioMaterialEmpaque.upsert({
            where: { productoId },
            update: { articulo: producto.nombreCompleto, cantidad: { increment: cantidad } },
            create: { productoId, articulo: producto.nombreCompleto, cantidad },
          })
          await tx.inventarioDroga.deleteMany({ where: { productoId } })
        }
        const actualizado = await tx.depositoProducto.update({ where: { id: productoId }, data })
        if (input.nombreCompleto !== undefined && input.nombreCompleto !== producto.nombreCompleto) {
          if (actualizado.categoria === 'etiqueta') {
            await tx.inventarioEtiqueta.updateMany({ where: { productoId }, data: { articulo: actualizado.nombreCompleto } })
          } else if (actualizado.categoria === 'estuche') {
            await tx.inventarioEstuche.updateMany({ where: { productoId }, data: { articulo: actualizado.nombreCompleto } })
          }
        }
        if (actualizado.categoria === 'frasco' && input.nombreCompleto !== undefined) {
          const inventario = await tx.inventarioFrasco.findUnique({ where: { productoId } })
          if (inventario) {
            await tx.inventarioFrasco.update({
              where: { id: inventario.id },
              data: {
                articulo: actualizado.nombreCompleto,
              },
            })
          }
        }
        if (actualizado.activo && actualizado.categoria === 'etiqueta' && input.mercadosHabilitados) {
          const nuevosMercados = mercados.filter((mercado) => !producto.mercadosHabilitados.includes(mercado))
          if (nuevosMercados.length) {
            const conflicto = await tx.inventarioEtiqueta.findFirst({ where: { articulo: actualizado.nombreCompleto, mercado: { in: nuevosMercados }, OR: [{ productoId: null }, { productoId: { not: productoId } }] } })
            if (conflicto) throw new CatalogoError('CONFLICT', 'Ya existe una etiqueta con ese nombre en uno de los mercados seleccionados. Revisá la variante y la presentación.')
          }
        }
        // Si al editar se habilita un mercado nuevo, su fila de inventario debe
        // existir antes de que el operador pueda cargarle cantidad.
        if (actualizado.activo) {
          await seedInitialInventory(tx, actualizado)
          if (input.mercadosHabilitados) await ensureMarketInventory(tx, actualizado, mercados.filter((mercado) => !producto.mercadosHabilitados.includes(mercado)))
        }
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
    } catch (e: any) {
      if (e && typeof e === 'object' && e.code === 'P2002') throw new CatalogoError('CONFLICT', 'Ya existe un producto o artículo con ese nombre y mercado. Revisá la variante y la presentación antes de guardar.')
      throw e
    }
  }

  async deletePending(productoId: string) {
    return this.db.$transaction(async (tx) => {
      const producto = await tx.depositoProducto.findUnique({ where: { id: productoId } })
      if (!producto) throw new CatalogoError('NOT_FOUND', 'Producto no encontrado')
      if (producto.estado !== 'PENDIENTE_REVISION') throw new CatalogoError('CONFLICT', 'Solo se puede eliminar un producto pendiente de revisión')
      const [drogas, estuches, etiquetas, frascos, materialesEmpaque, actas, ordenes] = await Promise.all([
        tx.inventarioDroga.count({ where: { productoId } }),
        tx.inventarioEstuche.count({ where: { productoId } }),
        tx.inventarioEtiqueta.count({ where: { productoId } }),
        tx.inventarioFrasco.count({ where: { productoId } }),
        tx.inventarioMaterialEmpaque.count({ where: { productoId } }),
        tx.actaItem.count({ where: { productoId } }),
        tx.ordenProduccion.count({ where: { productoId } }),
      ])
      if (drogas + estuches + etiquetas + frascos + materialesEmpaque + actas + ordenes > 0) {
        throw new CatalogoError('CONFLICT', 'El producto tiene historial o relaciones operativas')
      }
      // A pending import only has catalog audit records. They are not operational history
      // and must be removed before the restrictive catalog FK permits the hard delete.
      await tx.auditoriaCatalogoProducto.deleteMany({ where: { productoId } })
      await tx.depositoProducto.delete({ where: { id: productoId } })
    })
  }

  async createImportPending(input: CatalogoCreateInput, usuarioId: string) {
    const { productos } = await this.createImportPendingBatch([input], usuarioId)
    return productos[0]
  }

  async createImportPendingBatch(inputs: CatalogoCreateInput[], usuarioId: string) {
    for (const input of inputs) {
      validateCatalogoInput({ ...input, estado: 'PENDIENTE_REVISION' })
      validateCodigoPrefix(input.categoria, input.codigo)
    }
    const codes = inputs.map((input) => normalizeCodigo(input.codigo)).filter((codigo): codigo is string => codigo !== null)
    if (new Set(codes).size !== codes.length) throw new CatalogoError('CONFLICT', 'El archivo contiene códigos duplicados')
    const existing = codes.length
      ? await this.db.depositoProducto.findMany({ where: { codigo: { in: codes } }, select: { codigo: true } })
      : []
    const existingNames = await this.db.depositoProducto.findMany({
      where: {
        OR: inputs.map(input => ({
          nombreCompleto: input.nombreCompleto,
          categoria: input.categoria,
          mercado: input.categoria === 'estuche' ? input.mercadosHabilitados?.[0] : null,
        }))
      },
      select: { nombreCompleto: true, categoria: true, mercado: true }
    })
    const existingCodes = new Set(existing.map((item) => item.codigo))
    const identityKey = (input: Pick<CatalogoCreateInput, 'nombreCompleto' | 'categoria' | 'mercadosHabilitados'>) =>
      `${input.nombreCompleto}|${input.categoria}|${input.categoria === 'estuche' ? input.mercadosHabilitados?.[0] ?? '' : ''}`
    const existingNamesSet = new Set(existingNames.map((item) => `${item.nombreCompleto}|${item.categoria}|${item.mercado ?? ''}`))
    const productos: Prisma.DepositoProductoGetPayload<null>[] = []
    let omitidosPorCarrera = 0
    for (const input of inputs) {
      const codigo = normalizeCodigo(input.codigo)
      if (codigo !== null && existingCodes.has(codigo)) {
        omitidosPorCarrera++
        continue
      }
      if (existingNamesSet.has(identityKey(input))) {
        omitidosPorCarrera++
        continue
      }
      existingNamesSet.add(identityKey(input))
      
      try {
        const producto = await this.db.$transaction(async (tx) => {
          const prod = await tx.depositoProducto.create({
            data: {
              ...input,
              codigo,
              estado: 'PENDIENTE_REVISION',
              activo: false,
              origen: OrigenProductoCatalogo.IMPORTACION,
              presentacion: input.presentacion ?? null,
              mercadosHabilitados: input.mercadosHabilitados ?? [],
              mercado: input.categoria === 'estuche' ? input.mercadosHabilitados?.[0] : null,
            },
          })
          await audit(tx, prod.id, usuarioId, 'IMPORTACION_CREADA', null, { estado: prod.estado, codigo: prod.codigo })
          return prod
        })
        productos.push(producto)
      } catch (e: any) {
        if (e && typeof e === 'object' && e.code === 'P2002') {
          omitidosPorCarrera++
          continue
        }
        throw e
      }
    }
    return { productos, omitidosPorCarrera }
  }
}

export class CatalogoError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message)
  }
}
