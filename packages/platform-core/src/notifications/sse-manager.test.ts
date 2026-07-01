import { describe, expect, it, vi } from 'vitest'
import { UnifiedSSEManager } from './sse-manager'
import type { ActivityEvent } from './types'

// ─── Mock de Response ─────────────────────────────────────────────────────────
function mockRes() {
  return { write: vi.fn() }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeEvent = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  app: 'deposito',
  tipo: 'test',
  titulo: 'Test',
  mensaje: 'Test message',
  timestamp: new Date().toISOString(),
  ...overrides,
})

describe('UnifiedSSEManager', () => {
  it('agrega un cliente y le envía eventos de su app', () => {
    const manager = new UnifiedSSEManager()
    const res = mockRes()

    manager.addClient('user_1', ['deposito'], false, res as any)
    manager.broadcast(makeEvent({ app: 'deposito' }))

    expect(res.write).toHaveBeenCalledTimes(1)
    const output = res.write.mock.calls[0][0] as string
    const dataMatch = output.match(/data: (.+)\n\n/)
    expect(dataMatch).not.toBeNull()
    const written = JSON.parse(dataMatch![1])
    expect(written.tipo).toBe('test')
  })

  it('no envía eventos de apps que el cliente no tiene', () => {
    const manager = new UnifiedSSEManager()
    const res = mockRes()

    manager.addClient('user_1', ['deposito'], false, res as any)
    manager.broadcast(makeEvent({ app: 'ale_bet' }))

    expect(res.write).not.toHaveBeenCalled()
  })

  it('admin recibe eventos de todas las apps', () => {
    const manager = new UnifiedSSEManager()
    const res = mockRes()

    manager.addClient('admin_1', ['deposito'], true, res as any)
    manager.broadcast(makeEvent({ app: 'ale_bet' }))

    expect(res.write).toHaveBeenCalledTimes(1)
  })

  it('removeClient deja de enviar eventos', () => {
    const manager = new UnifiedSSEManager()
    const res = mockRes()

    const id = manager.addClient('user_1', ['deposito'], false, res as any)
    manager.removeClient(id)
    manager.broadcast(makeEvent({ app: 'deposito' }))

    expect(res.write).not.toHaveBeenCalled()
  })

  it('múltiples clientes reciben según su app', () => {
    const manager = new UnifiedSSEManager()
    const resDeposito = mockRes()
    const resAleBet = mockRes()

    manager.addClient('user_1', ['deposito'], false, resDeposito as any)
    manager.addClient('user_2', ['ale_bet'], false, resAleBet as any)

    manager.broadcast(makeEvent({ app: 'deposito' }))

    expect(resDeposito.write).toHaveBeenCalledTimes(1)
    expect(resAleBet.write).not.toHaveBeenCalled()
  })

  it('broadcast sin clientes no tira error', () => {
    const manager = new UnifiedSSEManager()

    expect(() => manager.broadcast(makeEvent())).not.toThrow()
  })

  it('formatea el evento con event: y data:', () => {
    const manager = new UnifiedSSEManager()
    const res = mockRes()

    manager.addClient('user_1', ['deposito'], false, res as any)
    manager.broadcast(makeEvent({ tipo: 'stock_bajo' }))

    const output = res.write.mock.calls[0][0] as string
    expect(output).toMatch(/^event: stock_bajo\n/)
    expect(output).toMatch(/\ndata: .+\n\n$/)
    const parsed = JSON.parse(output.match(/data: (.+)\n\n/)?.[1] ?? '')
    expect(parsed.tipo).toBe('stock_bajo')
  })
})
