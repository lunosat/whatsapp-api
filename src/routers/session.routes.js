import { Router } from 'express'

import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  getSessionQr,
  purgeSessionMessages,
  requestPairingCode
} from '../controllers/session.controller.js'
import messagesRouter from './message.routes.js'

const router = Router()

router.get('/', listSessions)
router.post('/', createSession)
router.get('/:sessionId', getSession)
router.get('/:sessionId/qr', getSessionQr)
router.post('/:sessionId/pairing-code', requestPairingCode)
router.delete('/:sessionId/messages', purgeSessionMessages)
router.delete('/:sessionId', deleteSession)
router.use('/:sessionId/messages', messagesRouter)

export default router
