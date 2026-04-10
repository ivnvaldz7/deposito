"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const sse_manager_1 = require("../lib/sse-manager");
const router = (0, express_1.Router)();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const crearActaSchema = zod_1.z.object({
    fecha: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    notas: zod_1.z.string().max(500).optional(),
});
const MERCADOS = Object.values(client_1.Mercado);
const CONDICIONES_EMBALAJE = Object.values(client_1.CondicionEmbalaje);
const agregarItemSchema = zod_1.z
    .object({
    categoria: zod_1.z.enum(['droga', 'estuche', 'etiqueta', 'frasco']),
    productoNombre: zod_1.z.string().min(2).max(100),
    lote: zod_1.z.string().trim().max(50).optional(),
    vencimiento: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    temperaturaTransporte: zod_1.z.string().trim().max(50).optional(),
    condicionEmbalaje: zod_1.z.enum(CONDICIONES_EMBALAJE).optional(),
    observacionesCalidad: zod_1.z.string().trim().max(1000).optional(),
    aprobadoCalidad: zod_1.z.boolean().optional(),
    cantidadIngresada: zod_1.z.number().int().positive(),
    mercado: zod_1.z.enum(MERCADOS).optional(),
})
    .superRefine((data, ctx) => {
    if (data.categoria === 'droga' && !data.lote?.trim()) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'El lote es obligatorio para drogas',
            path: ['lote'],
        });
    }
});
const distribuirSchema = zod_1.z.object({
    cantidad: zod_1.z.number().int().positive(),
    loteId: zod_1.z.string().uuid().optional(), // override FIFO manual — id of InventarioDroga record
    justificacion: zod_1.z.string().max(300).optional(), // requerido cuando se usa override
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
                    select: {
                        lote: true,
                        productoNombre: true,
                        temperaturaTransporte: true,
                        condicionEmbalaje: true,
                        observacionesCalidad: true,
                        aprobadoCalidad: true,
                    },
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
        sse_manager_1.sseManager.broadcastGlobal({
            tipo: 'ingreso_creado',
            mensaje: `Nuevo acta de ingreso creada por ${req.user.name}`,
            datos: { actaId: acta.id, fecha, createdBy: req.user.name },
            timestamp: new Date().toISOString(),
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
                lote: result.data.lote?.trim() || '',
                vencimiento: result.data.vencimiento
                    ? new Date(result.data.vencimiento + 'T00:00:00.000Z')
                    : null,
                temperaturaTransporte: result.data.temperaturaTransporte?.trim() || null,
                condicionEmbalaje: result.data.condicionEmbalaje ?? null,
                observacionesCalidad: result.data.observacionesCalidad?.trim() || null,
                aprobadoCalidad: result.data.aprobadoCalidad ?? false,
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
                // Upsert en inventario usando (nombre, lote) como clave
                await tx.inventarioDroga.upsert({
                    where: { nombre_lote: { nombre: item.productoNombre, lote: item.lote } },
                    update: {
                        cantidad: { increment: cantidad },
                        // Actualizar vencimiento si aún no tenía uno
                        ...(item.vencimiento ? { vencimiento: item.vencimiento } : {}),
                    },
                    create: {
                        nombre: item.productoNombre,
                        lote: item.lote,
                        vencimiento: item.vencimiento,
                        cantidad,
                    },
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
                    lote: item.categoria === 'droga' ? item.lote : null,
                    cantidad,
                    referenciaId: itemId,
                    referenciaTipo: 'acta_item',
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
        // Emitir stock_actualizado globalmente
        sse_manager_1.sseManager.broadcastGlobal({
            tipo: 'stock_actualizado',
            mensaje: `Stock de ${updatedItem.productoNombre} actualizado (+${cantidad})`,
            datos: {
                producto: updatedItem.productoNombre,
                categoria: updatedItem.categoria,
                cantidad,
                tipo: 'ingreso',
            },
            timestamp: new Date().toISOString(),
        });
        // Emitir vencimiento_proximo si droga con vencimiento en <30 días
        if (updatedItem.categoria === 'droga' && updatedItem.vencimiento) {
            const diasRestantes = Math.floor((new Date(updatedItem.vencimiento).getTime() - Date.now()) / 86400000);
            if (diasRestantes <= 30) {
                sse_manager_1.sseManager.broadcastGlobal({
                    tipo: 'vencimiento_proximo',
                    mensaje: `"${updatedItem.productoNombre}" (lote ${updatedItem.lote}) vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}`,
                    datos: {
                        producto: updatedItem.productoNombre,
                        lote: updatedItem.lote,
                        vencimiento: updatedItem.vencimiento,
                        diasRestantes,
                    },
                    timestamp: new Date().toISOString(),
                });
            }
        }
        res.json({ item: updatedItem, acta: updatedActa });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Error interno del servidor';
        res.status(400).json({ message: msg });
    }
});
exports.default = router;
//# sourceMappingURL=actas.js.map