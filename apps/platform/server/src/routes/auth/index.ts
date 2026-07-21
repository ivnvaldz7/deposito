import { Router } from 'express'
import loginRoutes from './login'
import loginLocalRoutes from './login-local'
import callbackRoutes from './callback'
import devLoginRoutes from './dev-login'
import refreshRoutes from './refresh'
import logoutRoutes from './logout'
import meRoutes from './me'

const router = Router()

router.use(loginRoutes)
router.use(loginLocalRoutes)
router.use(callbackRoutes)
router.use(devLoginRoutes)
router.use(refreshRoutes)
router.use(logoutRoutes)
router.use(meRoutes)

export default router
