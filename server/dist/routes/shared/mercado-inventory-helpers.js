"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editarMercadoInventorySchema = exports.crearMercadoInventorySchema = exports.MERCADOS_VALIDOS = void 0;
exports.resolveMercadoQuery = resolveMercadoQuery;
exports.getMercadoInventoryOrderBy = getMercadoInventoryOrderBy;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.MERCADOS_VALIDOS = Object.values(client_1.Mercado);
exports.crearMercadoInventorySchema = zod_1.z.object({
    articulo: zod_1.z.string().min(2).max(150),
    mercado: zod_1.z.enum(exports.MERCADOS_VALIDOS),
    cantidad: zod_1.z.number().int().min(0),
});
exports.editarMercadoInventorySchema = zod_1.z
    .object({
    articulo: zod_1.z.string().min(2).max(150).optional(),
    mercado: zod_1.z.enum(exports.MERCADOS_VALIDOS).optional(),
    cantidad: zod_1.z.number().int().min(0).optional(),
})
    .refine((data) => data.articulo !== undefined || data.mercado !== undefined || data.cantidad !== undefined, {
    message: 'Al menos un campo requerido',
});
function resolveMercadoQuery(mercado) {
    if (typeof mercado !== 'string') {
        return undefined;
    }
    return exports.MERCADOS_VALIDOS.includes(mercado) ? mercado : undefined;
}
function getMercadoInventoryOrderBy() {
    return [{ mercado: 'asc' }, { articulo: 'asc' }];
}
//# sourceMappingURL=mercado-inventory-helpers.js.map