"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const mercado_inventory_helpers_1 = require("./shared/mercado-inventory-helpers");
const router = (0, express_1.Router)();
// GET /api/etiquetas
router.get('/', auth_1.authenticate, async (req, res) => {
    const { mercado } = req.query;
    const where = {};
    const mercadoValue = (0, mercado_inventory_helpers_1.resolveMercadoQuery)(mercado);
    if (mercadoValue) {
        where.mercado = mercadoValue;
    }
    try {
        const etiquetas = await prisma_1.prisma.inventarioEtiqueta.findMany({
            where,
            orderBy: (0, mercado_inventory_helpers_1.getMercadoInventoryOrderBy)(),
        });
        res.json(etiquetas);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/etiquetas
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = mercado_inventory_helpers_1.crearMercadoInventorySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, mercado, cantidad } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioEtiqueta.findUnique({
            where: { articulo_mercado: { articulo, mercado } },
        });
        if (existing) {
            res.status(409).json({ message: 'Ya existe esa etiqueta para ese mercado' });
            return;
        }
        const etiqueta = await prisma_1.prisma.inventarioEtiqueta.create({
            data: { articulo, mercado, cantidad },
        });
        res.status(201).json(etiqueta);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// PUT /api/etiquetas/:id
router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    const result = mercado_inventory_helpers_1.editarMercadoInventorySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { articulo, mercado, cantidad } = result.data;
    try {
        const existing = await prisma_1.prisma.inventarioEtiqueta.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ message: 'Etiqueta no encontrada' });
            return;
        }
        const newArticulo = articulo ?? existing.articulo;
        const newMercado = mercado ?? existing.mercado;
        if (articulo !== undefined || mercado !== undefined) {
            const conflict = await prisma_1.prisma.inventarioEtiqueta.findFirst({
                where: { articulo: newArticulo, mercado: newMercado, NOT: { id } },
            });
            if (conflict) {
                res.status(409).json({ message: 'Ya existe esa etiqueta para ese mercado' });
                return;
            }
        }
        const etiqueta = await prisma_1.prisma.inventarioEtiqueta.update({
            where: { id },
            data: {
                ...(articulo !== undefined ? { articulo } : {}),
                ...(mercado !== undefined ? { mercado } : {}),
                ...(cantidad !== undefined ? { cantidad } : {}),
            },
        });
        res.json(etiqueta);
    }
    catch {
        res.status(404).json({ message: 'Etiqueta no encontrada' });
    }
});
// DELETE /api/etiquetas/:id
router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const id = req.params['id'];
    try {
        await prisma_1.prisma.inventarioEtiqueta.delete({ where: { id } });
        res.status(204).send();
    }
    catch {
        res.status(404).json({ message: 'Etiqueta no encontrada' });
    }
});
exports.default = router;
//# sourceMappingURL=etiquetas.js.map