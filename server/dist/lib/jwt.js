"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyToken = verifyToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('❌ JWT_SECRET no configurado. Agregalo a server/.env');
        process.exit(1);
    }
    return secret;
}
const JWT_SECRET = getJwtSecret();
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '30d';
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}
function signRefreshToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId, type: 'refresh' }, REFRESH_TOKEN_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, REFRESH_TOKEN_SECRET);
}
//# sourceMappingURL=jwt.js.map