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

app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,
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
