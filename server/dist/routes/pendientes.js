"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const crearPendienteSchema = zod_1.z.object({
    articulo: zod_1.z.string().min(2).max(150),
    cantidad: zod_1.z.number().int().positive(),
    destino: zod_1.z.string().min(2).max(200),
    fechaEnvio: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)'),
    fechaRetornoEstimada: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notas: zod_1.z.string().max(500).optional(),
});
const editarPendienteSchema = zod_1.z
    .object({
    articulo: zod_1.z.string().min(2).max(150).optional(),
    cantidad: zod_1.z.number().int().positive().optional(),
    destino: zod_1.z.string().min(2).max(200).optional(),
    fechaEnvio: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fechaRetornoEstimada: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notas: zod_1.z.string().max(500).nullable().optional(),
})
    .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Al menos un campo requerido',
});
const include = { user: { select: { name: true } } };
// ─── GET /api/pendientes ──────────────────────────────────────────────────────
router.get('/', auth_1.authenticate, async (req, res) => {
    const { estado } = req.query;
    const where = {};
    if (estado === 'en_esterilizacion' || estado === 'recibido') {
        where.estado = estado;
    }
    try {
        const pendientes = await prisma_1.prisma.insumoPendiente.findMany({
            where,
            orderBy: { fechaEnvio: 'desc' },
            include,
        });
        res.json(pendientes);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/pendientes ─────────────────────────────────────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearPendienteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, cantidad, destino, fechaEnvio, fechaRetornoEstimada, notas } = result.data;
    try {
        const pendiente = await prisma_1.prisma.insumoPendiente.create({
            data: {
                articulo,
                cantidad,
                destino,
                fechaEnvio: new Date(fechaEnvio + 'T00:00:00.000Z'),
                fechaRetornoEstimada: fechaRetornoEstimada
                    ? new Date(fechaRetornoEstimada + 'T00:00:00.000Z')
                    : null,
                notas: notas ?? null,
                createdBy: req.user.id,
            },
            include,
        });
        res.status(201).json(pendiente);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── PUT /api/pendientes/:id ──────────────────────────────────────────────────
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = editarPendienteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, cantidad, destino, fechaEnvio, fechaRetornoEstimada, notas } = result.data;
    try {
        const existing = await prisma_1.prisma.insumoPendiente.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ message: 'Pendiente no encontrado' });
            return;
        }
        const pendiente = await prisma_1.prisma.insumoPendiente.update({
            where: { id },
            data: {
                ...(articulo !== undefined ? { articulo } : {}),
                ...(cantidad !== undefined ? { cantidad } : {}),
                ...(destino !== undefined ? { destino } : {}),
                ...(fechaEnvio !== undefined
                    ? { fechaEnvio: new Date(fechaEnvio + 'T00:00:00.000Z') }
                    : {}),
                ...(fechaRetornoEstimada !== undefined
                    ? {
                        fechaRetornoEstimada: fechaRetornoEstimada
                            ? new Date(fechaRetornoEstimada + 'T00:00:00.000Z')
                            : null,
                    }
                    : {}),
                ...(notas !== undefined ? { notas } : {}),
            },
            include,
        });
        res.json(pendiente);
    }
    catch {
        res.status(404).json({ message: 'Pendiente no encontrado' });
    }
});
// ─── PUT /api/pendientes/:id/recibir ─────────────────────────────────────────
router.put('/:id/recibir', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        const existing = await prisma_1.prisma.insumoPendiente.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ message: 'Pendiente no encontrado' });
            return;
        }
        if (existing.estado === 'recibido') {
            res.status(409).json({ message: 'El pendiente ya está marcado como recibido' });
            return;
        }
        const pendiente = await prisma_1.prisma.insumoPendiente.update({
            where: { id },
            data: {
                estado: 'recibido',
                fechaRecibido: new Date(),
            },
            include,
        });
        res.json(pendiente);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=pendientes.js.map