import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState
} from 'baileys'
import pino from 'pino'
import fs from 'fs/promises'
import path from 'path'
import qrcode from 'qrcode-terminal'
import { randomUUID } from 'crypto'

import SessionModel from '../models/session.model.js'
import MessageModel from '../models/message.model.js'
import HttpError, { createHttpError } from '../utils/http-error.js'

const AUTH_FOLDER = process.env.AUTH_FOLDER || path.resolve(process.cwd(), 'storage/sessions')
const PAIRING_CODE_TTL = Number(process.env.PAIRING_CODE_TTL || 2 * 60 * 1000)
const PRINT_QR_IN_TERMINAL = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.PRINT_QR_IN_TERMINAL || 'false').toLowerCase()
)

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
}

const sanitizePhone = (value) => String(value ?? '').replace(/[^0-9]/g, '')

const jidToPhone = (jid = '') => {
  if (!jid) return ''
  const [withoutResource] = jid.split('@')
  const [phone] = withoutResource.split(':')
  return sanitizePhone(phone)
}

const extractMessageText = (message = {}) => {
  if (!message) return ''
  if (message.conversation) return message.conversation
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
  if (message.imageMessage?.caption) return message.imageMessage.caption
  if (message.videoMessage?.caption) return message.videoMessage.caption
  if (message.documentWithCaptionMessage?.caption) return message.documentWithCaptionMessage.caption
  if (message.templateMessage?.hydratedTemplate?.hydratedContentText) {
    return message.templateMessage.hydratedTemplate.hydratedContentText
  }
  return ''
}

class WhatsAppService {
  constructor() {
    this.sessions = new Map()
    this.logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'info' })
  }

  async ensureSessionDocument(sessionId, payload = {}) {
    const normalizedId = sessionId.toLowerCase()
    return SessionModel.findOneAndUpdate(
      { sessionId: normalizedId },
      {
        $set: payload,
        $setOnInsert: { sessionId: normalizedId }
      },
      { new: true, upsert: true }
    )
  }

  async ensureSocket(sessionId, { forceNew = false } = {}) {
    const normalizedId = sessionId.toLowerCase()
    if (!forceNew && this.sessions.has(normalizedId)) {
      return this.sessions.get(normalizedId)
    }

    if (forceNew) {
      this.teardownSession(normalizedId)
    }

    await ensureDir(path.join(AUTH_FOLDER, normalizedId))
    const { state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_FOLDER, normalizedId))
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
      auth: state,
      printQRInTerminal: false,
      browser: ['Herosoft', 'Chrome'],
      syncFullHistory: false
    })

    this.registerListeners(normalizedId, sock, saveCreds)

    const sessionData = { sock, saveCreds }
    this.sessions.set(normalizedId, sessionData)
    await this.ensureSessionDocument(normalizedId, { status: 'connecting', errorMessage: null })
    return sessionData
  }

  registerListeners(sessionId, sock, saveCreds) {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        await this.ensureSessionDocument(sessionId, {
          status: 'waiting-qr',
          qrCode: qr,
          qrCodeUpdatedAt: new Date(),
          pairingCode: null,
          pairingCodeExpiresAt: null
        })

        if (PRINT_QR_IN_TERMINAL) {
          this.logger.info(`QR code atualizado para sessão ${sessionId}. Escaneie com o app WhatsApp.`)
          qrcode.generate(qr, { small: true })
        }
      }

      if (connection === 'open') {
        const fullJid = sock.user?.id
        const normalizedJid = fullJid ? jidNormalizedUser(fullJid) : null
        await this.ensureSessionDocument(sessionId, {
          status: 'connected',
          whatsappId: normalizedJid,
          phoneNumber: jidToPhone(fullJid),
          lastConnectedAt: new Date(),
          pairingCode: null,
          pairingCodeExpiresAt: null,
          qrCode: null,
          qrCodeUpdatedAt: null,
          errorMessage: null
        })
        this.logger.info(`Sessão ${sessionId} conectada`)
        return
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        if (shouldReconnect) {
          await this.ensureSessionDocument(sessionId, { status: 'reconnecting' })
          this.logger.warn(`Sessão ${sessionId} desconectada, tentando reconectar`)
          setTimeout(() => {
            this.ensureSocket(sessionId, { forceNew: true }).catch((error) => {
              this.logger.error({ err: error }, `Falha ao reconectar sessão ${sessionId}`)
            })
          }, 2000)
        } else {
          this.logger.warn(`Sessão ${sessionId} encerrou via logout`)
          await this.handleLoggedOut(sessionId)
        }
        return
      }

      if (connection === 'connecting') {
        await this.ensureSessionDocument(sessionId, { status: 'connecting' })
      }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
      await Promise.all(
        messages.map(async (msg) => {
          const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date()
          const isFromMe = Boolean(msg.key.fromMe)
          const remoteJid = msg.key.remoteJid ? jidNormalizedUser(msg.key.remoteJid) : ''
          const from = isFromMe ? jidToPhone(sock.user?.id) : jidToPhone(msg.key.participant || remoteJid)
          const to = isFromMe ? jidToPhone(remoteJid) : jidToPhone(sock.user?.id)
          const text = extractMessageText(msg.message)

          try {
            await MessageModel.findOneAndUpdate(
              { sessionId, whatsappMessageId: msg.key.id },
              {
                sessionId,
                whatsappMessageId: msg.key.id,
                direction: isFromMe ? 'outgoing' : 'incoming',
                status: isFromMe ? 'sent' : 'received',
                from,
                to,
                text,
                messageType: Object.keys(msg.message || { conversation: null })[0],
                payload: msg.message,
                messageTimestamp: timestamp
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            )
          } catch (error) {
            this.logger.error({ err: error }, 'Erro ao salvar mensagem recebida')
          }
        })
      )
    })

    sock.ev.on('creds.update', saveCreds)
  }

  teardownSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    try {
      session.sock.ev.removeAllListeners('connection.update')
      session.sock.ev.removeAllListeners('messages.upsert')
      session.sock.ev.removeAllListeners('creds.update')
      session.sock.end?.()
    } catch (error) {
      this.logger.warn({ err: error }, `Erro ao encerrar listeners da sessão ${sessionId}`)
    }
    this.sessions.delete(sessionId)
  }

  async handleLoggedOut(sessionId) {
    this.teardownSession(sessionId)
    await this.ensureSessionDocument(sessionId, {
      status: 'logged-out',
      whatsappId: null,
      phoneNumber: null,
      qrCode: null,
      qrCodeUpdatedAt: null,
      pairingCode: null,
      pairingCodeExpiresAt: null
    })
  }

  async requestPairingCode(sessionId, phoneNumber) {
    const normalizedId = sessionId.toLowerCase()
    const sanitizedPhone = sanitizePhone(phoneNumber)
    if (!sanitizedPhone) {
      throw createHttpError(400, 'Número de telefone inválido')
    }

    const { sock } = await this.ensureSocket(normalizedId)
    if (sock?.user) {
      throw createHttpError(409, 'Sessão já conectada. Apague ou reinicie antes de gerar um novo código.')
    }

    await this.ensureSessionDocument(normalizedId, {
      status: 'waiting-code',
      pairingCode: null,
      pairingCodeExpiresAt: null,
      qrCode: null,
      qrCodeUpdatedAt: null
    })
    const pairingCode = await sock.requestPairingCode(sanitizedPhone)
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL)

    await this.ensureSessionDocument(normalizedId, {
      pairingCode,
      pairingCodeExpiresAt: expiresAt
    })

    return pairingCode
  }

  async sendTextMessage(sessionId, phoneNumber, message) {
    const normalizedId = sessionId.toLowerCase()
    const sanitizedDestination = sanitizePhone(phoneNumber)
    const preparedMessage = message ?? ''
    const textContent = typeof preparedMessage === 'string' ? preparedMessage : String(preparedMessage)
    const payload = { text: textContent }
    const fallbackMessageId = randomUUID()
    let messageId = fallbackMessageId
    let resolvedPhone = sanitizedDestination
    let fromPhone = null

    const persistAttempt = async (status, extra = {}) => {
      try {
        await MessageModel.create({
          sessionId: normalizedId,
          whatsappMessageId: messageId,
          direction: 'outgoing',
          status,
          from: fromPhone,
          to: resolvedPhone,
          text: textContent,
          messageType: 'conversation',
          payload,
          messageTimestamp: new Date(),
          ...extra
        })
      } catch (error) {
        this.logger.error({ err: error }, 'Erro ao salvar mensagem enviada via API')
      }
    }

    try {
      if (!phoneNumber) {
        throw createHttpError(400, 'O campo to é obrigatório')
      }

      if (!sanitizedDestination) {
        throw createHttpError(400, 'Destino inválido')
      }

      if (!message) {
        throw createHttpError(400, 'O campo message é obrigatório')
      }

      if (!textContent.trim()) {
        throw createHttpError(400, 'Mensagem obrigatória')
      }

      const { sock } = await this.ensureSocket(normalizedId)
      if (!sock?.user) {
        throw createHttpError(400, 'Sessão não está conectada. Gere o código e conecte primeiro.')
      }

      fromPhone = jidToPhone(sock.user.id)
      const jid = jidNormalizedUser(`${sanitizedDestination}@s.whatsapp.net`)
      const [numberInfo] = await sock.onWhatsApp(jid)
      const resolvedJid = numberInfo?.jid ? jidNormalizedUser(numberInfo.jid) : null
      if (!resolvedJid || numberInfo?.exists === false) {
        throw createHttpError(400, 'O número informado não possui WhatsApp ativo ou é inválido')
      }

      resolvedPhone = jidToPhone(resolvedJid) || resolvedPhone

      const response = (await sock.sendMessage(resolvedJid, { text: textContent })) || {}
      messageId = response?.key?.id || fallbackMessageId
      if (!response.key) {
        response.key = {}
      }
      if (!response.key.id) {
        response.key.id = messageId
      }

      await persistAttempt('sent')

      return response
    } catch (error) {
      const errorMessage = error?.message || 'Erro desconhecido'
      await persistAttempt('failed', { errorMessage })

      if (error instanceof HttpError) {
        throw error
      }

      this.logger.error({ err: error }, `Erro ao enviar mensagem na sessão ${sessionId}`)
      throw createHttpError(500, 'Não foi possível enviar a mensagem', errorMessage)
    }
  }

  async deleteSession(sessionId) {
    const normalizedId = sessionId.toLowerCase()
    const session = this.sessions.get(normalizedId)

    if (session) {
      try {
        await session.sock.logout()
      } catch (error) {
        this.logger.warn({ err: error }, `Não foi possível fazer logout da sessão ${normalizedId}`)
      }
    }

    this.teardownSession(normalizedId)

    await fs.rm(path.join(AUTH_FOLDER, normalizedId), { recursive: true, force: true })
    await SessionModel.deleteOne({ sessionId: normalizedId })
  }
}

const whatsappService = new WhatsAppService()

export default whatsappService
