import { describe, expect, it, vi } from 'vitest'
import { getHealthResponse } from '../health'

describe('getHealthResponse', () => {
  it('reports Express and PostgreSQL as healthy after SELECT 1 succeeds', async () => {
    const checkDatabase = vi.fn().mockResolvedValue([{ value: 1 }])

    await expect(getHealthResponse(checkDatabase)).resolves.toEqual({
      statusCode: 200,
      body: { status: 'ok', app: 'platform', db: 'connected' },
    })
  })

  it('returns a sanitized 503 when PostgreSQL is unavailable', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('password and host must stay private'))

    const result = await getHealthResponse(checkDatabase)

    expect(result).toEqual({
      statusCode: 503,
      body: { status: 'error', app: 'platform', db: 'disconnected' },
    })
    expect(JSON.stringify(result)).not.toContain('password')
    expect(JSON.stringify(result)).not.toContain('host')
  })
})
