import { Response } from 'express'
import { randomUUID } from 'crypto'
import { eventBus } from '@platform/core'

export interface SSEEvent {
  tipo: string
  mensaje: string
  datos?: Record<string, unknown>
  timestamp: string
}

interface SSEClient {
  id: string
  userId: string
  role: string
  res: Response
}

export const STOCK_BAJO_THRESHOLD = 10
export const STOCK_BAJO_FRASCOS_THRESHOLD = 5

class SSEManager {
  private clients: Map<string, SSEClient> = new Map()

  addClient(userId: string, role: string, res: Response): string {
    const id = randomUUID()
    this.clients.set(id, { id, userId, role, res })
    return id
  }

  removeClient(id: string): void {
    this.clients.delete(id)
  }

  private send(client: SSEClient, event: SSEEvent): void {
    try {
      client.res.write(`data: ${JSON.stringify(event)}\n\n`)
    } catch {
      this.clients.delete(client.id)
    }
  }

  broadcastGlobal(event: SSEEvent): void {
    for (const client of this.clients.values()) {
      this.send(client, event)
    }
  }

  broadcastToRoles(event: SSEEvent, roles: string[]): void {
    for (const client of this.clients.values()) {
      if (roles.includes(client.role)) {
        this.send(client, event)
      }
    }
  }

  broadcastToUser(event: SSEEvent, userId: string): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        this.send(client, event)
      }
    }
  }
}

export const sseManager = new SSEManager()

// Bridge: reenvía eventos del EventBus central a los clientes legacy conectados
eventBus.on((event) => {
  if (event.app === 'deposito') {
    sseManager.broadcastGlobal({
      tipo: event.tipo,
      mensaje: event.mensaje,
      datos: { link: event.link, titulo: event.titulo, ...event.metadata },
      timestamp: event.timestamp,
    })
  }
})
