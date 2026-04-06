"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const mercado_inventory_helpers_1 = require("./shared/mercado-inventory-helpers");
const router = (0, express_1.Router)();
// GET /api/estuches
router.get('/', auth_1.authenticate, async (req, res) => {
    const { mercado } = req.query;
    const where = {};
    const mercadoValue = (0, mercado_inventory_helpers_1.resolveMercadoQuery)(mercado);
    if (mercadoValue) {
        where.mercado = mercadoValue;
    }
    try {
        const estuches = await prisma_1.prisma.inventarioEstuche.findMany({
            where,
            orderBy: (0, mercado_inventory_helpers_1.getMercadoInventoryOrderBy)(),
        });
        res.json(estuches);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/estuches
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = mercado_inventory_helpers_1.crearMercadoInventorySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, mercado, cantidad } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioEstuche.findUnique({
            where: { articulo_mercado: { articulo, mercado } },
        });
        if (existing) {
            res.status(409).json({ message: 'Ya existe ese artículo para ese mercado' });
            return;
        }
        const estuche = await prisma_1.prisma.inventarioEstuche.create({
            data: { articulo, mercado, cantidad },
        });
        res.status(201).json(estuche);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// PUT /api/estuches/:id
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = mercado_inventory_helpers_1.editarMercadoInventorySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, mercado, cantidad } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioEstuche.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ message: 'Estuche no encontrado' });
            return;
        }
        const newArticulo = articulo ?? existing.articulo;
        const newMercado = mercado ?? existing.mercado;
        if (articulo !== undefined || mercado !== undefined) {
            const conflict = await prisma_1.prisma.inventarioEstuche.findFirst({
                where: { articulo: newArticulo, mercado: newMercado, NOT: { id } },
            });
            if (conflict) {
                res.status(409).json({ message: 'Ya existe ese artículo para ese mercado' });
                return;
            }
        }
        const estuche = await prisma_1.prisma.inventarioEstuche.update({
            where: { id },
            data: {
                ...(articulo !== undefined ? { articulo } : {}),
                ...(mercado !== undefined ? { mercado } : {}),
                ...(cantidad !== undefined ? { cantidad } : {}),
            },
        });
        res.json(estuche);
    }
    catch {
        res.status(404).json({ message: 'Estuche no encontrado' });
    }
});
// DELETE /api/estuches/:id
router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        await prisma_1.prisma.inventarioEstuche.delete({ where: { id } });
        res.status(204).send();
    }
    catch {
        res.status(404).json({ message: 'Estuche no encontrado' });
    }
});
exports.default = router;
//# sourceMappingURL=estuches.js.map