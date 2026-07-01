import { Router } from 'express'
import streamRoutes from './stream'
import listRoutes from './list'
import readRoutes from './read'
import readAllRoutes from './read-all'

const router = Router()

router.use(streamRoutes)
router.use(listRoutes)
router.use(readRoutes)
router.use(readAllRoutes)

export default router
