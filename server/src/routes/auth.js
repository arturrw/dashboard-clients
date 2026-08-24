import { Router } from 'express'
import { all, get } from '../lib/db.js'
import { sign, verify, requireAuth } from '../lib/auth.js'
import { audit } from '../lib/audit.js'

export const authRouter = Router()

/** Venue accounts are listed so the terminal can bind itself to one. */
authRouter.get('/accounts', (_req, res) => {
  res.json(
    all(`SELECT u.username, u.display_name, u.role, u.location_id, l.name AS location_name, l.accent
           FROM users u LEFT JOIN locations l ON l.id = u.location_id
          WHERE u.archived = 0
          ORDER BY u.role DESC, l.id`)
  )
})

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = get('SELECT * FROM users WHERE username = ? AND archived = 0', String(username || '').trim())
  if (!user || !verify(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials' })
  }
  const location = user.location_id ? get('SELECT * FROM locations WHERE id = ?', user.location_id) : null
  req.user = user
  req.locationId = user.location_id
  audit(req, { action: 'login', entity: 'user', entityId: user.id, summary: `${user.display_name} signed in` })
  res.json({
    token: sign(user),
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      location_id: user.location_id,
      location_name: location?.name ?? null
    }
  })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const u = req.user
  const location = u.location_id ? get('SELECT * FROM locations WHERE id = ?', u.location_id) : null
  res.json({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    location_id: u.location_id,
    location_name: location?.name ?? null
  })
})
