import type { ActivityEvent } from './types'

export type EventHandler = (event: ActivityEvent) => void
type Off = () => void

// ─── EventBus ─────────────────────────────────────────────────────────────────
//
// Pub/sub central. Los módulos emiten eventos acá, los suscriptores
// (NotificationService, SSEManager) reaccionan.
//
export class EventBus {
  private handlers = new Set<EventHandler>()

  /** Registra un handler. Devuelve una función para removerlo. */
  on(handler: EventHandler): Off {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  /** Emite un evento a todos los handlers registrados. */
  emit(event: ActivityEvent): void {
    for (const handler of this.handlers) {
      handler(event)
    }
  }
}

// Singleton global — usar siempre esta instancia
export const eventBus = new EventBus()

// Factory para tests (instancia fresca, sin handlers compartidos)
export function createEventBus(): EventBus {
  return new EventBus()
}
