import express from 'express'
import cors from 'cors'
import { requireAuth } from './lib/auth.js'
import { authRouter } from './routes/auth.js'
import { calendarRouter } from './routes/calendar.js'
import { clientsRouter } from './routes/clients.js'
import { catalogRouter } from './routes/catalog.js'
import { get } from './lib/db.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, seeded: Boolean(get('SELECT id FROM locations LIMIT 1')) }))

app.use('/api/auth', authRouter)
app.use('/api/clients', requireAuth, clientsRouter)
app.use('/api', requireAuth, calendarRouter)
app.use('/api', requireAuth, catalogRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'server_error', detail: String(err?.message || err) })
})

const PORT = Number(process.env.PORT || 4000)
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`))

