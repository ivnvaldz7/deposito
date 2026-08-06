import { Router } from 'express'
import productosRoutes from './productos'
import pedidosRoutes from './pedidos'
import clientesRoutes from './clientes'
import stockRoutes from './stock'
import dashboardRoutes from './dashboard'
import notificacionesRoutes from './notificaciones'
import historialRoutes from './historial'
import transportistasRoutes from './transportistas'
import remitosRoutes from './remitos'
import facturacionRoutes from './facturacion'

export function createAleBetRoutes(): Router {
  const router = Router()

  router.use('/productos', productosRoutes)
  router.use('/pedidos', pedidosRoutes)
  router.use('/clientes', clientesRoutes)
  router.use('/stock', stockRoutes)
  router.use('/dashboard', dashboardRoutes)
  router.use('/notificaciones', notificacionesRoutes)
  router.use('/historial', historialRoutes)
  router.use('/transportistas', transportistasRoutes)
  router.use('/pedidos', remitosRoutes)
  router.use('/facturacion', facturacionRoutes)

  return router
}
