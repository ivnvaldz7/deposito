import './lib/env'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import drogasRoutes from './routes/drogas'
import actasRoutes from './routes/actas'
import dashboardRoutes from './routes/dashboard'
import movimientosRoutes from './routes/movimientos'
import estuchesRoutes from './routes/estuches'
import etiquetasRoutes from './routes/etiquetas'
import frascosRoutes from './routes/frascos'
import pendientesRoutes from './routes/pendientes'
import usersRoutes from './routes/users'
import ordenesRoutes from './routes/ordenes'
import eventsRoutes from './routes/events'
import metricasRoutes from './routes/metricas'
import productosRoutes from './routes/productos'

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
app.use('/api/drogas', drogasRoutes)
app.use('/api/actas', actasRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/movimientos', movimientosRoutes)
app.use('/api/estuches', estuchesRoutes)
app.use('/api/etiquetas', etiquetasRoutes)
app.use('/api/frascos', frascosRoutes)
app.use('/api/pendientes', pendientesRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/ordenes', ordenesRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/metricas', metricasRoutes)
app.use('/api/productos', productosRoutes)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
