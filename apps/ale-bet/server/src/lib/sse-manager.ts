import type { Response } from 'express'

export interface SSEClient {
  userId: string
  rol: string
  res: Response
}

function formatSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

class SSEManager {
  private clients = new Map<string, SSEClient>()

  addClient(userId: string, rol: string, res: Response): void {
    const existingClient = this.clients.get(userId)

    if (existingClient) {
      existingClient.res.end()
    }

    this.clients.set(userId, { userId, rol, res })
  }

  removeClient(userId: string): void {
    const client = this.clients.get(userId)

    if (!client) {
      return
    }

    this.clients.delete(userId)

    if (!client.res.writableEnded) {
      client.res.end()
    }
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    const client = this.clients.get(userId)

    if (!client) {
      return
    }

    this.writeToClient(client, event, data)
  }

  emitToRole(rol: string, event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      if (client.rol !== rol) {
        continue
      }

      this.writeToClient(client, event, data)
    }
  }

  emitToAll(event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      this.writeToClient(client, event, data)
    }
  }

  private writeToClient(client: SSEClient, event: string, data: unknown): void {
    if (client.res.writableEnded || client.res.destroyed) {
      this.clients.delete(client.userId)
      return
    }

    try {
      client.res.write(formatSSEEvent(event, data))
    } catch {
      this.clients.delete(client.userId)
    }
  }
}

export const sseManager = new SSEManager()
