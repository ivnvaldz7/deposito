import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearClaveOperacion } from '../use-zerox'

afterEach(() => vi.unstubAllGlobals())

describe('clave de operación ZEROX', () => {
  it('genera UUID v4 sin randomUUID, como en HTTP por IP LAN', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => { bytes[index] = index })
        return bytes
      },
    })
    expect(crearClaveOperacion()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
