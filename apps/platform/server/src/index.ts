import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth/index'
import { createAdminRoutes } from './routes/admin/index'
import { createAleBetRoutes } from './routes/ale-bet/index'
import { createDepositoRoutes } from './deposito/routes/index'
import { verifyToken } from './middlewares/verify-token'
import { createBootstrapRoutes } from './routes/bootstrap/index'

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
app.use('/api/admin', verifyToken, createAdminRoutes())

// Module routes
app.use('/api/deposito', verifyToken, createDepositoRoutes())
app.use('/api/ale-bet', verifyToken, createAleBetRoutes())

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Error interno del servidor'
  console.error('Error:', err)
  res.status(500).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`Platform server running on http://localhost:${PORT}`)
})

export default app
