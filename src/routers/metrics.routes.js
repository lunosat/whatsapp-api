import { Router } from 'express'

import { getOverviewMetrics, getSessionMetrics } from '../controllers/metrics.controller.js'

const router = Router()

router.get('/', getOverviewMetrics)
router.get('/sessions/:sessionId', getSessionMetrics)

export default router
