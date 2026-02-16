import SessionModel from '../models/session.model.js'
import MessageModel from '../models/message.model.js'
import asyncHandler from '../utils/async-handler.js'
import { createHttpError } from '../utils/http-error.js'

const toSummary = (items = []) =>
  items.reduce((acc, item) => {
    const key = item?._id ?? 'unknown'
    acc[key] = item?.count ?? 0
    return acc
  }, {})

export const getOverviewMetrics = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalSessions,
    sessionsStatusAgg,
    totalMessages,
    incomingMessages,
    outgoingMessages,
    failedMessages,
    messagesLast24h,
    failedLast24h,
    latestMessages
  ] = await Promise.all([
    SessionModel.countDocuments(),
    SessionModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    MessageModel.countDocuments(),
    MessageModel.countDocuments({ direction: 'incoming' }),
    MessageModel.countDocuments({ direction: 'outgoing' }),
    MessageModel.countDocuments({ status: 'failed' }),
    MessageModel.countDocuments({ createdAt: { $gte: since24h } }),
    MessageModel.countDocuments({ status: 'failed', createdAt: { $gte: since24h } }),
    MessageModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('sessionId direction status from to text messageTimestamp createdAt errorMessage')
      .lean()
  ])

  const sessionsByStatus = toSummary(sessionsStatusAgg)

  res.json({
    generatedAt: new Date().toISOString(),
    sessions: {
      total: totalSessions,
      byStatus: sessionsByStatus,
      active: sessionsByStatus.connected || 0,
      waiting: (sessionsByStatus['waiting-code'] || 0) + (sessionsByStatus['waiting-qr'] || 0)
    },
    messages: {
      total: totalMessages,
      incoming: incomingMessages,
      outgoing: outgoingMessages,
      failed: failedMessages,
      last24h: {
        total: messagesLast24h,
        failed: failedLast24h
      },
      latest: latestMessages
    }
  })
})

export const getSessionMetrics = asyncHandler(async (req, res) => {
  const sessionId = String(req.params.sessionId || '').toLowerCase()

  const session = await SessionModel.findOne({ sessionId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    directionSummary,
    statusSummary,
    totalMessages,
    totalFailed,
    messagesLast24h,
    failedLast24h,
    recentMessages
  ] = await Promise.all([
    MessageModel.aggregate([
      { $match: { sessionId } },
      { $group: { _id: '$direction', count: { $sum: 1 } } }
    ]),
    MessageModel.aggregate([
      { $match: { sessionId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    MessageModel.countDocuments({ sessionId }),
    MessageModel.countDocuments({ sessionId, status: 'failed' }),
    MessageModel.countDocuments({ sessionId, createdAt: { $gte: since24h } }),
    MessageModel.countDocuments({ sessionId, status: 'failed', createdAt: { $gte: since24h } }),
    MessageModel.find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('direction status from to text messageTimestamp createdAt errorMessage')
      .lean()
  ])

  res.json({
    sessionId,
    status: session.status,
    totals: {
      messages: totalMessages,
      failed: totalFailed
    },
    directions: toSummary(directionSummary),
    statuses: toSummary(statusSummary),
    last24h: {
      total: messagesLast24h,
      failed: failedLast24h
    },
    latestMessages: recentMessages
  })
})

export default {
  getOverviewMetrics,
  getSessionMetrics
}
