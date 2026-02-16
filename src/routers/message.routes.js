import { Router } from 'express'

import { listMessages, sendMessage } from '../controllers/message.controller.js'

const router = Router({ mergeParams: true })

router.get('/', listMessages)
router.post('/', sendMessage)

export default router
