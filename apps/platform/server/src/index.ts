import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth/index'
import { createAdminRoutes } from './routes/admin/index'
import { createDepositoRoutes } from '../../../deposito/server/src/routes/index'
import { verifyToken } from './middlewares/verify-token'

const app = express()
const PORT = process.env.PORT ?? 3000

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
  'https://deposito-client.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
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

// Module routes (JWT required)
app.use('/api/admin', verifyToken, createAdminRoutes())

// Module routes
app.use('/api/deposito', verifyToken, createDepositoRoutes())
// app.use('/api/ale-bet', verifyToken, createAleBetRoutes())

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
