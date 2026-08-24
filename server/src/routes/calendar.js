import { Router } from 'express'
import { all, get, run, db } from '../lib/db.js'
import { audit, auditFor } from '../lib/audit.js'
import { normalizePhone } from './clients.js'

export const calendarRouter = Router()

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const clampDay = (m) => Math.max(0, Math.min(1440, Math.round(m)))

/**
 * A resource can hold one party at a time. Cancelled and no-show bookings free
 * the slot again, and breaks block it just like a booking does.
 */
function findConflict({ locationId, resourceId, day, startMin, endMin, ignoreBookingId, ignoreBreakId }) {
  const booking = get(
    `SELECT b.id, b.start_min, b.end_min, c.name AS client_name
       FROM bookings b LEFT JOIN clients c ON c.id = b.client_id
      WHERE b.location_id = ? AND b.resource_id = ? AND b.day = ?
        AND b.status NOT IN ('cancelled','no_show')
        AND b.id IS NOT ?
        AND b.start_min < ? AND b.end_min > ?
      LIMIT 1`,
    locationId, resourceId, day, ignoreBookingId ?? null, endMin, startMin
  )
  if (booking) return { type: 'booking', ...booking, label: booking.client_name || `#${booking.id}` }
  const brk = get(
    `SELECT id, start_min, end_min, title FROM breaks
      WHERE location_id = ? AND resource_id = ? AND day = ?
        AND id IS NOT ? AND start_min < ? AND end_min > ? LIMIT 1`,
    locationId, resourceId, day, ignoreBreakId ?? null, endMin, startMin
  )
  if (brk) return { type: 'break', ...brk, label: brk.title }
  return null
}

const bookingSelect = `
  SELECT b.*, c.name AS client_name, c.phone AS client_phone,
         c.permanent_note AS client_permanent_note, c.tags AS client_tags,
         c.blacklisted AS client_blacklisted,
         r.name AS resource_name, r.zone AS resource_zone,
         s.name AS staff_name, s.color AS staff_color,
         l.name AS location_name,
         cl.name AS created_location_name,
         u.display_name AS created_by_name,
         (SELECT COUNT(*) FROM bookings b2
           WHERE b2.client_id = b.client_id AND b2.status NOT IN ('cancelled')
             AND (b2.day < b.day OR (b2.day = b.day AND b2.start_min < b.start_min))) AS prior_visits
    FROM bookings b
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN resources r ON r.id = b.resource_id
    LEFT JOIN staff s ON s.id = b.staff_id
    LEFT JOIN locations l ON l.id = b.location_id
    LEFT JOIN locations cl ON cl.id = b.created_location_id
    LEFT JOIN users u ON u.id = b.created_by`

const hydrate = (b) => {
  if (!b) return null
  const services = all('SELECT * FROM booking_services WHERE booking_id = ? ORDER BY id', b.id)
  return {
    ...b,
    services,
    service_label: services.map((s) => s.name).join(', '),
    start_label: hhmm(b.start_min),
    end_label: hhmm(b.end_min),
    is_new_client: b.prior_visits === 0
  }
}

/** Everything the day grid needs, in one round trip. */
calendarRouter.get('/day', (req, res) => {
  const day = String(req.query.day || '')
  const locationId = req.locationId
  const bookings = all(`${bookingSelect} WHERE b.location_id = ? AND b.day = ? ORDER BY b.start_min`, locationId, day)
  res.json({
    day,
    location: get('SELECT * FROM locations WHERE id = ?', locationId),
    resources: all('SELECT * FROM resources WHERE location_id = ? AND archived = 0 ORDER BY sort_order, id', locationId),
    staff: all('SELECT * FROM staff WHERE location_id = ? AND archived = 0 ORDER BY sort_order, id', locationId),
    services: all('SELECT * FROM services WHERE (location_id = ? OR location_id IS NULL) AND archived = 0 ORDER BY sort_order, id', locationId),
    bookings: bookings.map(hydrate),
    breaks: all(
      `SELECT br.*, s.name AS staff_name FROM breaks br
         LEFT JOIN staff s ON s.id = br.staff_id
        WHERE br.location_id = ? AND br.day = ? ORDER BY br.start_min`,
      locationId, day
    ),
    shifts: all(
      `SELECT sh.*, s.name AS staff_name FROM shifts sh
         JOIN staff s ON s.id = sh.staff_id
        WHERE sh.location_id = ? AND sh.day = ?`,
      locationId, day
    )
  })
})

/** Month overview used for planning the rota ahead. */
calendarRouter.get('/month', (req, res) => {
  const month = String(req.query.month || '') // YYYY-MM
  const locationId = req.locationId
  res.json({
    month,
    days: all(
      `SELECT day,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              SUM(guests) AS guests
         FROM bookings
        WHERE location_id = ? AND day LIKE ? AND status NOT IN ('cancelled')
        GROUP BY day`,
      locationId, `${month}-%`
    ),
    shifts: all(
      `SELECT sh.*, s.name AS staff_name, s.color AS staff_color
         FROM shifts sh JOIN staff s ON s.id = sh.staff_id
        WHERE sh.location_id = ? AND sh.day LIKE ? ORDER BY sh.day, s.sort_order`,
      locationId, `${month}-%`
    ),
    staff: all('SELECT * FROM staff WHERE location_id = ? AND archived = 0 ORDER BY sort_order, id', locationId)
  })
})

calendarRouter.get('/bookings/:id', (req, res) => {
  const b = hydrate(get(`${bookingSelect} WHERE b.id = ?`, req.params.id))
  if (!b) return res.status(404).json({ error: 'not_found' })
  res.json({ ...b, audit: auditFor('booking', b.id) })
})

function resolveClient(req, body) {
  const phone = normalizePhone(body.phone)
  if (!phone) return { client: null, isNew: false }
  let client = get('SELECT * FROM clients WHERE phone = ?', phone)
  if (client) {
    if (body.name && body.name !== client.name) run('UPDATE clients SET name = ? WHERE id = ?', body.name, client.id)
    return { client: get('SELECT * FROM clients WHERE id = ?', client.id), isNew: false }
  }
  // The permanent note is deliberately left off here: applyPermanentNote owns
  // it, so writing one always produces a dated entry in the note history too.
  const r = run(
    'INSERT INTO clients (phone, name, email, created_location_id) VALUES (?, ?, ?, ?)',
    phone, String(body.name || '').trim() || phone, String(body.email || ''), req.locationId
  )
  client = get('SELECT * FROM clients WHERE id = ?', Number(r.lastInsertRowid))
  audit(req, { action: 'create', entity: 'client', entityId: client.id, summary: `New client ${client.name} (${client.phone})` })
  return { client, isNew: true }
}

/**
 * A permanent note lives on the guest card, not on one booking, so writing it
 * also drops a dated entry in the guest's note history. Unchanged text is
 * ignored — re-saving a booking should not pile up duplicates.
 */
function applyPermanentNote(req, clientId, note) {
  if (!clientId || note === undefined) return
  const body = String(note || '')
  const current = get('SELECT permanent_note FROM clients WHERE id = ?', clientId)?.permanent_note ?? ''
  if (body === current) return
  run('UPDATE clients SET permanent_note = ? WHERE id = ?', body, clientId)
  if (body.trim()) {
    run('INSERT INTO client_notes (client_id, body, kind, author_id, location_id) VALUES (?, ?, ?, ?, ?)',
      clientId, body, 'permanent', req.user.id, req.locationId)
  }
}

/** A discount always has to say why — it is money off, and it lands in history. */
const discountNeedsReason = (type, reason) => Boolean(type) && !String(reason || '').trim()

function writeServices(bookingId, services) {
  run('DELETE FROM booking_services WHERE booking_id = ?', bookingId)
  let sum = 0
  for (const s of services || []) {
    const qty = Number(s.qty || 1)
    const price = Number(s.price || 0)
    sum += price * qty
    run(
      'INSERT INTO booking_services (booking_id, service_id, name, duration_min, price, qty) VALUES (?, ?, ?, ?, ?, ?)',
      bookingId, s.service_id ?? null, String(s.name || ''), Number(s.duration_min || 0), price, qty
    )
  }
  return sum
}

const applyDiscount = (gross, type, value) => {
  if (type === 'percent') return Math.max(0, gross * (1 - Number(value || 0) / 100))
  if (type === 'amount') return Math.max(0, gross - Number(value || 0))
  return gross
}

calendarRouter.post('/bookings', (req, res) => {
  const b = req.body || {}
  const locationId = Number(b.location_id || req.locationId)
  const day = String(b.day || '')
  const startMin = clampDay(b.start_min)
  const endMin = clampDay(b.end_min)
  if (!day || endMin <= startMin) return res.status(400).json({ error: 'bad_time' })
  if (!b.resource_id) return res.status(400).json({ error: 'resource_required' })
  if (!resourceBelongsTo(b.resource_id, locationId)) {
    return res.status(400).json({ error: 'resource_not_in_location' })
  }
  if (discountNeedsReason(b.discount_type, b.discount_reason)) {
    return res.status(400).json({ error: 'discount_reason_required' })
  }

  const conflict = findConflict({ locationId, resourceId: b.resource_id, day, startMin, endMin })
  if (conflict && !b.force) return res.status(409).json({ error: 'conflict', conflict })

  const { client, isNew } = resolveClient(req, b)

  const result = db.prepare(
    `INSERT INTO bookings
      (location_id, resource_id, staff_id, client_id, day, start_min, end_min, guests, status,
       importance, note, discount_type, discount_reason, discount_value, gift_card, welcome_drink,
       deposit, was_new_client, source, created_by, created_location_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    locationId, Number(b.resource_id), b.staff_id ? Number(b.staff_id) : null,
    client?.id ?? null, day, startMin, endMin, Number(b.guests || 2),
    b.status || 'booked', b.importance || 'normal', String(b.note || ''),
    String(b.discount_type || ''), String(b.discount_reason || ''), Number(b.discount_value || 0),
    String(b.gift_card || ''), String(b.welcome_drink || ''), Number(b.deposit || 0),
    isNew ? 1 : 0, String(b.source || 'phone'), req.user.id, req.user.location_id ?? req.locationId
  )
  const id = Number(result.lastInsertRowid)
  const gross = writeServices(id, b.services)
  run('UPDATE bookings SET total_sum = ? WHERE id = ?', applyDiscount(gross, b.discount_type, b.discount_value), id)

  if ('permanent_note' in b) applyPermanentNote(req, client?.id, b.permanent_note)

  const full = hydrate(get(`${bookingSelect} WHERE b.id = ?`, id))
  audit(req, {
    action: 'create',
    entity: 'booking',
    entityId: id,
    targetLocationId: locationId,
    summary: `Booked ${client?.name || 'walk-in'} for ${full.service_label || 'reservation'} at ${hhmm(startMin)}`,
    payload: { day, start: hhmm(startMin), end: hhmm(endMin), resource_id: b.resource_id, client_id: client?.id }
  })
  res.status(201).json({ ...full, client_is_new: isNew, conflict_overridden: Boolean(conflict) })
})

const PATCHABLE = [
  'location_id', 'resource_id', 'staff_id', 'day', 'start_min', 'end_min', 'guests', 'status', 'importance',
  'note', 'discount_type', 'discount_reason', 'discount_value', 'gift_card', 'welcome_drink', 'deposit', 'source'
]

/** A table only exists inside its own venue, so the pair has to agree. */
const resourceBelongsTo = (resourceId, locationId) =>
  Boolean(get('SELECT id FROM resources WHERE id = ? AND location_id = ?', Number(resourceId), Number(locationId)))

calendarRouter.patch('/bookings/:id', (req, res) => {
  const before = get('SELECT * FROM bookings WHERE id = ?', req.params.id)
  if (!before) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}

  // Cancelling without a written reason is rejected on the server too, not
  // only in the dialog, so the trail is never left with an unexplained gap.
  if (b.status === 'cancelled' && !String(b.cancel_reason || '').trim()) {
    return res.status(400).json({ error: 'cancel_reason_required' })
  }

  const next = { ...before }
  for (const f of PATCHABLE) if (f in b) next[f] = b[f]
  next.start_min = clampDay(next.start_min)
  next.end_min = clampDay(next.end_min)
  if (next.end_min <= next.start_min) return res.status(400).json({ error: 'bad_time' })
  if (!resourceBelongsTo(next.resource_id, next.location_id)) {
    return res.status(400).json({ error: 'resource_not_in_location' })
  }

  // Only judged when the request actually touches the discount, so a plain
  // status change never trips over a legacy record.
  const touchesDiscount = 'discount_type' in b || 'discount_reason' in b || 'discount_value' in b
  if (touchesDiscount && discountNeedsReason(next.discount_type, next.discount_reason)) {
    return res.status(400).json({ error: 'discount_reason_required' })
  }

  // Guest details are edited on the booking form, so they have to be written
  // back to the guest card here — otherwise a corrected name or a new
  // permanent note would silently vanish on save.
  let clientId = before.client_id
  if ('phone' in b || 'name' in b || 'permanent_note' in b) {
    if (normalizePhone(b.phone)) {
      const { client } = resolveClient(req, b)
      if (client) clientId = client.id
    } else if (clientId && b.name) {
      run('UPDATE clients SET name = ? WHERE id = ?', String(b.name), clientId)
    }
    if ('permanent_note' in b) applyPermanentNote(req, clientId, b.permanent_note)
  }

  // A guest can be re-seated at another venue entirely — a forwarded call often
  // ends with "actually, the one near me suits better".
  const relocated = Number(next.location_id) !== before.location_id
  const moved =
    relocated || next.resource_id !== before.resource_id || next.day !== before.day ||
    next.start_min !== before.start_min || next.end_min !== before.end_min

  if (moved && next.status !== 'cancelled') {
    const conflict = findConflict({
      locationId: next.location_id, resourceId: next.resource_id, day: next.day,
      startMin: next.start_min, endMin: next.end_min, ignoreBookingId: before.id
    })
    if (conflict && !b.force) return res.status(409).json({ error: 'conflict', conflict })
  }

  run(
    `UPDATE bookings SET location_id = ?, resource_id = ?, staff_id = ?, client_id = ?, day = ?, start_min = ?, end_min = ?, guests = ?,
       status = ?, importance = ?, note = ?, cancel_reason = ?, discount_type = ?, discount_reason = ?,
       discount_value = ?, gift_card = ?, welcome_drink = ?, deposit = ?, source = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    Number(next.location_id),
    Number(next.resource_id), next.staff_id ? Number(next.staff_id) : null, clientId ?? null, next.day,
    next.start_min, next.end_min, Number(next.guests), next.status, next.importance,
    String(next.note || ''), String(b.cancel_reason ?? before.cancel_reason ?? ''),
    String(next.discount_type || ''), String(next.discount_reason || ''), Number(next.discount_value || 0),
    String(next.gift_card || ''), String(next.welcome_drink || ''), Number(next.deposit || 0),
    String(next.source || 'phone'), before.id
  )

  if (Array.isArray(b.services)) {
    const gross = writeServices(before.id, b.services)
    run('UPDATE bookings SET total_sum = ? WHERE id = ?', applyDiscount(gross, next.discount_type, next.discount_value), before.id)
  } else if ('discount_type' in b || 'discount_value' in b) {
    const gross = all('SELECT price, qty FROM booking_services WHERE booking_id = ?', before.id)
      .reduce((acc, s) => acc + s.price * s.qty, 0)
    run('UPDATE bookings SET total_sum = ? WHERE id = ?', applyDiscount(gross, next.discount_type, next.discount_value), before.id)
  }

  const venueName = relocated ? get('SELECT name FROM locations WHERE id = ?', next.location_id)?.name : null
  const summary =
    b.status === 'cancelled' ? `Cancelled: ${b.cancel_reason}`
      : relocated ? `Moved to ${venueName} — ${next.day} ${hhmm(next.start_min)}–${hhmm(next.end_min)}`
      : moved ? `Moved to ${next.day} ${hhmm(next.start_min)}–${hhmm(next.end_min)}`
      : b.status && b.status !== before.status ? `Status → ${b.status}`
      : 'Updated booking'

  audit(req, {
    action: b.status === 'cancelled' ? 'cancel' : moved ? 'move' : 'update',
    entity: 'booking',
    entityId: before.id,
    targetLocationId: next.location_id,
    summary,
    payload: {
      before: { location_id: before.location_id, day: before.day, start: hhmm(before.start_min), end: hhmm(before.end_min), resource_id: before.resource_id, status: before.status },
      after: { location_id: next.location_id, day: next.day, start: hhmm(next.start_min), end: hhmm(next.end_min), resource_id: next.resource_id, status: next.status }
    }
  })
  res.json(hydrate(get(`${bookingSelect} WHERE b.id = ?`, before.id)))
})

calendarRouter.delete('/bookings/:id', (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'owner_only' })
  const b = get('SELECT * FROM bookings WHERE id = ?', req.params.id)
  if (!b) return res.status(404).json({ error: 'not_found' })
  run('DELETE FROM bookings WHERE id = ?', b.id)
  audit(req, {
    action: 'delete', entity: 'booking', entityId: b.id, targetLocationId: b.location_id,
    summary: `Deleted booking on ${b.day} ${hhmm(b.start_min)}`, payload: b
  })
  res.json({ ok: true })
})

/* ---------------------------------- breaks --------------------------------- */

calendarRouter.post('/breaks', (req, res) => {
  const b = req.body || {}
  const locationId = Number(b.location_id || req.locationId)
  const startMin = clampDay(b.start_min)
  const endMin = clampDay(b.end_min)
  if (endMin <= startMin) return res.status(400).json({ error: 'bad_time' })
  const conflict = findConflict({ locationId, resourceId: b.resource_id, day: b.day, startMin, endMin })
  if (conflict && !b.force) return res.status(409).json({ error: 'conflict', conflict })
  const r = run(
    'INSERT INTO breaks (location_id, resource_id, staff_id, day, start_min, end_min, title, kind, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    locationId, b.resource_id ? Number(b.resource_id) : null, b.staff_id ? Number(b.staff_id) : null,
    String(b.day), startMin, endMin, String(b.title || 'Break'), String(b.kind || 'break'), req.user.id
  )
  const id = Number(r.lastInsertRowid)
  audit(req, {
    action: 'create', entity: 'break', entityId: id, targetLocationId: locationId,
    summary: `${b.title || 'Break'} ${hhmm(startMin)}–${hhmm(endMin)} on ${b.day}`
  })
  res.status(201).json(get('SELECT * FROM breaks WHERE id = ?', id))
})

calendarRouter.patch('/breaks/:id', (req, res) => {
  const before = get('SELECT * FROM breaks WHERE id = ?', req.params.id)
  if (!before) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const next = {
    resource_id: 'resource_id' in b ? b.resource_id : before.resource_id,
    day: b.day ?? before.day,
    start_min: clampDay('start_min' in b ? b.start_min : before.start_min),
    end_min: clampDay('end_min' in b ? b.end_min : before.end_min),
    title: b.title ?? before.title,
    kind: b.kind ?? before.kind
  }
  if (next.end_min <= next.start_min) return res.status(400).json({ error: 'bad_time' })
  const conflict = findConflict({
    locationId: before.location_id, resourceId: next.resource_id, day: next.day,
    startMin: next.start_min, endMin: next.end_min, ignoreBreakId: before.id
  })
  if (conflict && !b.force) return res.status(409).json({ error: 'conflict', conflict })
  run(
    'UPDATE breaks SET resource_id = ?, day = ?, start_min = ?, end_min = ?, title = ?, kind = ? WHERE id = ?',
    next.resource_id ? Number(next.resource_id) : null, next.day, next.start_min, next.end_min,
    String(next.title), String(next.kind), before.id
  )
  audit(req, {
    action: 'move', entity: 'break', entityId: before.id, targetLocationId: before.location_id,
    summary: `${next.title} moved to ${next.day} ${hhmm(next.start_min)}–${hhmm(next.end_min)}`,
    payload: { before, after: next }
  })
  res.json(get('SELECT * FROM breaks WHERE id = ?', before.id))
})

calendarRouter.delete('/breaks/:id', (req, res) => {
  const b = get('SELECT * FROM breaks WHERE id = ?', req.params.id)
  if (!b) return res.status(404).json({ error: 'not_found' })
  run('DELETE FROM breaks WHERE id = ?', b.id)
  audit(req, {
    action: 'delete', entity: 'break', entityId: b.id, targetLocationId: b.location_id,
    summary: `Removed ${b.title} on ${b.day}`
  })
  res.json({ ok: true })
})

/* ---------------------------------- shifts --------------------------------- */

calendarRouter.put('/shifts', (req, res) => {
  const { staff_id, day, start_min, end_min, note } = req.body || {}
  if (!staff_id || !day) return res.status(400).json({ error: 'bad_request' })
  const s = get('SELECT * FROM staff WHERE id = ?', staff_id)
  run(
    `INSERT INTO shifts (location_id, staff_id, day, start_min, end_min, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(staff_id, day) DO UPDATE SET start_min = excluded.start_min,
       end_min = excluded.end_min, note = excluded.note`,
    req.locationId, Number(staff_id), String(day), clampDay(start_min ?? 600), clampDay(end_min ?? 1320), String(note || '')
  )
  audit(req, {
    action: 'update', entity: 'shift', entityId: Number(staff_id),
    summary: `Rota ${s?.name ?? staff_id} on ${day}: ${hhmm(clampDay(start_min ?? 600))}–${hhmm(clampDay(end_min ?? 1320))}`
  })
  res.json(get('SELECT * FROM shifts WHERE staff_id = ? AND day = ?', Number(staff_id), String(day)))
})

calendarRouter.delete('/shifts', (req, res) => {
  const { staff_id, day } = req.query
  const s = get('SELECT * FROM staff WHERE id = ?', staff_id)
  run('DELETE FROM shifts WHERE staff_id = ? AND day = ?', Number(staff_id), String(day))
  audit(req, { action: 'delete', entity: 'shift', entityId: Number(staff_id), summary: `Cleared rota ${s?.name ?? staff_id} on ${day}` })
  res.json({ ok: true })
})
