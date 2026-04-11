"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET no configurado. Agregalo a server/.env');
    process.exit(1);
}
if (!process.env.REFRESH_TOKEN_SECRET) {
    console.warn('⚠️ REFRESH_TOKEN_SECRET no configurado. Se usará JWT_SECRET como fallback.');
}
//# sourceMappingURL=env.js.map