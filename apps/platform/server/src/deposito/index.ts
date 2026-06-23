import './lib/env'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import { createDepositoRoutes } from './routes/index'

const app = express()
const PORT = process.env.PORT ?? 3001

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
  credentials: true
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api', createDepositoRoutes())

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
