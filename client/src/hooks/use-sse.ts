import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore } from '@/stores/notifications-store'
import { toast } from '@/lib/toast'

const RECONNECT_DELAY_MS = 5000

const TIPO_LABELS: Record<string, string> = {
  ingreso_creado: 'Ingreso',
  stock_actualizado: 'Stock',
  orden_creada: 'Orden',
  orden_actualizada: 'Orden',
  stock_bajo: 'Stock bajo',
}

function getToastLabel(tipo: string, mensaje: string): string {
  const prefix = TIPO_LABELS[tipo]
  return prefix ? `${prefix}: ${mensaje}` : mensaje
}

export function useSSE() {
  const token = useAuthStore((s) => s.token)
  const addNotification = useNotificationsStore((s) => s.addNotification)

  useEffect(() => {
    if (!token) return

    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let active = true

    function connect() {
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)

      es.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as {
            tipo: string
            mensaje: string
            datos?: Record<string, unknown>
            timestamp: string
          }

          // Ignorar el ping de conexión
          if (data.tipo === 'conectado') return

          addNotification({
            tipo: data.tipo,
            mensaje: data.mensaje,
            datos: data.datos,
            timestamp: data.timestamp,
          })

          // Mostrar toast según tipo
          if (data.tipo === 'stock_bajo') {
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
        if (active) {
          retryTimeout = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }
    }

    connect()

    return () => {
      active = false
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
    }
  }, [token, addNotification])
}
