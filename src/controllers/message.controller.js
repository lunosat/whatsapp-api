import MessageModel from '../models/message.model.js'
import whatsappService from '../whatsapp/index.js'
import asyncHandler from '../utils/async-handler.js'

const normalizeId = (value = '') => String(value).trim().toLowerCase()

export const listMessages = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const direction = req.query.direction
  const before = req.query.before ? new Date(req.query.before) : null

  const filter = { sessionId: normalizedId }
  if (before && !Number.isNaN(before.getTime())) {
    filter.messageTimestamp = { $lt: before }
  }
  if (direction && ['incoming', 'outgoing'].includes(direction)) {
    filter.direction = direction
  }

  const items = await MessageModel.find(filter)
    .sort({ messageTimestamp: -1 })
    .limit(limit)

  res.json({ items, limit })
})

export const sendMessage = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const { to, message } = req.body || {}

  const response = await whatsappService.sendTextMessage(normalizedId, to, message)

  res.status(201).json({
    messageId: response?.key?.id,
    status: 'sent'
  })
})

export default { listMessages, sendMessage }
