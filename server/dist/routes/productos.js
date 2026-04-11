"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const producto_catalogo_1 = require("../lib/producto-catalogo");
const router = (0, express_1.Router)();
const CATEGORIAS = Object.values(client_1.Categoria);
const crearProductoSchema = zod_1.z.object({
    nombreBase: zod_1.z.string().min(2).max(100).transform(producto_catalogo_1.normalizeProductName),
    volumen: zod_1.z.number().positive().nullable().optional(),
    unidad: zod_1.z
        .string()
        .max(10)
        .nullable()
        .optional()
        .transform((s) => (s ? (0, producto_catalogo_1.normalizeProductName)(s) : null)),
    variante: zod_1.z
        .string()
        .max(100)
        .nullable()
        .optional()
        .transform((s) => (s ? (0, producto_catalogo_1.normalizeProductName)(s) : null)),
    categoria: zod_1.z.enum(CATEGORIAS),
    nombreCompleto: zod_1.z.string().min(2).max(200).transform(producto_catalogo_1.normalizeProductName),
});
// ─── GET /api/productos — listar (auth) ──────────────────────────────────────
router.get('/', auth_1.authenticate, async (req, res) => {
    const { categoria, buscar } = req.query;
    const where = { activo: true };
    if (typeof categoria === 'string' && CATEGORIAS.includes(categoria)) {
        where.categoria = categoria;
    }
    if (typeof buscar === 'string' && buscar.trim()) {
        where.nombreCompleto = { contains: (0, producto_catalogo_1.normalizeProductName)(buscar), mode: 'insensitive' };
    }
    try {
        const productos = await prisma_1.prisma.producto.findMany({
            where,
            orderBy: { nombreCompleto: 'asc' },
            select: {
                id: true,
                nombreBase: true,
                volumen: true,
                unidad: true,
                variante: true,
                categoria: true,
                nombreCompleto: true,
                activo: true,
            },
        });
        res.json(productos);
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// ─── POST /api/productos — crear (encargado) ─────────────────────────────────
router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = crearProductoSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { nombreBase, volumen, unidad, variante, categoria, nombreCompleto } = result.data;
    try {
        const existing = await prisma_1.prisma.producto.findUnique({
            where: { nombreCompleto_categoria: { nombreCompleto, categoria } },
        });
        if (existing) {
            res.status(409).json({ message: `Ya existe un producto "${nombreCompleto}" en la categoría "${categoria}"` });
            return;
        }
        const producto = await prisma_1.prisma.producto.create({
            data: {
                nombreBase,
                volumen: volumen != null ? new client_1.Prisma.Decimal(volumen) : null,
                unidad: unidad ?? null,
                variante: variante ?? null,
                categoria,
                nombreCompleto,
            },
        });
        res.status(201).json(producto);
    }
    catch (err) {
        if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002') {
            res.status(409).json({ message: `Ya existe un producto "${nombreCompleto}" en la categoría "${categoria}"` });
            return;
        }
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=productos.js.map