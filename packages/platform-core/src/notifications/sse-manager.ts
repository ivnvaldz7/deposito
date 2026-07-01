import { randomUUID } from 'crypto'
import type { ActivityEvent, AppId } from './types'

// ─── Cliente conectado ────────────────────────────────────────────────────────
interface SSEClient {
  id: string
  userId: string
  apps: AppId[]
  isAdmin: boolean
  res: { write: (data: string) => boolean }
}

// ─── Manager unificado de conexiones SSE ──────────────────────────────────────
export class UnifiedSSEManager {
  private clients = new Map<string, SSEClient>()

  /** Registra un cliente y devuelve su id. */
  addClient(
    userId: string,
    apps: AppId[],
    isAdmin: boolean,
    res: { write: (data: string) => boolean },
  ): string {
    const id = randomUUID()
    this.clients.set(id, { id, userId, apps, isAdmin, res })
    return id
  }

  /** Remueve un cliente por id. */
  removeClient(id: string): void {
    this.clients.delete(id)
  }

  /** Envía un evento a todos los clientes que puedan verlo.
   *  - Si el cliente es admin → recibe todo.
   *  - Si no → solo eventos de apps que tiene en su lista. */
  broadcast(event: ActivityEvent): void {
    for (const client of this.clients.values()) {
      if (client.isAdmin || client.apps.includes(event.app)) {
        this.send(client, event)
      }
    }
  }

  private send(client: SSEClient, event: ActivityEvent): void {
    try {
      const data = `event: ${event.tipo}\ndata: ${JSON.stringify(event)}\n\n`
      client.res.write(data)
    } catch {
      this.clients.delete(client.id)
    }
  }
}

// Singleton global
export const unifiedSSEManager = new UnifiedSSEManager()
