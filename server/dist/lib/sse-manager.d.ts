import { Response } from 'express';
export interface SSEEvent {
    tipo: string;
    mensaje: string;
    datos?: Record<string, unknown>;
    timestamp: string;
}
export declare const STOCK_BAJO_THRESHOLD = 10;
export declare const STOCK_BAJO_FRASCOS_THRESHOLD = 5;
declare class SSEManager {
    private clients;
    addClient(userId: string, role: string, res: Response): string;
    removeClient(id: string): void;
    private send;
    broadcastGlobal(event: SSEEvent): void;
    broadcastToRoles(event: SSEEvent, roles: string[]): void;
    broadcastToUser(event: SSEEvent, userId: string): void;
}
export declare const sseManager: SSEManager;
export {};
//# sourceMappingURL=sse-manager.d.ts.map