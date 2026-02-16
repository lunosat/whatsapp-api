import { nanoid } from 'nanoid'

import SessionModel from '../models/session.model.js'
import MessageModel from '../models/message.model.js'
import whatsappService from '../whatsapp/index.js'
import asyncHandler from '../utils/async-handler.js'
import { createHttpError } from '../utils/http-error.js'

const normalizeId = (value = '') => String(value).trim().toLowerCase()

export const createSession = asyncHandler(async (req, res) => {
  const { sessionId, label } = req.body || {}
  const normalizedId = normalizeId(sessionId || nanoid(8))

  const existing = await SessionModel.findOne({ sessionId: normalizedId })
  if (existing) {
    throw createHttpError(409, 'Já existe uma sessão com esse identificador')
  }

  const session = await SessionModel.create({
    sessionId: normalizedId,
    label: label?.trim() || null,
    status: 'idle'
  })

  await whatsappService.ensureSocket(normalizedId)

  res.status(201).json(session)
})

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await SessionModel.find().sort({ updatedAt: -1 })
  res.json({ items: sessions })
})

export const getSession = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const session = await SessionModel.findOne({ sessionId: normalizedId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  res.json(session)
})

export const requestPairingCode = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const { phoneNumber } = req.body || {}
  if (!phoneNumber) {
    throw createHttpError(400, 'O campo phoneNumber é obrigatório')
  }

  const session = await SessionModel.findOne({ sessionId: normalizedId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  const pairingCode = await whatsappService.requestPairingCode(normalizedId, phoneNumber)
  const updated = await SessionModel.findOne({ sessionId: normalizedId })

  res.json({ pairingCode, session: updated })
})

export const getSessionQr = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const session = await SessionModel.findOne({ sessionId: normalizedId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  res.json({
    sessionId: session.sessionId,
    available: Boolean(session.qrCode),
    qrCode: session.qrCode || null,
    qrCodeUpdatedAt: session.qrCodeUpdatedAt,
    status: session.status
  })
})

export const deleteSession = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const session = await SessionModel.findOne({ sessionId: normalizedId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  await whatsappService.deleteSession(normalizedId)

  res.json({ success: true })
})

export const purgeSessionMessages = asyncHandler(async (req, res) => {
  const normalizedId = normalizeId(req.params.sessionId)
  const session = await SessionModel.findOne({ sessionId: normalizedId })
  if (!session) {
    throw createHttpError(404, 'Sessão não encontrada')
  }

  await MessageModel.deleteMany({ sessionId: normalizedId })
  res.json({ success: true })
})

export default {
  createSession,
  listSessions,
  getSession,
  requestPairingCode,
  getSessionQr,
  deleteSession,
  purgeSessionMessages
}
