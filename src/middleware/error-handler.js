import { HttpError } from '../utils/http-error.js'

export const notFound = (req, res, next) => {
  next(new HttpError(404, 'Recurso não encontrado'))
}

export const errorHandler = (error, req, res, next) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500
  const payload = {
    message: error.message || 'Erro interno do servidor'
  }

  if (error?.details) {
    payload.details = error.details
  }

  if (process.env.NODE_ENV !== 'production' && !(error instanceof HttpError)) {
    payload.stack = error.stack
  }

  res.status(statusCode).json(payload)
}

export default errorHandler
