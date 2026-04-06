"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const crearFrascoSchema = zod_1.z.object({
    articulo: zod_1.z.string().min(2).max(150),
    unidadesPorCaja: zod_1.z.number().int().positive(),
    cantidadCajas: zod_1.z.number().int().min(0),
});
const editarFrascoSchema = zod_1.z
    .object({
    articulo: zod_1.z.string().min(2).max(150).optional(),
    unidadesPorCaja: zod_1.z.number().int().positive().optional(),
    cantidadCajas: zod_1.z.number().int().min(0).optional(),
})
    .refine((d) => d.articulo !== undefined || d.unidadesPorCaja !== undefined || d.cantidadCajas !== undefined, { message: 'Al menos un campo requerido' });
// GET /api/frascos
router.get('/', auth_1.authenticate, async (_req, res) => {
    try {
        const frascos = await prisma_1.prisma.inventarioFrasco.findMany({
            orderBy: { articulo: 'asc' },
        });
        res.json(frascos);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/frascos
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearFrascoSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, unidadesPorCaja, cantidadCajas } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioFrasco.findUnique({ where: { articulo } });
        if (existing) {
            res.status(409).json({ message: 'Ya existe ese artículo' });
            return;
        }
        const frasco = await prisma_1.prisma.inventarioFrasco.create({
            data: {
                articulo,
                unidadesPorCaja,
                cantidadCajas,
                total: unidadesPorCaja * cantidadCajas,
            },
        });
        res.status(201).json(frasco);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// PUT /api/frascos/:id
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = editarFrascoSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, unidadesPorCaja, cantidadCajas } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioFrasco.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ message: 'Frasco no encontrado' });
            return;
        }
        if (articulo !== undefined && articulo !== existing.articulo) {
            const conflict = await prisma_1.prisma.inventarioFrasco.findFirst({
                where: { articulo, NOT: { id } },
            });
            if (conflict) {
                res.status(409).json({ message: 'Ya existe un frasco con ese artículo' });
                return;
            }
        }
        const newUnidades = unidadesPorCaja ?? existing.unidadesPorCaja;
        const newCajas = cantidadCajas ?? existing.cantidadCajas;
        const frasco = await prisma_1.prisma.inventarioFrasco.update({
            where: { id },
            data: {
                ...(articulo !== undefined ? { articulo } : {}),
                ...(unidadesPorCaja !== undefined ? { unidadesPorCaja } : {}),
                ...(cantidadCajas !== undefined ? { cantidadCajas } : {}),
                total: newUnidades * newCajas,
            },
        });
        res.json(frasco);
    }
    catch {
        res.status(404).json({ message: 'Frasco no encontrado' });
    }
});
// DELETE /api/frascos/:id
router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        await prisma_1.prisma.inventarioFrasco.delete({ where: { id } });
        res.status(204).send();
    }
    catch {
        res.status(404).json({ message: 'Frasco no encontrado' });
    }
});
exports.default = router;
//# sourceMappingURL=frascos.js.map