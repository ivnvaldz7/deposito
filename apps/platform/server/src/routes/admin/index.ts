import { Router } from 'express'
import userRoutes from './users'
import { verifyToken } from '../../middlewares/verify-token'

export function createAdminRoutes(): Router {
  const router = Router()

  // All admin routes need auth + isPlatformAdmin
  // (handled inside users.ts via requirePlatformAdmin)
  router.use(userRoutes)

  return router
}

// Mount helper for platform server
export function mountAdminRoutes(parentRouter: Router): void {
  parentRouter.use('/admin', verifyToken, createAdminRoutes())
}
