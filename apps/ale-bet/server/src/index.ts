import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import productosRoutes from './routes/productos'
import pedidosRoutes from './routes/pedidos'
import clientesRoutes from './routes/clientes'
import stockRoutes from './routes/stock'
import dashboardRoutes from './routes/dashboard'
import notificacionesRoutes from './routes/notificaciones'
import historialRoutes from './routes/historial'

const app = express()
const port = Number(process.env.PORT ?? 3003)

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5175',
    credentials: false,
  })
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'ale-bet' })
})

app.use('/api/auth', authRoutes)
app.use('/api/productos', productosRoutes)
app.use('/api/pedidos', pedidosRoutes)
app.use('/api/clientes', clientesRoutes)
app.use('/api/stock', stockRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/notificaciones', notificacionesRoutes)
app.use('/api/historial', historialRoutes)

app.listen(port, () => {
  console.log(`Ale-Bet server running on http://localhost:${port}`)
})
