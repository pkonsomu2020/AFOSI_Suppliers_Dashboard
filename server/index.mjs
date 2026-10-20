import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { authRouter } from './auth.mjs'
import { suppliersRouter } from './suppliers.mjs'
import { documentsRouter } from './documents.mjs'
import { aiRouter } from './ai-routes.mjs'

const PORT = process.env.PORT || 8810

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || 'https://suppliers.afosi.org', credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter())
app.use('/api/suppliers', suppliersRouter())
app.use('/api/documents', documentsRouter())
app.use('/api', aiRouter())

app.listen(PORT, '127.0.0.1', () => {
  console.log(`afosi-suppliers-backend listening on 127.0.0.1:${PORT}`)
})
