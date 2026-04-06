"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jwt_1 = require("../lib/jwt");
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Token requerido' });
        return;
    }
    const token = authHeader.slice(7);
    try {
        const payload = (0, jwt_1.verifyToken)(token);
        req.user = { id: payload.sub, role: payload.role, name: payload.name };
        next();
    }
    catch {
        res.status(401).json({ message: 'Token inválido o expirado' });
    }
}
//# sourceMappingURL=auth.js.map