import mongoose from 'mongoose'

const { Schema } = mongoose

const sessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    label: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['idle', 'connecting', 'waiting-qr', 'waiting-code', 'connected', 'reconnecting', 'disconnected', 'error', 'logged-out'],
      default: 'idle'
    },
    whatsappId: String,
    phoneNumber: String,
    pairingCode: String,
    pairingCodeExpiresAt: Date,
    qrCode: String,
    qrCodeUpdatedAt: Date,
    lastConnectedAt: Date,
    errorMessage: String
  },
  {
    timestamps: true
  }
)

sessionSchema.index({ status: 1 })

export const SessionModel = mongoose.model('Session', sessionSchema)

export default SessionModel
