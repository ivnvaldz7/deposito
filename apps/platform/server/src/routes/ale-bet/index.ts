import { Router } from 'express'
import productosRoutes from './productos'
import pedidosRoutes from './pedidos'
import clientesRoutes from './clientes'
import stockRoutes from './stock'
import dashboardRoutes from './dashboard'
import notificacionesRoutes from './notificaciones'
import historialRoutes from './historial'

export function createAleBetRoutes(): Router {
  const router = Router()

  router.use('/productos', productosRoutes)
  router.use('/pedidos', pedidosRoutes)
  router.use('/clientes', clientesRoutes)
  router.use('/stock', stockRoutes)
  router.use('/dashboard', dashboardRoutes)
  router.use('/notificaciones', notificacionesRoutes)
  router.use('/historial', historialRoutes)

  return router
}
