import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth/index'
import notificationRoutes from './routes/notifications/index'
import { createAdminRoutes } from './routes/admin/index'
import { createAleBetRoutes } from './routes/ale-bet/index'
import { createDepositoRoutes } from './deposito/routes/index'
import { verifyToken } from './middlewares/verify-token'
import { createBootstrapRoutes } from './routes/bootstrap/index'
import { eventBus, createNotificationHandler } from '@platform/core'
import { platformDb } from '@platform/db'

const app = express()
const PORT = process.env.PORT ?? 3000

const localhostRegex = /^http:\/\/localhost(:\d+)?$/

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (móvil, postman, etc.) y localhost con cualquier puerto
    if (!origin || localhostRegex.test(origin) || origin === process.env.FRONTEND_URL) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'platform', timestamp: new Date().toISOString() })
})

// Auth routes (public — no JWT required)
app.use('/api/auth', authRoutes)

// Bootstrap route (gated por env vars, no requiere JWT)
app.use('/api', createBootstrapRoutes())

// Module routes (JWT required)
app.use('/api/notifications', verifyToken, notificationRoutes)
app.use('/api/admin', verifyToken, createAdminRoutes())
app.use('/api/deposito', verifyToken, createDepositoRoutes())
app.use('/api/ale-bet', verifyToken, createAleBetRoutes())

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Error interno del servidor'
  console.error('Error:', err)
  res.status(500).json({ error: message })
})

// Wire notification persistence to event bus
eventBus.on(createNotificationHandler(platformDb as any))

// Purge notifications older than 30 days every 6 hours
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000
setInterval(async () => {
  try {
    const { purgeOlderThan } = await import('@platform/core')
    const count = await purgeOlderThan(platformDb as any, 30)
    if (count > 0) {
      console.log(`[notifications] Purged ${count} notifications older than 30 days`)
    }
  } catch (err) {
    console.error('[notifications] Purge error:', err)
  }
}, PURGE_INTERVAL_MS)

app.listen(PORT, () => {
  console.log(`Platform server running on http://localhost:${PORT}`)
})

export default app
