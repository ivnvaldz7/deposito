"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const crearDrogaSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(2).max(100),
    lote: zod_1.z.string().min(1).max(50).optional(),
    vencimiento: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
    cantidad: zod_1.z.number().int().min(0).default(0),
});
const editarDrogaSchema = zod_1.z
    .object({
    nombre: zod_1.z.string().min(2).max(100).optional(),
    lote: zod_1.z.string().min(1).max(50).optional().nullable(),
    vencimiento: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    cantidad: zod_1.z.number().int().min(0).optional(),
})
    .refine((d) => d.nombre !== undefined ||
    d.lote !== undefined ||
    d.vencimiento !== undefined ||
    d.cantidad !== undefined, { message: 'Al menos un campo requerido' });
// ─── GET /api/drogas — listar (con filtro opcional por nombre) ─────────────────
router.get('/', auth_1.authenticate, async (req, res) => {
    const nombreFilter = typeof req.query['nombre'] === 'string' ? req.query['nombre'] : undefined;
    try {
        const drogas = await prisma_1.prisma.inventarioDroga.findMany({
            where: nombreFilter ? { nombre: nombreFilter } : undefined,
            orderBy: [{ nombre: 'asc' }, { vencimiento: 'asc' }],
        });
        res.json(drogas);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── GET /api/drogas/por-vencer?dias=30 ───────────────────────────────────────
router.get('/por-vencer', auth_1.authenticate, async (req, res) => {
    const dias = typeof req.query['dias'] === 'string' ? parseInt(req.query['dias'], 10) : 30;
    const validDias = isNaN(dias) || dias <= 0 ? 30 : Math.min(dias, 365);
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + validDias);
    limitDate.setUTCHours(23, 59, 59, 999);
    try {
        const drogas = await prisma_1.prisma.inventarioDroga.findMany({
            where: {
                vencimiento: { lte: limitDate },
                cantidad: { gt: 0 },
            },
            orderBy: { vencimiento: 'asc' },
        });
        res.json(drogas);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/drogas — crear nueva (encargado) ───────────────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearDrogaSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { nombre, lote, vencimiento, cantidad } = result.data;
    const loteValue = lote ?? null;
    const vencimientoValue = vencimiento ? new Date(vencimiento + 'T00:00:00.000Z') : null;
    try {
        // For null lote: enforce app-level uniqueness (PG unique doesn't catch NULL+NULL)
        if (!loteValue) {
            const existing = await prisma_1.prisma.inventarioDroga.findFirst({
                where: { nombre, lote: null },
            });
            if (existing) {
                res.status(409).json({ message: 'Ya existe una droga con ese nombre sin lote específico' });
                return;
            }
        }
        const droga = await prisma_1.prisma.inventarioDroga.create({
            data: { nombre, lote: loteValue, vencimiento: vencimientoValue, cantidad },
        });
        res.status(201).json(droga);
    }
    catch (err) {
        if (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            err.code === 'P2002') {
            res.status(409).json({ message: `Ya existe una droga "${nombre}" con lote "${loteValue}"` });
            return;
        }
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── PUT /api/drogas/:id — editar registro (encargado) ────────────────────────
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = editarDrogaSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { nombre, lote, vencimiento, cantidad } = result.data;
    try {
        const droga = await prisma_1.prisma.inventarioDroga.update({
            where: { id },
            data: {
                ...(nombre !== undefined ? { nombre } : {}),
                ...(lote !== undefined ? { lote: lote ?? null } : {}),
                ...(vencimiento !== undefined
                    ? { vencimiento: vencimiento ? new Date(vencimiento + 'T00:00:00.000Z') : null }
                    : {}),
                ...(cantidad !== undefined ? { cantidad } : {}),
            },
        });
        res.json(droga);
    }
    catch {
        res.status(404).json({ message: 'Droga no encontrada' });
    }
});
// ─── DELETE /api/drogas/:id — eliminar (encargado) ───────────────────────────
router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        await prisma_1.prisma.inventarioDroga.delete({ where: { id } });
        res.status(204).send();
    }
    catch {
        res.status(404).json({ message: 'Droga no encontrada' });
    }
});
exports.default = router;
//# sourceMappingURL=drogas.js.map