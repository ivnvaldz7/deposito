"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const sse_manager_1 = require("../lib/sse-manager");
const producto_catalogo_1 = require("../lib/producto-catalogo");
const router = (0, express_1.Router)();
const MERCADOS = Object.values(client_1.Mercado);
// ─── Schemas ──────────────────────────────────────────────────────────────────
const crearOrdenSchema = zod_1.z.object({
    categoria: zod_1.z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoId: zod_1.z.string().uuid().optional(),
    productoNombre: zod_1.z.string().min(2).max(200),
    mercado: zod_1.z.enum(MERCADOS).optional(),
    cantidad: zod_1.z.number().int().positive(),
    urgencia: zod_1.z.enum(['normal', 'urgente']).default('normal'),
});
const rechazarSchema = zod_1.z.object({
    motivoRechazo: zod_1.z.string().min(5).max(500),
});
// Estados finales que no permiten más transiciones
const ESTADOS_FINALES = ['completada', 'rechazada'];
function normalizeForMatch(str) {
    return (0, producto_catalogo_1.resolveCanonicalProductName)(str);
}
// Helper: verifica si el stock bajó del threshold después de un egreso
async function checkStockBajo(categoria, productoNombre, mercado) {
    try {
        if (categoria === 'droga') {
            // Sumar total de todos los lotes del producto
            const agg = await prisma_1.prisma.inventarioDroga.aggregate({
                where: { nombre: productoNombre },
                _sum: { cantidad: true },
            });
            const total = agg._sum.cantidad ?? 0;
            if (total < sse_manager_1.STOCK_BAJO_THRESHOLD)
                return total;
        }
        else if (categoria === 'estuche' && mercado) {
            const e = await prisma_1.prisma.inventarioEstuche.findUnique({
                where: { articulo_mercado: { articulo: productoNombre, mercado } },
            });
            if (e && e.cantidad < sse_manager_1.STOCK_BAJO_THRESHOLD)
                return e.cantidad;
        }
        else if (categoria === 'etiqueta' && mercado) {
            const e = await prisma_1.prisma.inventarioEtiqueta.findUnique({
                where: { articulo_mercado: { articulo: productoNombre, mercado } },
            });
            if (e && e.cantidad < sse_manager_1.STOCK_BAJO_THRESHOLD)
                return e.cantidad;
        }
        else if (categoria === 'frasco') {
            const f = await prisma_1.prisma.inventarioFrasco.findUnique({ where: { articulo: productoNombre } });
            if (f && f.cantidadCajas < sse_manager_1.STOCK_BAJO_FRASCOS_THRESHOLD)
                return f.cantidadCajas;
        }
    }
    catch { /* no crítico */ }
    return null;
}
// ─── POST /api/ordenes — crear (solicitante o encargado) ─────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('solicitante', 'encargado'), async (req, res) => {
    const result = crearOrdenSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { categoria, productoId, mercado, cantidad, urgencia } = result.data;
    let { productoNombre } = result.data;
    if ((categoria === 'estuche' || categoria === 'etiqueta') && !mercado) {
        res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' });
        return;
    }
    // Si viene productoId, validar en catálogo y usar nombreCompleto
    if (productoId) {
        const producto = await prisma_1.prisma.producto.findUnique({ where: { id: productoId } });
        if (!producto || producto.categoria !== categoria) {
            res.status(400).json({ message: 'Producto no encontrado en el catálogo o categoría incorrecta' });
            return;
        }
        productoNombre = producto.nombreCompleto;
    }
    try {
        const orden = await prisma_1.prisma.ordenProduccion.create({
            data: {
                solicitanteId: req.user.id,
                productoId: productoId ?? null,
                categoria,
                productoNombre,
                mercado: mercado ?? null,
                cantidad,
                urgencia,
            },
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        sse_manager_1.sseManager.broadcastToRoles({
            tipo: 'orden_creada',
            mensaje: `Nueva orden${urgencia === 'urgente' ? ' URGENTE' : ''}: ${productoNombre} (×${cantidad}) — ${req.user.name}`,
            datos: {
                ordenId: orden.id,
                producto: productoNombre,
                cantidad,
                urgencia,
                solicitante: req.user.name,
            },
            timestamp: new Date().toISOString(),
        }, ['encargado']);
        res.status(201).json(orden);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── GET /api/ordenes — listar (auth) ────────────────────────────────────────
router.get('/', auth_1.authenticate, async (req, res) => {
    const { estado } = req.query;
    const estadoFilter = typeof estado === 'string' ? estado : undefined;
    // Solicitante solo ve sus propias órdenes
    const roleFilter = req.user?.role === 'solicitante'
        ? { solicitanteId: req.user.id }
        : {};
    const estadoWhere = estadoFilter ? { estado: estadoFilter } : {};
    try {
        const ordenes = await prisma_1.prisma.ordenProduccion.findMany({
            where: { ...roleFilter, ...estadoWhere },
            orderBy: [{ createdAt: 'desc' }],
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        res.json(ordenes);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── GET /api/ordenes/:id — detalle ──────────────────────────────────────────
router.get('/:id', auth_1.authenticate, async (req, res) => {
    const id = req.params['id'];
    try {
        const orden = await prisma_1.prisma.ordenProduccion.findUnique({
            where: { id },
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' });
            return;
        }
        // Solicitante solo puede ver sus propias órdenes
        if (req.user?.role === 'solicitante' && orden.solicitanteId !== req.user.id) {
            res.status(403).json({ message: 'No autorizado' });
            return;
        }
        res.json(orden);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── PUT /api/ordenes/:id/aprobar — solo encargado ───────────────────────────
router.put('/:id/aprobar', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        const orden = await prisma_1.prisma.ordenProduccion.findUnique({ where: { id } });
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' });
            return;
        }
        if (ESTADOS_FINALES.includes(orden.estado)) {
            res.status(409).json({ message: `No se puede aprobar una orden en estado "${orden.estado}"` });
            return;
        }
        if (orden.estado !== 'solicitada') {
            res.status(409).json({ message: `La orden ya está en estado "${orden.estado}"` });
            return;
        }
        const updated = await prisma_1.prisma.ordenProduccion.update({
            where: { id },
            data: { estado: 'aprobada', aprobadoPor: req.user.id },
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        sse_manager_1.sseManager.broadcastToUser({
            tipo: 'orden_actualizada',
            mensaje: `Tu orden de ${updated.productoNombre} fue aprobada`,
            datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'aprobada', aprobadoPor: req.user.name },
            timestamp: new Date().toISOString(),
        }, updated.solicitanteId);
        res.json(updated);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── PUT /api/ordenes/:id/ejecutar — descuenta inventario, crea movimiento ───
router.put('/:id/ejecutar', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        const orden = await prisma_1.prisma.ordenProduccion.findUnique({ where: { id } });
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' });
            return;
        }
        if (ESTADOS_FINALES.includes(orden.estado)) {
            res.status(409).json({ message: `No se puede ejecutar una orden en estado "${orden.estado}"` });
            return;
        }
        if (orden.estado !== 'aprobada') {
            res.status(409).json({ message: 'La orden debe estar aprobada antes de ejecutarse' });
            return;
        }
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const { categoria, productoNombre, mercado, cantidad } = orden;
            if (categoria === 'droga') {
                // FIFO: descontar empezando por el lote con vencimiento más próximo
                const drogas_where = orden.productoId
                    ? { productoId: orden.productoId, cantidad: { gt: 0 } }
                    : { nombre: productoNombre, cantidad: { gt: 0 } };
                const lotes = await tx.inventarioDroga.findMany({ where: drogas_where });
                // Ordenar en app: vencimiento no-null ASC primero, luego null (sin vencimiento)
                const sorted = [...lotes].sort((a, b) => {
                    if (!a.vencimiento && !b.vencimiento)
                        return 0;
                    if (!a.vencimiento)
                        return 1;
                    if (!b.vencimiento)
                        return -1;
                    return new Date(a.vencimiento).getTime() - new Date(b.vencimiento).getTime();
                });
                const totalDisponible = sorted.reduce((s, l) => s + l.cantidad, 0);
                if (totalDisponible < cantidad) {
                    throw new Error(`Stock insuficiente de "${productoNombre}" (disponible: ${totalDisponible})`);
                }
                let restante = cantidad;
                const lotesMov = [];
                for (const lote of sorted) {
                    if (restante <= 0)
                        break;
                    const tomar = Math.min(lote.cantidad, restante);
                    await tx.inventarioDroga.update({
                        where: { id: lote.id },
                        data: { cantidad: { decrement: tomar } },
                    });
                    lotesMov.push({ lote: lote.lote, decrementado: tomar });
                    restante -= tomar;
                }
                // Crear un movimiento por lote usado
                for (const { lote: loteUsado, decrementado } of lotesMov) {
                    await tx.movimiento.create({
                        data: {
                            tipo: 'egreso_orden',
                            categoria,
                            productoNombre,
                            lote: loteUsado,
                            cantidad: -decrementado,
                            referenciaId: orden.id,
                            referenciaTipo: 'orden',
                            createdBy: req.user.id,
                        },
                    });
                }
            }
            else if (categoria === 'estuche') {
                if (!mercado)
                    throw new Error('El campo mercado es obligatorio para estuches');
                const estuche = orden.productoId
                    ? await tx.inventarioEstuche.findFirst({ where: { productoId: orden.productoId, mercado } })
                    : null;
                let estucheResolved = estuche;
                if (!estucheResolved) {
                    const buscar = normalizeForMatch(productoNombre);
                    const candidatos = await tx.inventarioEstuche.findMany({ where: { mercado } });
                    estucheResolved = candidatos.find((row) => normalizeForMatch(row.articulo) === buscar) ?? null;
                }
                if (!estucheResolved)
                    throw new Error('Producto no encontrado en inventario de estuches');
                if (estucheResolved.cantidad < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${estucheResolved.cantidad})`);
                await tx.inventarioEstuche.update({
                    where: { id: estucheResolved.id },
                    data: { cantidad: { decrement: cantidad } },
                });
            }
            else if (categoria === 'etiqueta') {
                if (!mercado)
                    throw new Error('El campo mercado es obligatorio para etiquetas');
                const etiqueta = orden.productoId
                    ? await tx.inventarioEtiqueta.findFirst({ where: { productoId: orden.productoId, mercado } })
                    : null;
                let etiquetaResolved = etiqueta;
                if (!etiquetaResolved) {
                    const buscar = normalizeForMatch(productoNombre);
                    const candidatos = await tx.inventarioEtiqueta.findMany({ where: { mercado } });
                    etiquetaResolved = candidatos.find((row) => normalizeForMatch(row.articulo) === buscar) ?? null;
                }
                if (!etiquetaResolved)
                    throw new Error('Producto no encontrado en inventario de etiquetas');
                if (etiquetaResolved.cantidad < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${etiquetaResolved.cantidad})`);
                await tx.inventarioEtiqueta.update({
                    where: { id: etiquetaResolved.id },
                    data: { cantidad: { decrement: cantidad } },
                });
            }
            else if (categoria === 'frasco') {
                const frasco = orden.productoId
                    ? await tx.inventarioFrasco.findFirst({ where: { productoId: orden.productoId } })
                    : null;
                let frascoResolved = frasco;
                if (!frascoResolved) {
                    const buscar = normalizeForMatch(productoNombre);
                    const candidatos = await tx.inventarioFrasco.findMany();
                    frascoResolved = candidatos.find((row) => normalizeForMatch(row.articulo) === buscar) ?? null;
                }
                if (!frascoResolved)
                    throw new Error('Producto no encontrado en inventario de frascos');
                if (frascoResolved.cantidadCajas < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${frascoResolved.cantidadCajas} cajas)`);
                const nuevasCajas = frascoResolved.cantidadCajas - cantidad;
                await tx.inventarioFrasco.update({
                    where: { id: frascoResolved.id },
                    data: { cantidadCajas: nuevasCajas, total: nuevasCajas * frascoResolved.unidadesPorCaja },
                });
            }
            // Movimiento de auditoría para categorías no-droga (drogas crean movimientos en el loop FIFO)
            if (categoria !== 'droga') {
                await tx.movimiento.create({
                    data: {
                        tipo: 'egreso_orden',
                        categoria,
                        productoNombre,
                        cantidad: -cantidad,
                        referenciaId: orden.id,
                        referenciaTipo: 'orden',
                        createdBy: req.user.id,
                    },
                });
            }
            return tx.ordenProduccion.update({
                where: { id },
                data: { estado: 'ejecutada' },
                include: {
                    solicitante: { select: { id: true, name: true, role: true } },
                    aprobador: { select: { id: true, name: true } },
                },
            });
        });
        const ts = new Date().toISOString();
        sse_manager_1.sseManager.broadcastGlobal({
            tipo: 'stock_actualizado',
            mensaje: `Stock de ${orden.productoNombre} actualizado (−${orden.cantidad})`,
            datos: { producto: orden.productoNombre, categoria: orden.categoria, cantidad: orden.cantidad, tipo: 'egreso' },
            timestamp: ts,
        });
        sse_manager_1.sseManager.broadcastToUser({
            tipo: 'orden_actualizada',
            mensaje: `Tu orden de ${orden.productoNombre} fue ejecutada`,
            datos: { ordenId: updated.id, producto: orden.productoNombre, estado: 'ejecutada' },
            timestamp: ts,
        }, updated.solicitanteId);
        const nuevoStock = await checkStockBajo(orden.categoria, orden.productoNombre, orden.mercado);
        if (nuevoStock !== null) {
            sse_manager_1.sseManager.broadcastGlobal({
                tipo: 'stock_bajo',
                mensaje: `Stock bajo: ${orden.productoNombre} (${nuevoStock} restantes)`,
                datos: { producto: orden.productoNombre, categoria: orden.categoria, cantidad: nuevoStock },
                timestamp: ts,
            });
        }
        res.json(updated);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error interno del servidor';
        res.status(400).json({ message: msg });
    }
});
// ─── PUT /api/ordenes/:id/rechazar — solo encargado, requiere motivo ──────────
router.put('/:id/rechazar', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = rechazarSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'El motivo de rechazo es obligatorio (mínimo 5 caracteres)' });
        return;
    }
    try {
        const orden = await prisma_1.prisma.ordenProduccion.findUnique({ where: { id } });
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' });
            return;
        }
        if (orden.estado !== 'solicitada' && orden.estado !== 'aprobada') {
            res.status(400).json({ message: 'No se puede rechazar una orden ya ejecutada' });
            return;
        }
        const updated = await prisma_1.prisma.ordenProduccion.update({
            where: { id },
            data: {
                estado: 'rechazada',
                motivoRechazo: result.data.motivoRechazo,
                aprobadoPor: req.user.id,
            },
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        sse_manager_1.sseManager.broadcastToUser({
            tipo: 'orden_actualizada',
            mensaje: `Tu orden de ${updated.productoNombre} fue rechazada`,
            datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'rechazada', motivo: updated.motivoRechazo },
            timestamp: new Date().toISOString(),
        }, updated.solicitanteId);
        res.json(updated);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── PUT /api/ordenes/:id/completar — de ejecutada a completada ──────────────
router.put('/:id/completar', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        const orden = await prisma_1.prisma.ordenProduccion.findUnique({ where: { id } });
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' });
            return;
        }
        if (orden.estado !== 'ejecutada') {
            res.status(409).json({ message: `Solo se pueden completar órdenes ejecutadas (estado actual: "${orden.estado}")` });
            return;
        }
        const updated = await prisma_1.prisma.ordenProduccion.update({
            where: { id },
            data: { estado: 'completada' },
            include: {
                solicitante: { select: { id: true, name: true, role: true } },
                aprobador: { select: { id: true, name: true } },
            },
        });
        sse_manager_1.sseManager.broadcastToUser({
            tipo: 'orden_actualizada',
            mensaje: `Tu orden de ${updated.productoNombre} fue marcada como completada`,
            datos: { ordenId: updated.id, producto: updated.productoNombre, estado: 'completada' },
            timestamp: new Date().toISOString(),
        }, updated.solicitanteId);
        res.json(updated);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=ordenes.js.map