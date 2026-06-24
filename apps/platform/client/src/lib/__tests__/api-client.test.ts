import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// We import after stubbing fetch
import type { ApiError as ApiErrorType } from '../api-client'
const { apiClient, ApiError } = await import('../api-client')

function createJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response
}

describe('apiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    useAuthStore.setState({ token: null, user: null, authResolved: false })
  })

  describe('GET', () => {
    it('makes a GET request to the correct path', async () => {
      const responseData = { id: 1, name: 'test' }
      mockFetch.mockResolvedValue(createJsonResponse(responseData))

      const result = await apiClient.get('/deposito/productos')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain('/api/deposito/productos')
      expect(mockFetch.mock.calls[0][1]?.method).toBe('GET')
      expect(result).toEqual(responseData)
    })

    it('attaches Bearer token from auth store', async () => {
      useAuthStore.getState().login('test-token', {
        sub: 'u1', email: 'a@b.com', name: 'Test',
        apps: { deposito: { rol: 'encargado', activo: true } },
        isPlatformAdmin: false,
      })

      mockFetch.mockResolvedValue(createJsonResponse({}))

      await apiClient.get('/deposito/productos')

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-token')
    })

    it('does not attach token if not in store', async () => {
      mockFetch.mockResolvedValue(createJsonResponse({}))

      await apiClient.get('/deposito/productos')

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })

    it('throws ApiError on non-OK response', async () => {
      mockFetch.mockResolvedValue(createJsonResponse(
        { message: 'Not found' }, 404,
      ))

      await expect(apiClient.get('/deposito/productos/999'))
        .rejects.toThrow(ApiError)

      try {
        await apiClient.get('/deposito/productos/999')
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
        expect((e as ApiErrorType).status).toBe(404)
      }
    })

    it('includes credentials: include in all requests', async () => {
      mockFetch.mockResolvedValue(createJsonResponse({}))

      await apiClient.get('/deposito/productos')

      expect(mockFetch.mock.calls[0][1]?.credentials).toBe('include')
    })
  })

  describe('POST', () => {
    it('sends JSON body', async () => {
      const body = { name: 'New Product', price: 100 }
      mockFetch.mockResolvedValue(createJsonResponse({ id: 1, ...body }))

      const result = await apiClient.post('/deposito/productos', body)

      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST')
      expect(mockFetch.mock.calls[0][1]?.body).toBe(JSON.stringify(body))
      expect(result).toEqual({ id: 1, ...body })
    })

    it('can POST without body', async () => {
      mockFetch.mockResolvedValue(createJsonResponse({}))

      await apiClient.post('/deposito/productos')

      expect(mockFetch.mock.calls[0][1]?.body).toBeUndefined()
    })
  })

  describe('PUT', () => {
    it('sends PUT with JSON body', async () => {
      const body = { price: 150 }
      mockFetch.mockResolvedValue(createJsonResponse({ id: 1, ...body }))

      const result = await apiClient.put('/deposito/productos/1', body)

      expect(mockFetch.mock.calls[0][1]?.method).toBe('PUT')
      expect(result).toEqual({ id: 1, ...body })
    })
  })

  describe('DELETE', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue(createJsonResponse({}, 204))

      await apiClient.del('/deposito/productos/1')

      expect(mockFetch.mock.calls[0][1]?.method).toBe('DELETE')
    })
  })

  describe('401 refresh flow', () => {
    it('attempts token refresh on 401 and retries request', async () => {
      useAuthStore.getState().login('expired-token', {
        sub: 'u1', email: 'a@b.com', name: 'Test',
        apps: { deposito: { rol: 'encargado', activo: true } },
        isPlatformAdmin: false,
      })

      const refreshResponse = {
        token: 'new-token',
        user: {
          sub: 'u1', email: 'a@b.com', name: 'Test',
          apps: { deposito: { rol: 'encargado', activo: true } },
          isPlatformAdmin: false,
        },
      }

      // First call returns 401, second call (refresh) returns new token, third call (retry) succeeds
      mockFetch
        .mockResolvedValueOnce(createJsonResponse({ message: 'Token expirado' }, 401))
        .mockResolvedValueOnce(createJsonResponse(refreshResponse))
        .mockResolvedValueOnce(createJsonResponse({ id: 1, name: 'retried' }))

      const result = await apiClient.get('/deposito/productos')

      expect(result).toEqual({ id: 1, name: 'retried' })
      // Token should be updated
      expect(useAuthStore.getState().token).toBe('new-token')
    })

    it('logs out on failed refresh and throws', async () => {
      useAuthStore.getState().login('expired-token', {
        sub: 'u1', email: 'a@b.com', name: 'Test',
        apps: { deposito: { rol: 'encargado', activo: true } },
        isPlatformAdmin: false,
      })

      // First call 401, refresh also fails
      mockFetch
        .mockResolvedValueOnce(createJsonResponse({ message: 'Token expirado' }, 401))
        .mockResolvedValueOnce(createJsonResponse({ message: 'Refresh failed' }, 401))

      await expect(apiClient.get('/deposito/productos')).rejects.toThrow(ApiError)
      // Should have logged out
      expect(useAuthStore.getState().token).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('does not attempt refresh on /auth/login path', async () => {
      useAuthStore.getState().login('expired-token', {
        sub: 'u1', email: 'a@b.com', name: 'Test',
        apps: { deposito: { rol: 'encargado', activo: true } },
        isPlatformAdmin: false,
      })

      mockFetch
        .mockResolvedValueOnce(createJsonResponse({ message: 'Credenciales inválidas' }, 401))

      await expect(apiClient.post('/auth/login')).rejects.toThrow(ApiError)
      // Should NOT have called refresh endpoint — only the original call
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
