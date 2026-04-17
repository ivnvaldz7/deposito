import { useEffect, useEffectEvent } from 'react'
import { getToken, removeToken } from '@/lib/auth'

export interface PedidoAprobadoNotification {
  pedidoId: string
  numero: string
  clienteNombre: string
  cantidadItems: number
  timestamp: string
}

export interface PedidoCompletadoNotification {
  pedidoId: string
  numero: string
  clienteNombre: string
  timestamp: string
}

interface SSEOptions {
  onPedidoAprobado?: (data: PedidoAprobadoNotification) => void
  onPedidoCompletado?: (data: PedidoCompletadoNotification) => void
  onRefresh?: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPedidoAprobadoNotification(value: unknown): value is PedidoAprobadoNotification {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.pedidoId === 'string' &&
    typeof value.numero === 'string' &&
    typeof value.clienteNombre === 'string' &&
    typeof value.cantidadItems === 'number' &&
    typeof value.timestamp === 'string'
  )
}

function isPedidoCompletadoNotification(value: unknown): value is PedidoCompletadoNotification {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.pedidoId === 'string' &&
    typeof value.numero === 'string' &&
    typeof value.clienteNombre === 'string' &&
    typeof value.timestamp === 'string'
  )
}

export function useSSE(options: SSEOptions): void {
  const { onPedidoAprobado, onPedidoCompletado, onRefresh } = options
  const handlePedidoAprobado = useEffectEvent((data: PedidoAprobadoNotification) => {
    onPedidoAprobado?.(data)
    onRefresh?.()
  })
  const handlePedidoCompletado = useEffectEvent((data: PedidoCompletadoNotification) => {
    onPedidoCompletado?.(data)
    onRefresh?.()
  })

  useEffect(() => {
    const token = getToken()

    if (!token) {
      return
    }

    const controller = new AbortController()
    const url = '/api/notificaciones/stream'

    async function connect(): Promise<void> {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (res.status === 401) {
          removeToken()
          window.location.assign('/login')
          return
        }

        if (!res.ok || !res.body) {
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''

          for (const chunk of chunks) {
            if (chunk.startsWith(':')) {
              continue
            }

            const eventLine = chunk.match(/^event: (.+)$/m)?.[1]
            const dataLine = chunk.match(/^data: (.+)$/m)?.[1]

            if (!eventLine || !dataLine) {
              continue
            }

            try {
              const data = JSON.parse(dataLine) as unknown

              if (eventLine === 'pedido:aprobado' && isPedidoAprobadoNotification(data)) {
                handlePedidoAprobado(data)
              }

              if (eventLine === 'pedido:completado' && isPedidoCompletadoNotification(data)) {
                handlePedidoCompletado(data)
              }
            } catch {
              // Ignorar chunks malformados o parciales.
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    void connect()

    return () => {
      controller.abort()
    }
  }, [handlePedidoAprobado, handlePedidoCompletado])
}
