import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from './event-bus'
import type { ActivityEvent } from './types'

const makeEvent = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  app: 'deposito',
  tipo: 'test_event',
  titulo: 'Test',
  mensaje: 'Testing event bus',
  timestamp: new Date().toISOString(),
  ...overrides,
})

describe('EventBus', () => {
  it('notifica a un suscriptor cuando se emite un evento', () => {
    const bus = createEventBus()
    const handler = vi.fn()

    bus.on(handler)
    bus.emit(makeEvent())

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'test_event' }))
  })

  it('notifica a múltiples suscriptores', () => {
    const bus = createEventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()

    bus.on(h1)
    bus.on(h2)
    bus.emit(makeEvent())

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('deja de notificar cuando se remueve un suscriptor', () => {
    const bus = createEventBus()
    const handler = vi.fn()

    const off = bus.on(handler)
    off()
    bus.emit(makeEvent())

    expect(handler).not.toHaveBeenCalled()
  })

  it('pasa el evento completo al suscriptor', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const event = makeEvent({ tipo: 'stock_bajo', app: 'ale_bet', userId: 'user_1' })

    bus.on(handler)
    bus.emit(event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('soporta emit sin suscriptores (no errors)', () => {
    const bus = createEventBus()

    expect(() => bus.emit(makeEvent())).not.toThrow()
  })

  it('remover el mismo handler dos veces es seguro', () => {
    const bus = createEventBus()
    const handler = vi.fn()

    const off = bus.on(handler)
    off()
    off() // segunda llamada no debería fallar

    bus.emit(makeEvent())
    expect(handler).not.toHaveBeenCalled()
  })
})
