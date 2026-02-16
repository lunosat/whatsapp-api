import 'dotenv/config'

import app from './app.js'
import connectDatabase from './config/database.js'
import SessionModel from './models/session.model.js'
import whatsappService from './whatsapp/index.js'

const port = Number(process.env.PORT || 3333)

const bootstrapSessions = async () => {
  const sessions = await SessionModel.find()
  await Promise.all(
    sessions.map(async (session) => {
      try {
        await whatsappService.ensureSocket(session.sessionId)
      } catch (error) {
        console.error(`Falha ao iniciar sessão ${session.sessionId}`, error)
      }
    })
  )
}

const start = async () => {
  try {
    await connectDatabase()
    await bootstrapSessions()
    app.listen(port, () => {
      console.log(`Servidor WhatsApp API rodando na porta ${port}`)
    })
  } catch (error) {
    console.error('Não foi possível iniciar o servidor', error)
    process.exit(1)
  }
}

start()
