import { Router } from 'express'
import { all, get, run } from '../lib/db.js'
import { audit } from '../lib/audit.js'

export const clientsRouter = Router()

/** Digits only, so "+371 20 123 456" and "37120123456" find the same person. */
export const normalizePhone = (raw) => String(raw || '').replace(/[^\d]/g, '')

/**
 * `day` holds the venue's local calendar date, so "today" must be local too —
 * plain date('now') is UTC and would call tonight's bookings "upcoming" until
 * 02:00/03:00 in Rīga.
 */
const TODAY = "date('now', 'localtime')"

const withStats = (c) => {
  if (!c) return null
  const stats = get(
    `SELECT COUNT(*) AS visits,
            SUM(CASE WHEN status = 'completed' THEN total_sum ELSE 0 END) AS spend,
            MAX(CASE WHEN status NOT IN ('cancelled','no_show') AND day <= ${TODAY} THEN day END) AS last_day,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancels
       FROM bookings WHERE client_id = ?`,
    c.id
  )
  return {
    ...c,
    visits: stats?.visits ?? 0,
    spend: Number(stats?.spend ?? 0),
    last_day: stats?.last_day ?? null,
    no_shows: stats?.no_shows ?? 0,
    cancels: stats?.cancels ?? 0,
    is_new: (stats?.visits ?? 0) === 0
  }
}

// "Previous service" must mean the last visit that already happened — a
// reservation booked for next month is not history yet.
const visitSelect = `
  SELECT b.day, b.start_min, b.status, s.name AS staff_name, l.name AS location_name,
         (SELECT GROUP_CONCAT(name, ', ') FROM booking_services WHERE booking_id = b.id) AS services
    FROM bookings b
    LEFT JOIN staff s ON s.id = b.staff_id
    LEFT JOIN locations l ON l.id = b.location_id
   WHERE b.client_id = ? AND b.status NOT IN ('cancelled')`

/** Stats plus the last and next visit — the shape the booking dialog's guest panel reads. */
const withVisits = (c) =>
  c && {
    ...withStats(c),
    last_visit: get(`${visitSelect} AND b.day <= ${TODAY} ORDER BY b.day DESC, b.start_min DESC LIMIT 1`, c.id) ?? null,
    next_visit: get(`${visitSelect} AND b.day > ${TODAY} ORDER BY b.day ASC, b.start_min ASC LIMIT 1`, c.id) ?? null
  }

/** Typeahead behind the phone field. Matches on digits or on name. */
clientsRouter.get('/lookup', (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 3) return res.json([])
  const digits = normalizePhone(q)
  const rows = digits
    ? all('SELECT * FROM clients WHERE phone LIKE ? ORDER BY name LIMIT 8', `%${digits}%`)
    : all('SELECT * FROM clients WHERE name LIKE ? ORDER BY name LIMIT 8', `%${q}%`)
  res.json(rows.map(withVisits))
})

clientsRouter.get('/', (req, res) => {
  const q = String(req.query.q || '').trim()
  const rows = q
    ? all('SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 200', `%${q}%`, `%${normalizePhone(q) || q}%`)
    : all('SELECT * FROM clients ORDER BY id DESC LIMIT 200')
  res.json(rows.map(withStats))
})

clientsRouter.get('/:id', (req, res) => {
  const client = withVisits(get('SELECT * FROM clients WHERE id = ?', req.params.id))
  if (!client) return res.status(404).json({ error: 'not_found' })
  const history = all(
    `SELECT b.*, l.name AS location_name, r.name AS resource_name, s.name AS staff_name,
            (SELECT GROUP_CONCAT(name, ', ') FROM booking_services WHERE booking_id = b.id) AS services
       FROM bookings b
       LEFT JOIN locations l ON l.id = b.location_id
       LEFT JOIN resources r ON r.id = b.resource_id
       LEFT JOIN staff s ON s.id = b.staff_id
      WHERE b.client_id = ?
      ORDER BY b.day DESC, b.start_min DESC`,
    client.id
  )
  const notes = all(
    `SELECT n.*, u.display_name AS author_name, l.name AS location_name
       FROM client_notes n
       LEFT JOIN users u ON u.id = n.author_id
       LEFT JOIN locations l ON l.id = n.location_id
      WHERE n.client_id = ? ORDER BY n.id DESC`,
    client.id
  )
  // Discount and cancellation trail, so the history explains every price change.
  const adjustments = history
    .filter((b) => b.discount_type || b.cancel_reason || b.gift_card || b.deposit)
    .map((b) => ({
      booking_id: b.id,
      day: b.day,
      discount_type: b.discount_type,
      discount_reason: b.discount_reason,
      discount_value: b.discount_value,
      gift_card: b.gift_card,
      deposit: b.deposit,
      cancel_reason: b.cancel_reason,
      status: b.status
    }))
  res.json({ ...client, history, notes, adjustments })
})

clientsRouter.patch('/:id', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ?', req.params.id)
  if (!client) return res.status(404).json({ error: 'not_found' })
  const fields = ['name', 'email', 'birthday', 'permanent_note', 'tags', 'blacklisted']
  const patch = {}
  for (const f of fields) if (f in (req.body || {})) patch[f] = req.body[f]
  if ('phone' in (req.body || {})) patch.phone = normalizePhone(req.body.phone)
  const keys = Object.keys(patch)
  if (!keys.length) return res.json(withStats(client))
  run(`UPDATE clients SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), client.id)
  audit(req, {
    action: 'update',
    entity: 'client',
    entityId: client.id,
    summary: `Updated client ${patch.name || client.name}`,
    payload: { before: client, after: patch }
  })
  res.json(withStats(get('SELECT * FROM clients WHERE id = ?', client.id)))
})

clientsRouter.post('/:id/notes', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ?', req.params.id)
  if (!client) return res.status(404).json({ error: 'not_found' })
  const body = String(req.body?.body || '').trim()
  const kind = req.body?.kind === 'permanent' ? 'permanent' : 'note'
  if (!body) return res.status(400).json({ error: 'empty_note' })
  const r = run(
    'INSERT INTO client_notes (client_id, body, kind, author_id, location_id) VALUES (?, ?, ?, ?, ?)',
    client.id, body, kind, req.user.id, req.locationId
  )
  // A permanent note has to be visible straight from the calendar tile.
  if (kind === 'permanent') run('UPDATE clients SET permanent_note = ? WHERE id = ?', body, client.id)
  audit(req, {
    action: 'create',
    entity: 'client_note',
    entityId: Number(r.lastInsertRowid),
    summary: `${kind === 'permanent' ? 'Permanent note' : 'Note'} on ${client.name}: ${body}`,
    payload: { client_id: client.id, kind, body }
  })
  res.status(201).json({ id: Number(r.lastInsertRowid) })
})

clientsRouter.delete('/:id/notes/:noteId', (req, res) => {
  const note = get('SELECT * FROM client_notes WHERE id = ? AND client_id = ?', req.params.noteId, req.params.id)
  if (!note) return res.status(404).json({ error: 'not_found' })
  run('DELETE FROM client_notes WHERE id = ?', note.id)
  if (note.kind === 'permanent') run('UPDATE clients SET permanent_note = ? WHERE id = ?', '', note.client_id)
  audit(req, { action: 'delete', entity: 'client_note', entityId: note.id, summary: `Removed note: ${note.body}` })
  res.json({ ok: true })
})

export { withStats }
