"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const mercado_inventory_helpers_1 = require("./shared/mercado-inventory-helpers");
const router = (0, express_1.Router)();
(0, mercado_inventory_helpers_1.registerMercadoInventoryRoutes)({
    router,
    messages: {
        conflict: 'Ya existe esa etiqueta para ese mercado',
        notFound: 'Etiqueta no encontrada',
    },
    operations: {
        buildWhere: (mercado) => (mercado ? { mercado } : {}),
        findMany: ({ where, orderBy }) => prisma_1.prisma.inventarioEtiqueta.findMany({ where, orderBy }),
        findByComposite: (articulo, mercado) => prisma_1.prisma.inventarioEtiqueta.findUnique({
            where: { articulo_mercado: { articulo, mercado } },
        }),
        findById: (id) => prisma_1.prisma.inventarioEtiqueta.findUnique({ where: { id } }),
        findConflict: (articulo, mercado, id) => prisma_1.prisma.inventarioEtiqueta.findFirst({
            where: { articulo, mercado, NOT: { id } },
        }),
        create: (data) => prisma_1.prisma.inventarioEtiqueta.create({ data }),
        update: (id, data) => prisma_1.prisma.inventarioEtiqueta.update({ where: { id }, data }),
        delete: async (id) => {
            await prisma_1.prisma.inventarioEtiqueta.delete({ where: { id } });
        },
    },
});
exports.default = router;
//# sourceMappingURL=etiquetas.js.map