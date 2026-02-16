import { Router } from 'express'

import sessionRoutes from './session.routes.js'
import metricsRoutes from './metrics.routes.js'

const router = Router()

router.use('/sessions', sessionRoutes)
router.use('/metrics', metricsRoutes)

export default router
