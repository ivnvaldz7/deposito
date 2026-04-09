"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = void 0;
const express_1 = require("express");
const crypto_1 = require("crypto");
const jwt_1 = require("../lib/jwt");
Object.defineProperty(exports, "verifyToken", { enumerable: true, get: function () { return jwt_1.verifyToken; } });
const auth_1 = require("../middleware/auth");
const sse_manager_1 = require("../lib/sse-manager");
const router = (0, express_1.Router)();
const tickets = new Map();
const TICKET_TTL_MS = 30000; // 30 segundos
function purgeExpiredTickets() {
    const now = Date.now();
    for (const [id, t] of tickets.entries()) {
        if (t.expiresAt < now)
            tickets.delete(id);
    }
}
// ─── POST /api/events/auth — emitir ticket SSE (auth por header) ──────────────
router.post('/auth', auth_1.authenticate, async (req, res) => {
    const ticketId = (0, crypto_1.randomUUID)();
    tickets.set(ticketId, {
        userId: req.user.id,
        role: req.user.role,
        expiresAt: Date.now() + TICKET_TTL_MS,
    });
    // Limpiar tickets expirados cada 50 requests para evitar fuga de memoria
    if (tickets.size > 50)
        purgeExpiredTickets();
    res.json({ ticket: ticketId });
});
// ─── GET /api/events?ticket=xxx — conexión SSE ────────────────────────────────
router.get('/', async (req, res) => {
    const ticketId = typeof req.query['ticket'] === 'string' ? req.query['ticket'] : undefined;
    if (!ticketId) {
        res.status(401).json({ message: 'Ticket requerido' });
        return;
    }
    const ticket = tickets.get(ticketId);
    tickets.delete(ticketId); // uso único — invalidar inmediatamente
    if (!ticket || ticket.expiresAt < Date.now()) {
        res.status(401).json({ message: 'Ticket inválido o expirado' });
        return;
    }
    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const clientId = sse_manager_1.sseManager.addClient(ticket.userId, ticket.role, res);
    // Ping de conexión exitosa
    res.write(`data: ${JSON.stringify({ tipo: 'conectado', mensaje: 'Conectado', timestamp: new Date().toISOString() })}\n\n`);
    req.on('close', () => {
        sse_manager_1.sseManager.removeClient(clientId);
    });
});
exports.default = router;
//# sourceMappingURL=events.js.map