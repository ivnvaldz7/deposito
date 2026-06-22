import { Router } from 'express'
import userRoutes from './users'

export function createAdminRoutes(): Router {
  const router = Router()

  router.use('/users', userRoutes)

  return router
}
