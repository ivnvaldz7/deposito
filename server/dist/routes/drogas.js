"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const crearDrogaSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(2).max(100),
    cantidad: zod_1.z.number().int().min(0),
});
const editarDrogaSchema = zod_1.z
    .object({
    nombre: zod_1.z.string().min(2).max(100).optional(),
    cantidad: zod_1.z.number().int().min(0).optional(),
})
    .refine((d) => d.nombre !== undefined || d.cantidad !== undefined, {
    message: 'Al menos un campo requerido',
});
// GET /api/drogas — listar todas (auth required)
router.get('/', auth_1.authenticate, async (_req, res) => {
    try {
        const drogas = await prisma_1.prisma.inventarioDroga.findMany({
            orderBy: { nombre: 'asc' },
        });
        res.json(drogas);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/drogas — crear nueva (encargado)
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearDrogaSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { nombre, cantidad } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioDroga.findUnique({ where: { nombre } });
        if (existing) {
            res.status(409).json({ message: 'Ya existe una droga con ese nombre' });
            return;
        }
        const droga = await prisma_1.prisma.inventarioDroga.create({
            data: { nombre, cantidad },
        });
        res.status(201).json(droga);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// PUT /api/drogas/:id — editar nombre y/o cantidad (encargado)
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = editarDrogaSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { nombre, cantidad } = result.data;
    try {
        if (nombre) {
            const conflict = await prisma_1.prisma.inventarioDroga.findFirst({
                where: { nombre, NOT: { id } },
            });
            if (conflict) {
                res.status(409).json({ message: 'Ya existe una droga con ese nombre' });
                return;
            }
        }
        const droga = await prisma_1.prisma.inventarioDroga.update({
            where: { id },
            data: {
                ...(nombre !== undefined ? { nombre } : {}),
                ...(cantidad !== undefined ? { cantidad } : {}),
            },
        });
        res.json(droga);
    }
    catch {
        res.status(404).json({ message: 'Droga no encontrada' });
    }
});
// DELETE /api/drogas/:id — eliminar (encargado)
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