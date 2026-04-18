import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { toast } from '@/lib/toast'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const MAX_RETRIES = 5
const BACKOFF_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000] as const

const TIPO_LABELS: Record<string, string> = {
  ingreso_creado: 'Ingreso',
  stock_actualizado: 'Stock',
  orden_creada: 'Orden',
  orden_actualizada: 'Orden',
  stock_bajo: 'Stock bajo',
  vencimiento_proximo: 'Vencimiento próximo',
}

function getToastLabel(tipo: string, mensaje: string): string {
  const prefix = TIPO_LABELS[tipo]
  return prefix ? `${prefix}: ${mensaje}` : mensaje
}

type TicketResult =
  | { ok: true; ticket: string }
  | { ok: false; authError: boolean }

async function fetchTicket(token: string): Promise<TicketResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/events/auth`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) return { ok: false, authError: true }
    if (!res.ok) return { ok: false, authError: false }
    const data = (await res.json()) as { ticket: string }
    return { ok: true, ticket: data.ticket }
  } catch {
    return { ok: false, authError: false }
  }
}

export function useSSE() {
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const addNotification = useNotificationsStore((s) => s.addNotification)

  useEffect(() => {
    if (!token) return
    const authToken = token

    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let active = true
    let retryCount = 0

    async function connect() {
      if (!active) return

      const result = await fetchTicket(authToken)

      if (!active) return

      if (!result.ok) {
        if (result.authError) {
          // Token expirado o inválido — cerrar sesión
          logout()
          return
        }
        // Error de red — reintentar con backoff si quedan intentos
        if (retryCount < MAX_RETRIES) {
          const delay = BACKOFF_DELAYS[retryCount] ?? 60_000
          retryCount++
          retryTimeout = setTimeout(connect, delay)
        }
        return
      }

      es = new EventSource(`${BASE_URL}/api/events?ticket=${result.ticket}`)

      es.onmessage = (event: MessageEvent<string>) => {
        retryCount = 0 // reset backoff en mensaje exitoso
        try {
          const data = JSON.parse(event.data) as {
            tipo: string
            mensaje: string
            datos?: Record<string, unknown>
            timestamp: string
          }
          if (data.tipo === 'conectado') return

          addNotification({
            tipo: data.tipo,
            mensaje: data.mensaje,
            datos: data.datos,
            timestamp: data.timestamp,
          })

          if (data.tipo === 'stock_bajo' || data.tipo === 'vencimiento_proximo') {
            toast.warning(getToastLabel(data.tipo, data.mensaje))
          } else {
            toast.info(getToastLabel(data.tipo, data.mensaje))
          }
        } catch {
          // ignorar errores de parseo
        }
      }

      es.onerror = () => {
        es?.close()
        es = null
        if (!active) return
        if (retryCount >= MAX_RETRIES) return

        const delay = BACKOFF_DELAYS[retryCount] ?? 60_000
        retryCount++
        retryTimeout = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      active = false
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
    }
  }, [token, logout, addNotification])
}


