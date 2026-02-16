export class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.details = details
  }
}

export const createHttpError = (statusCode, message, details) =>
  new HttpError(statusCode, message, details)

export default HttpError
