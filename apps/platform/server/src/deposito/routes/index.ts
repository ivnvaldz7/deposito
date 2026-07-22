import { Router } from 'express'
import drogasRoutes from './drogas'
import actasRoutes from './actas'
import dashboardRoutes from './dashboard'
import movimientosRoutes from './movimientos'
import estuchesRoutes from './estuches'
import etiquetasRoutes from './etiquetas'
import frascosRoutes from './frascos'
import pendientesRoutes from './pendientes'
import usersRoutes from './users'
import ordenesRoutes from './ordenes'
import eventsRoutes from './events'
import metricasRoutes from './metricas'
import productosRoutes from './productos'
import ingresosRoutes from './ingresos'

export function createDepositoRoutes(): Router {
  const router = Router()

  router.use('/drogas', drogasRoutes)
  router.use('/actas', actasRoutes)
  router.use('/dashboard', dashboardRoutes)
  router.use('/movimientos', movimientosRoutes)
  router.use('/estuches', estuchesRoutes)
  router.use('/etiquetas', etiquetasRoutes)
  router.use('/frascos', frascosRoutes)
  router.use('/pendientes', pendientesRoutes)
  router.use('/users', usersRoutes)
  router.use('/ordenes', ordenesRoutes)
  router.use('/events', eventsRoutes)
  router.use('/metricas', metricasRoutes)
  router.use('/productos', productosRoutes)
  router.use('/ingresos', ingresosRoutes)

  return router
}
