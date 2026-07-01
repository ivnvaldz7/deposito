// ─── App identifiers ──────────────────────────────────────────────────────────
export type AppId = 'deposito' | 'ale_bet' | 'admin'

// ─── Event emitted through the bus ────────────────────────────────────────────
export interface ActivityEvent {
  app: AppId
  tipo: string
  titulo: string
  mensaje: string
  userId?: string
  roles?: string[]
  link?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

// ─── Input for createNotification ─────────────────────────────────────────────
export interface CreateNotificationInput {
  userId: string
  app: AppId
  tipo: string
  titulo: string
  mensaje: string
  link?: string
  metadata?: Record<string, unknown>
}

// ─── Shape returned from notification queries ─────────────────────────────────
export interface NotificationRow {
  id: string
  userId: string
  app: AppId
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  link: string | null
  metadata: unknown
  createdAt: Date
}

// ─── Filter options for listing notifications ─────────────────────────────────
export interface NotificationFilter {
  app?: AppId
  leida?: boolean
  tipo?: string
}

// ─── Pagination options ───────────────────────────────────────────────────────
export interface ListOptions {
  page?: number
  limit?: number
}

// ─── SSE client shape ─────────────────────────────────────────────────────────
export interface SSEClient {
  id: string
  userId: string
  apps: AppId[]
  isAdmin: boolean
  res: { write: (data: string) => boolean }
}
