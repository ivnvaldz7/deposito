"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const crearActaSchema = zod_1.z.object({
    fecha: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    notas: zod_1.z.string().max(500).optional(),
});
const MERCADOS = Object.values(client_1.Mercado);
const agregarItemSchema = zod_1.z.object({
    categoria: zod_1.z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoNombre: zod_1.z.string().min(2).max(100),
    lote: zod_1.z.string().min(1).max(50),
    cantidadIngresada: zod_1.z.number().int().positive(),
    mercado: zod_1.z.enum(MERCADOS).optional(),
});
const distribuirSchema = zod_1.z.object({
    cantidad: zod_1.z.number().int().positive(),
});
// ─── GET /api/actas — listar (auth) ──────────────────────────────────────────
router.get('/', auth_1.authenticate, async (_req, res) => {
    try {
        const actas = await prisma_1.prisma.acta.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { name: true } },
                _count: { select: { items: true } },
                items: {
                    select: { lote: true, productoNombre: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        res.json(actas);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/actas — crear (encargado) ─────────────────────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearActaSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { fecha, notas } = result.data;
    try {
        const acta = await prisma_1.prisma.acta.create({
            data: {
                fecha: new Date(fecha + 'T00:00:00.000Z'),
                notas: notas ?? null,
                createdBy: req.user.id,
            },
        });
        res.status(201).json(acta);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── GET /api/actas/:id — detalle (auth) ─────────────────────────────────────
router.get('/:id', auth_1.authenticate, async (req, res) => {
    const id = req.params['id'];
    try {
        const acta = await prisma_1.prisma.acta.findUnique({
            where: { id },
            include: {
                user: { select: { name: true } },
                items: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!acta) {
            res.status(404).json({ message: 'Acta no encontrada' });
            return;
        }
        res.json(acta);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/actas/:id/items — agregar item (encargado) ────────────────────
router.post('/:id/items', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const actaId = req.params['id'];
    const result = agregarItemSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { categoria, mercado } = result.data;
    if ((categoria === 'estuche' || categoria === 'etiqueta') && !mercado) {
        res.status(400).json({ message: 'El campo mercado es obligatorio para estuches y etiquetas' });
        return;
    }
    try {
        const actaExists = await prisma_1.prisma.acta.findUnique({ where: { id: actaId } });
        if (!actaExists) {
            res.status(404).json({ message: 'Acta no encontrada' });
            return;
        }
        const item = await prisma_1.prisma.actaItem.create({
            data: {
                actaId,
                categoria: result.data.categoria,
                productoNombre: result.data.productoNombre,
                lote: result.data.lote,
                cantidadIngresada: result.data.cantidadIngresada,
                mercado: result.data.mercado ?? null,
            },
        });
        res.status(201).json(item);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/actas/:id/items/:itemId/distribuir (encargado) ────────────────
router.post('/:id/items/:itemId/distribuir', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const actaId = req.params['id'];
    const itemId = req.params['itemId'];
    const result = distribuirSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { cantidad } = result.data;
    try {
        const { item: updatedItem, acta: updatedActa } = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Fetch item y validar que pertenece al acta
            const item = await tx.actaItem.findUnique({ where: { id: itemId } });
            if (!item || item.actaId !== actaId) {
                throw new Error('Item no encontrado');
            }
            const restante = item.cantidadIngresada - item.cantidadDistribuida;
            if (cantidad > restante) {
                throw new Error(`Cantidad excede lo disponible (restante: ${restante})`);
            }
            // 2. Actualizar inventario según categoría
            if (item.categoria === 'droga') {
                await tx.inventarioDroga.upsert({
                    where: { nombre: item.productoNombre },
                    update: { cantidad: { increment: cantidad } },
                    create: { nombre: item.productoNombre, cantidad },
                });
            }
            else if (item.categoria === 'estuche') {
                if (!item.mercado) {
                    throw new Error('El item no tiene mercado asignado');
                }
                const existing = await tx.inventarioEstuche.findUnique({
                    where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
                });
                if (!existing) {
                    throw new Error('Producto no encontrado en inventario de estuche');
                }
                await tx.inventarioEstuche.update({
                    where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
                    data: { cantidad: { increment: cantidad } },
                });
            }
            else if (item.categoria === 'etiqueta') {
                if (!item.mercado) {
                    throw new Error('El item no tiene mercado asignado');
                }
                const existing = await tx.inventarioEtiqueta.findUnique({
                    where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
                });
                if (!existing) {
                    throw new Error('Producto no encontrado en inventario de etiqueta');
                }
                await tx.inventarioEtiqueta.update({
                    where: { articulo_mercado: { articulo: item.productoNombre, mercado: item.mercado } },
                    data: { cantidad: { increment: cantidad } },
                });
            }
            else if (item.categoria === 'frasco') {
                const frasco = await tx.inventarioFrasco.findUnique({
                    where: { articulo: item.productoNombre },
                });
                if (!frasco) {
                    throw new Error('Producto no encontrado en inventario de frasco');
                }
                const nuevasCajas = frasco.cantidadCajas + cantidad;
                await tx.inventarioFrasco.update({
                    where: { articulo: item.productoNombre },
                    data: { cantidadCajas: nuevasCajas, total: nuevasCajas * frasco.unidadesPorCaja },
                });
            }
            // 3. Crear movimiento de auditoría
            await tx.movimiento.create({
                data: {
                    tipo: 'ingreso_acta',
                    categoria: item.categoria,
                    productoNombre: item.productoNombre,
                    cantidad,
                    referenciaId: itemId,
                    createdBy: req.user.id,
                },
            });
            // 4. Actualizar cantidadDistribuida del item
            const item2 = await tx.actaItem.update({
                where: { id: itemId },
                data: { cantidadDistribuida: { increment: cantidad } },
            });
            // 5. Recalcular estado del acta
            const todosItems = await tx.actaItem.findMany({ where: { actaId } });
            const todosCompletos = todosItems.every((i) => i.cantidadDistribuida >= i.cantidadIngresada);
            const hayDistribucion = todosItems.some((i) => i.cantidadDistribuida > 0);
            const nuevoEstado = todosCompletos
                ? 'completada'
                : hayDistribucion
                    ? 'parcial'
                    : 'pendiente';
            const acta2 = await tx.acta.update({
                where: { id: actaId },
                data: { estado: nuevoEstado },
            });
            return { item: item2, acta: acta2 };
        });
        res.json({ item: updatedItem, acta: updatedActa });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error interno del servidor';
        res.status(400).json({ message: msg });
    }
});
exports.default = router;
//# sourceMappingURL=actas.js.map