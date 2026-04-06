"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../lib/jwt");
const auth_1 = require("../middleware/auth");
const require_role_1 = require("../middleware/require-role");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(2),
    role: zod_1.z.enum(['encargado', 'observador', 'solicitante']).optional().default('observador'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
// POST /api/auth/register — solo encargados autenticados pueden crear usuarios
router.post('/register', auth_1.authenticate, (0, require_role_1.requireRole)('encargado'), async (req, res) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos', errors: result.error.flatten() });
        return;
    }
    const { email, password, name, role } = result.data;
    try {
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ message: 'Ya existe un usuario con ese email' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma_1.prisma.user.create({
            data: { email, passwordHash, name, role },
            select: { id: true, email: true, name: true, role: true },
        });
        const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role, name: user.name });
        res.status(201).json({ token, user });
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: 'Datos inválidos' });
        return;
    }
    const { email, password } = result.data;
    try {
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ message: 'Email o contraseña incorrectos' });
            return;
        }
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid) {
            res.status(401).json({ message: 'Email o contraseña incorrectos' });
            return;
        }
        const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role, name: user.name });
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    }
    catch {
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map