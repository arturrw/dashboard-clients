import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { get } from './db.js'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TTL = '30d' // the terminal stays logged in on the venue PC

export const hash = (pw) => bcrypt.hashSync(pw, 10)
export const verify = (pw, h) => bcrypt.compareSync(pw, h)
export const sign = (user) =>
  jwt.sign({ uid: user.id, role: user.role, lid: user.location_id }, SECRET, { expiresIn: TTL })

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'no_token' })
  let claims
  try {
    claims = jwt.verify(token, SECRET)
  } catch {
    return res.status(401).json({ error: 'bad_token' })
  }
  const user = get('SELECT * FROM users WHERE id = ? AND archived = 0', claims.uid)
  if (!user) return res.status(401).json({ error: 'user_gone' })
  req.user = user

  // The admin's home location is fixed by their account, but a call can be
  // forwarded from another venue, so they may act on any location's diary.
  // Audit always records both: who acted, and which location they acted on.
  const asked = Number(req.headers['x-location-id'] || req.query.location_id || 0)
  req.locationId = asked || user.location_id
  if (!req.locationId) {
    const first = get('SELECT id FROM locations WHERE archived = 0 ORDER BY id LIMIT 1')
    req.locationId = first ? first.id : null
  }
  next()
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'owner_only' })
  next()
}
