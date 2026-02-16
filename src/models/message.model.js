import mongoose from 'mongoose'

const { Schema } = mongoose

const messageSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
      lowercase: true
    },
    whatsappMessageId: {
      type: String,
      required: true
    },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true
    },
    status: {
      type: String,
      enum: ['received', 'sent', 'failed'],
      default: 'received'
    },
    from: String,
    to: String,
    text: String,
    messageType: String,
    payload: Schema.Types.Mixed,
    errorMessage: String,
    messageTimestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
)

messageSchema.index({ sessionId: 1, whatsappMessageId: 1 }, { unique: true })
messageSchema.index({ sessionId: 1, direction: 1 })
messageSchema.index({ sessionId: 1, status: 1 })

export const MessageModel = mongoose.model('Message', messageSchema)

export default MessageModel
