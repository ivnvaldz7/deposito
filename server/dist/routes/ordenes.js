"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const MERCADOS = Object.values(client_1.Mercado);
// ─── Schemas ──────────────────────────────────────────────────────────────────
const crearOrdenSchema = zod_1.z.object({
    categoria: zod_1.z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
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
// ─── POST /api/ordenes — crear (solicitante o encargado) ─────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('solicitante', 'encargado'), async (req, res) => {
    const result = crearOrdenSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { categoria, productoNombre, mercado, cantidad, urgencia } = result.data;
    if ((categoria === 'estuche' || categoria === 'etiqueta') && !mercado) {
        res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' });
        return;
    }
    try {
        const orden = await prisma_1.prisma.ordenProduccion.create({
            data: {
                solicitanteId: req.user.id,
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
            orderBy: [{ urgencia: 'desc' }, { createdAt: 'desc' }],
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
                const droga = await tx.inventarioDroga.findUnique({ where: { nombre: productoNombre } });
                if (!droga)
                    throw new Error('Producto no encontrado en inventario de drogas');
                if (droga.cantidad < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${droga.cantidad})`);
                await tx.inventarioDroga.update({
                    where: { nombre: productoNombre },
                    data: { cantidad: { decrement: cantidad } },
                });
            }
            else if (categoria === 'estuche') {
                if (!mercado)
                    throw new Error('El campo mercado es obligatorio para estuches');
                const estuche = await tx.inventarioEstuche.findUnique({
                    where: { articulo_mercado: { articulo: productoNombre, mercado } },
                });
                if (!estuche)
                    throw new Error('Producto no encontrado en inventario de estuches');
                if (estuche.cantidad < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${estuche.cantidad})`);
                await tx.inventarioEstuche.update({
                    where: { articulo_mercado: { articulo: productoNombre, mercado } },
                    data: { cantidad: { decrement: cantidad } },
                });
            }
            else if (categoria === 'etiqueta') {
                if (!mercado)
                    throw new Error('El campo mercado es obligatorio para etiquetas');
                const etiqueta = await tx.inventarioEtiqueta.findUnique({
                    where: { articulo_mercado: { articulo: productoNombre, mercado } },
                });
                if (!etiqueta)
                    throw new Error('Producto no encontrado en inventario de etiquetas');
                if (etiqueta.cantidad < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${etiqueta.cantidad})`);
                await tx.inventarioEtiqueta.update({
                    where: { articulo_mercado: { articulo: productoNombre, mercado } },
                    data: { cantidad: { decrement: cantidad } },
                });
            }
            else if (categoria === 'frasco') {
                const frasco = await tx.inventarioFrasco.findUnique({ where: { articulo: productoNombre } });
                if (!frasco)
                    throw new Error('Producto no encontrado en inventario de frascos');
                if (frasco.cantidadCajas < cantidad)
                    throw new Error(`Stock insuficiente (disponible: ${frasco.cantidadCajas} cajas)`);
                const nuevasCajas = frasco.cantidadCajas - cantidad;
                await tx.inventarioFrasco.update({
                    where: { articulo: productoNombre },
                    data: { cantidadCajas: nuevasCajas, total: nuevasCajas * frasco.unidadesPorCaja },
                });
            }
            // Movimiento de auditoría (negativo = egreso)
            await tx.movimiento.create({
                data: {
                    tipo: 'egreso_orden',
                    categoria,
                    productoNombre,
                    cantidad: -cantidad,
                    referenciaId: orden.id,
                    createdBy: req.user.id,
                },
            });
            return tx.ordenProduccion.update({
                where: { id },
                data: { estado: 'ejecutada' },
                include: {
                    solicitante: { select: { id: true, name: true, role: true } },
                    aprobador: { select: { id: true, name: true } },
                },
            });
        });
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
        if (ESTADOS_FINALES.includes(orden.estado)) {
            res.status(409).json({ message: `No se puede rechazar una orden en estado "${orden.estado}"` });
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
        res.json(updated);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=ordenes.js.map