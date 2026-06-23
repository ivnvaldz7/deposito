import express from 'express'
import type { Express } from 'express'
import authRoutes from '../../routes/auth/index'
import { createAdminRoutes } from '../../routes/admin/index'
import { verifyToken } from '../../middlewares/verify-token'
import { requireApp } from '../../middlewares/require-app'
import { requirePlatformAdmin } from '../../middlewares/require-admin'

/**
 * Creates an Express app for integration testing.
 *
 * Mirrors the real `apps/platform/server/src/index.ts` setup:
 * - Same middleware stack (cors excluded — not needed for tests)
 * - Same route mounting
 * - Adds test-only routes for guard/middleware verification
 */
export function createTestApp(): Express {
  const app = express()
  app.use(express.json())

  // Health check (mirrors production)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'platform', timestamp: new Date().toISOString() })
  })

  // Auth routes (public — no JWT required)
  app.use('/api/auth', authRoutes)

  // Admin routes (JWT + isPlatformAdmin required)
  app.use('/api/admin', verifyToken, createAdminRoutes())

  // Test-only route for requireApp('deposito') guard testing
  // This simulates what /api/deposito/* routes would look like
  app.get(
    '/api/deposito/health',
    verifyToken,
    requireApp('deposito'),
    (_req, res) => {
      res.json({ ok: true, module: 'deposito' })
    }
  )

  // Test-only route for requirePlatformAdmin guard testing
  // Wraps the async middleware properly for Express 4
  app.get(
    '/api/admin/guard-test',
    verifyToken,
    (req, res, next) => {
      requirePlatformAdmin(req, res, next).catch(next)
    },
    (_req, res) => {
      res.json({ ok: true, module: 'admin' })
    }
  )

  // Error handler (mirrors production)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Error interno del servidor'
    console.error('Test error:', err)
    res.status(500).json({ error: message })
  })

  return app
}
