import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationsStore } from '@/stores/notifications-store'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const MAX_RETRIES = 5
const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000]

/**
 * Conecta al SSE endpoint /api/notifications/stream usando fetch
 * con ReadableStream (EventSource no soporta headers personalizados).
 * Backoff exponencial: 5s → 10s → 20s → 40s → 60s.
 */
export function useNotificationsSSE() {
  const token = useAuthStore((s) => s.token)
  const addNotification = useNotificationsStore((s) => s.addNotification)
  const retryCount = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!token) return

    let mounted = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      if (!mounted) return

      const abort = new AbortController()
      abortRef.current = abort

      try {
        const res = await fetch(`${BASE_URL}/api/notifications/stream`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abort.signal,
        })

        if (!res.ok) {
          if (res.status === 401) {
            // Token inválido — no reintentar
            return
          }
          throw new Error(`SSE connection failed: ${res.status}`)
        }

        // Reset retry count on successful connection
        retryCount.current = 0

        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''

        while (mounted) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete line in buffer

          let currentEventType = ''
          let currentData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6).trim()
            } else if (line === '' && currentData) {
              // Empty line = end of event
              if (currentEventType !== 'heartbeat' && currentEventType !== 'connected') {
                try {
                  const event = JSON.parse(currentData)
                  addNotification(event)
                } catch {
                  // ignorar eventos malformados
                }
              }
              currentEventType = ''
              currentData = ''
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        // Connection error — reconnect
      }

      if (!mounted) return

      retryCount.current += 1
      if (retryCount.current > MAX_RETRIES) return

      const delay = RETRY_DELAYS[Math.min(retryCount.current - 1, RETRY_DELAYS.length - 1)]
      reconnectTimeout = setTimeout(connect, delay)
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      abortRef.current?.abort()
    }
  }, [token, addNotification])
}
