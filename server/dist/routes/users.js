"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const editRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(['encargado', 'observador', 'solicitante']),
});
// GET /api/users — listar todos (solo encargado)
router.get('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (_req, res) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
        res.json(users);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// PUT /api/users/:id — editar rol (solo encargado)
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = editRoleSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    try {
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: { role: result.data.role },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        res.json(user);
    }
    catch {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
});
// DELETE /api/users/:id — eliminar usuario (solo encargado, no puede borrarse a sí mismo)
router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    if (req.user?.id === id) {
        res.status(400).json({ message: 'No podés eliminar tu propia cuenta' });
        return;
    }
    try {
        await prisma_1.prisma.user.delete({ where: { id } });
        res.status(204).send();
    }
    catch {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map