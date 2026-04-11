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
const REFRESH_COOKIE_NAME = 'deposito_refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
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
function getCookieValue(req, name) {
    const raw = req.headers.cookie;
    if (!raw)
        return null;
    for (const part of raw.split(';')) {
        const [cookieName, ...rest] = part.trim().split('=');
        if (cookieName === name) {
            return decodeURIComponent(rest.join('='));
        }
    }
    return null;
}
function setRefreshTokenCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS,
        path: '/api/auth',
    });
}
function clearRefreshTokenCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
    });
}
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
    catch (error) {
        console.error(error);
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
        const refreshToken = (0, jwt_1.signRefreshToken)(user.id);
        setRefreshTokenCookie(res, refreshToken);
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});
// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    const refreshToken = getCookieValue(req, REFRESH_COOKIE_NAME);
    if (!refreshToken) {
        res.status(401).json({ message: 'Refresh token requerido' });
        return;
    }
    try {
        const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
        if (payload.type !== 'refresh') {
            clearRefreshTokenCookie(res);
            res.status(401).json({ message: 'Refresh token inválido' });
            return;
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true, role: true },
        });
        if (!user) {
            clearRefreshTokenCookie(res);
            res.status(401).json({ message: 'Usuario no encontrado para refresh token' });
            return;
        }
        const accessToken = (0, jwt_1.signToken)({ sub: user.id, role: user.role, name: user.name });
        const rotatedRefreshToken = (0, jwt_1.signRefreshToken)(user.id);
        setRefreshTokenCookie(res, rotatedRefreshToken);
        res.json({
            token: accessToken,
            user,
        });
    }
    catch (error) {
        console.error(error);
        clearRefreshTokenCookie(res);
        res.status(401).json({ message: 'Refresh token inválido o expirado' });
    }
});
// POST /api/auth/logout
router.post('/logout', async (_req, res) => {
    clearRefreshTokenCookie(res);
    res.status(204).send();
});
exports.default = router;
//# sourceMappingURL=auth.js.map