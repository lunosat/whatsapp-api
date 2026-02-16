import mongoose from 'mongoose'

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/whatsapp_api'

export const connectDatabase = async () => {
  const uri = process.env.MONGODB_URI || DEFAULT_URI

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    })
    const { host, port, name } = mongoose.connection
    console.log(`MongoDB conectado em ${host}:${port}/${name}`)
  } catch (error) {
    console.error('Erro ao conectar no MongoDB', error)
    throw error
  }

  return mongoose.connection
}

export default connectDatabase
