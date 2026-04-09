"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseManager = exports.STOCK_BAJO_FRASCOS_THRESHOLD = exports.STOCK_BAJO_THRESHOLD = void 0;
const crypto_1 = require("crypto");
exports.STOCK_BAJO_THRESHOLD = 10;
exports.STOCK_BAJO_FRASCOS_THRESHOLD = 5;
class SSEManager {
    constructor() {
        this.clients = new Map();
    }
    addClient(userId, role, res) {
        const id = (0, crypto_1.randomUUID)();
        this.clients.set(id, { id, userId, role, res });
        return id;
    }
    removeClient(id) {
        this.clients.delete(id);
    }
    send(client, event) {
        try {
            client.res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        catch {
            this.clients.delete(client.id);
        }
    }
    broadcastGlobal(event) {
        for (const client of this.clients.values()) {
            this.send(client, event);
        }
    }
    broadcastToRoles(event, roles) {
        for (const client of this.clients.values()) {
            if (roles.includes(client.role)) {
                this.send(client, event);
            }
        }
    }
    broadcastToUser(event, userId) {
        for (const client of this.clients.values()) {
            if (client.userId === userId) {
                this.send(client, event);
            }
        }
    }
}
exports.sseManager = new SSEManager();
//# sourceMappingURL=sse-manager.js.map