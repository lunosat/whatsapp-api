import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import routes from './routers/index.js'
import { errorHandler, notFound } from './middleware/error-handler.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
