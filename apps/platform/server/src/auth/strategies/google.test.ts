import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleStrategy } from './google'

describe('GoogleStrategy', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('name', () => {
    it('devuelve "google"', () => {
      const strategy = new GoogleStrategy()
      expect(strategy.name).toBe('google')
    })
  })

  describe('getAuthUrl', () => {
    it('construye URL con los parámetros correctos', async () => {
      const strategy = new GoogleStrategy()
      const url = await strategy.getAuthUrl('test-state-123')

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('redirect_uri=' + encodeURIComponent('http://localhost:3000/api/auth/google/callback'))
      expect(url).toContain('response_type=code')
      expect(url).toContain('scope=profile+email')
      expect(url).toContain('state=test-state-123')
    })
  })

  describe('exchangeCode', () => {
    it('intercambia código por token y devuelve AuthUser', async () => {
      const mockTokenResponse = {
        access_token: 'mock-access-token',
        id_token: 'mock-id-token',
      }

      const mockUserInfo = {
        sub: 'google-123',
        email: 'user@gmail.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.png',
      }

      // Mock global fetch
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUserInfo),
        })
      vi.stubGlobal('fetch', fetchMock)

      const strategy = new GoogleStrategy()
      const result = await strategy.exchangeCode('test-code')

      expect(fetchMock).toHaveBeenCalledTimes(2)

      // First call: token exchange
      expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body)
      expect(body.get('code')).toBe('test-code')
      expect(body.get('client_id')).toBe('test-client-id')
      expect(body.get('client_secret')).toBe('test-client-secret')

      // Second call: user info
      expect(fetchMock.mock.calls[1][0]).toBe('https://www.googleapis.com/oauth2/v2/userinfo')
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer mock-access-token')

      expect(result).toEqual({
        providerId: 'google-123',
        email: 'user@gmail.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.png',
      })
    })

    it('lanza error si el intercambio falla', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const strategy = new GoogleStrategy()

      await expect(strategy.exchangeCode('bad-code')).rejects.toThrow(
        'Google OAuth: intercambio de código falló'
      )
    })
  })

  describe('validateToken', () => {
    it('valida un ID token y devuelve AuthUser', async () => {
      const mockTokenInfo = {
        sub: 'google-456',
        email: 'valid@google.com',
        name: 'Valid User',
        picture: 'https://example.com/pic.png',
      }

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenInfo),
      })
      vi.stubGlobal('fetch', fetchMock)

      const strategy = new GoogleStrategy()
      const result = await strategy.validateToken('valid-id-token')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/tokeninfo?id_token=valid-id-token'
      )
      expect(result).toEqual({
        providerId: 'google-456',
        email: 'valid@google.com',
        name: 'Valid User',
        avatar: 'https://example.com/pic.png',
      })
    })

    it('devuelve null si el token es inválido', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
      })
      vi.stubGlobal('fetch', fetchMock)

      const strategy = new GoogleStrategy()
      const result = await strategy.validateToken('invalid-token')

      expect(result).toBeNull()
    })
  })
})
