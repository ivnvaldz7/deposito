"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./lib/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./routes/auth"));
const drogas_1 = __importDefault(require("./routes/drogas"));
const actas_1 = __importDefault(require("./routes/actas"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const movimientos_1 = __importDefault(require("./routes/movimientos"));
const estuches_1 = __importDefault(require("./routes/estuches"));
const etiquetas_1 = __importDefault(require("./routes/etiquetas"));
const frascos_1 = __importDefault(require("./routes/frascos"));
const pendientes_1 = __importDefault(require("./routes/pendientes"));
const users_1 = __importDefault(require("./routes/users"));
const ordenes_1 = __importDefault(require("./routes/ordenes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3001;
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true,
}));
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/auth', auth_1.default);
app.use('/api/drogas', drogas_1.default);
app.use('/api/actas', actas_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/movimientos', movimientos_1.default);
app.use('/api/estuches', estuches_1.default);
app.use('/api/etiquetas', etiquetas_1.default);
app.use('/api/frascos', frascos_1.default);
app.use('/api/pendientes', pendientes_1.default);
app.use('/api/users', users_1.default);
app.use('/api/ordenes', ordenes_1.default);
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map