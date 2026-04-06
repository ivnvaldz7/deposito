"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const mercado_inventory_helpers_1 = require("./shared/mercado-inventory-helpers");
const router = (0, express_1.Router)();
(0, mercado_inventory_helpers_1.registerMercadoInventoryRoutes)({
    router,
    messages: {
        conflict: 'Ya existe ese artículo para ese mercado',
        notFound: 'Estuche no encontrado',
    },
    operations: {
        buildWhere: (mercado) => (mercado ? { mercado } : {}),
        findMany: ({ where, orderBy }) => prisma_1.prisma.inventarioEstuche.findMany({ where, orderBy }),
        findByComposite: (articulo, mercado) => prisma_1.prisma.inventarioEstuche.findUnique({
            where: { articulo_mercado: { articulo, mercado } },
        }),
        findById: (id) => prisma_1.prisma.inventarioEstuche.findUnique({ where: { id } }),
        findConflict: (articulo, mercado, id) => prisma_1.prisma.inventarioEstuche.findFirst({
            where: { articulo, mercado, NOT: { id } },
        }),
        create: (data) => prisma_1.prisma.inventarioEstuche.create({ data }),
        update: (id, data) => prisma_1.prisma.inventarioEstuche.update({ where: { id }, data }),
        delete: async (id) => {
            await prisma_1.prisma.inventarioEstuche.delete({ where: { id } });
        },
    },
});
exports.default = router;
//# sourceMappingURL=estuches.js.map