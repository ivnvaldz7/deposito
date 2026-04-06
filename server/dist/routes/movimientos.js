"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const TIPOS_VALIDOS = Object.values(client_1.TipoMovimiento);
// GET /api/movimientos — listar con filtros opcionales
router.get('/', auth_1.authenticate, async (req, res) => {
    const { tipo, producto, desde, hasta } = req.query;
    const where = {};
    if (tipo && typeof tipo === 'string' && TIPOS_VALIDOS.includes(tipo)) {
        where.tipo = tipo;
    }
    if (producto && typeof producto === 'string' && producto.trim()) {
        where.productoNombre = { contains: producto.trim(), mode: 'insensitive' };
    }
    const createdAtFilter = {};
    if (desde && typeof desde === 'string') {
        createdAtFilter.gte = new Date(desde + 'T00:00:00.000Z');
    }
    if (hasta && typeof hasta === 'string') {
        createdAtFilter.lte = new Date(hasta + 'T23:59:59.999Z');
    }
    if (createdAtFilter.gte ?? createdAtFilter.lte) {
        where.createdAt = createdAtFilter;
    }
    try {
        const movimientos = await prisma_1.prisma.movimiento.findMany({
            where,
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { name: true } } },
        });
        res.json(movimientos);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=movimientos.js.map