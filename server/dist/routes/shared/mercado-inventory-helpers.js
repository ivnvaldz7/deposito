"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editarMercadoInventorySchema = exports.crearMercadoInventorySchema = exports.MERCADOS_VALIDOS = void 0;
exports.resolveMercadoQuery = resolveMercadoQuery;
exports.getMercadoInventoryOrderBy = getMercadoInventoryOrderBy;
exports.parseCrearMercadoInventoryBody = parseCrearMercadoInventoryBody;
exports.parseEditarMercadoInventoryBody = parseEditarMercadoInventoryBody;
exports.sendInvalidMercadoInventoryBody = sendInvalidMercadoInventoryBody;
exports.hasMercadoInventoryConflict = hasMercadoInventoryConflict;
exports.resolveMercadoInventoryUpdate = resolveMercadoInventoryUpdate;
exports.buildMercadoInventoryUpdateData = buildMercadoInventoryUpdateData;
exports.registerMercadoInventoryRoutes = registerMercadoInventoryRoutes;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../../middleware/auth");
const require_role_1 = require("../../middleware/require-role");
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
function parseCrearMercadoInventoryBody(body) {
    return exports.crearMercadoInventorySchema.safeParse(body);
}
function parseEditarMercadoInventoryBody(body) {
    return exports.editarMercadoInventorySchema.safeParse(body);
}
function sendInvalidMercadoInventoryBody(res, error) {
    res.status(400).json({ message: 'Datos inválidos', errors: error.flatten() });
}
async function hasMercadoInventoryConflict(findByComposite, articulo, mercado) {
    const existing = await findByComposite(articulo, mercado);
    return Boolean(existing);
}
async function resolveMercadoInventoryUpdate(operations, id, data) {
    const existing = await operations.findById(id);
    if (!existing) {
        return { existing: null, hasConflict: false };
    }
    const nextArticulo = data.articulo ?? existing.articulo;
    const nextMercado = data.mercado ?? existing.mercado;
    if (data.articulo !== undefined || data.mercado !== undefined) {
        const conflict = await operations.findConflict(nextArticulo, nextMercado, id);
        if (conflict) {
            return { existing, hasConflict: true };
        }
    }
    return { existing, hasConflict: false };
}
function buildMercadoInventoryUpdateData(data) {
    return {
        ...(data.articulo !== undefined ? { articulo: data.articulo } : {}),
        ...(data.mercado !== undefined ? { mercado: data.mercado } : {}),
        ...(data.cantidad !== undefined ? { cantidad: data.cantidad } : {}),
    };
}
function registerMercadoInventoryRoutes({ router, operations, messages, }) {
    router.get('/', auth_1.authenticate, async (req, res) => {
        const mercadoValue = resolveMercadoQuery(req.query['mercado']);
        try {
            const items = await operations.findMany({
                where: operations.buildWhere(mercadoValue),
                orderBy: getMercadoInventoryOrderBy(),
            });
            res.json(items);
        }
        catch {
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    });
    router.post('/', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
        const result = parseCrearMercadoInventoryBody(req.body);
        if (!result.success) {
            sendInvalidMercadoInventoryBody(res, result.error);
            return;
        }
        const { articulo, mercado, cantidad } = result.data;
        try {
            if (await hasMercadoInventoryConflict(operations.findByComposite, articulo, mercado)) {
                res.status(409).json({ message: messages.conflict });
                return;
            }
            const item = await operations.create({ articulo, mercado, cantidad });
            res.status(201).json(item);
        }
        catch {
            res.status(500).json({ message: 'Error interno del servidor' });
        }
    });
    router.put('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
        const id = req.params['id'];
        const result = parseEditarMercadoInventoryBody(req.body);
        if (!result.success) {
            sendInvalidMercadoInventoryBody(res, result.error);
            return;
        }
        try {
            const resolution = await resolveMercadoInventoryUpdate(operations, id, result.data);
            if (!resolution.existing) {
                res.status(404).json({ message: messages.notFound });
                return;
            }
            if (resolution.hasConflict) {
                res.status(409).json({ message: messages.conflict });
                return;
            }
            const item = await operations.update(id, buildMercadoInventoryUpdateData(result.data));
            res.json(item);
        }
        catch {
            res.status(404).json({ message: messages.notFound });
        }
    });
    router.delete('/:id', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
        const id = req.params['id'];
        try {
            await operations.delete(id);
            res.status(204).send();
        }
        catch {
            res.status(404).json({ message: messages.notFound });
        }
    });
}
//# sourceMappingURL=mercado-inventory-helpers.js.map