import { Router } from 'express'
import { all, get, run } from '../lib/db.js'
import { audit } from '../lib/audit.js'
import { hash } from '../lib/auth.js'

export const catalogRouter = Router()

const ownerOnly = (req, res, next) =>
  req.user?.role === 'owner' ? next() : res.status(403).json({ error: 'owner_only' })

/**
 * Generic CRUD for the owner-managed reference tables. Each entry declares the
 * columns the owner may write and how a row is described in the audit trail.
 */
const ENTITIES = {
  locations: {
    table: 'locations',
    scoped: false,
    fields: ['slug', 'name', 'address', 'phone', 'open_min', 'close_min', 'slot_min', 'accent', 'archived'],
    label: (r) => r.name
  },
  resources: {
    table: 'resources',
    scoped: true,
    fields: ['name', 'zone', 'seats', 'sort_order', 'archived'],
    label: (r) => r.name
  },
  staff: {
    table: 'staff',
    scoped: true,
    fields: ['name', 'role', 'color', 'phone', 'sort_order', 'archived'],
    label: (r) => r.name
  },
  services: {
    table: 'services',
    scoped: true,
    fields: ['name_en', 'name_lv', 'name_ru', 'category', 'duration_min', 'price', 'sort_order', 'archived'],
    label: (r) => r.name_en
  },
  products: {
    table: 'products',
    scoped: true,
    fields: ['sku', 'name', 'category', 'unit', 'supply_price', 'retail_price', 'supplier', 'stock', 'min_stock', 'archived'],
    label: (r) => r.name
  }
}

for (const [key, def] of Object.entries(ENTITIES)) {
  catalogRouter.get(`/${key}`, (req, res) => {
    const showArchived = req.query.archived === '1'
    const where = []
    const args = []
    if (def.scoped) {
      // Services and products may be chain-wide (location_id IS NULL).
      where.push('(location_id = ? OR location_id IS NULL)')
      args.push(req.locationId)
    }
    if (!showArchived) where.push('archived = 0')
    const sql = `SELECT * FROM ${def.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${
      def.fields.includes('sort_order') ? 'sort_order, ' : ''
    }id`
    res.json(all(sql, ...args))
  })

  catalogRouter.post(`/${key}`, ownerOnly, (req, res) => {
    const body = req.body || {}
    const cols = def.fields.filter((f) => f in body)
    const vals = cols.map((c) => body[c])
    if (def.scoped) {
      cols.push('location_id')
      vals.push(body.location_id === null ? null : Number(body.location_id || req.locationId))
    }
    if (!cols.length) return res.status(400).json({ error: 'empty' })
    const r = run(
      `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...vals
    )
    const row = get(`SELECT * FROM ${def.table} WHERE id = ?`, Number(r.lastInsertRowid))
    audit(req, { action: 'create', entity: key, entityId: row.id, summary: `Created ${key.slice(0, -1)} ${def.label(row)}`, payload: row })
    res.status(201).json(row)
  })

  catalogRouter.patch(`/${key}/:id`, ownerOnly, (req, res) => {
    const before = get(`SELECT * FROM ${def.table} WHERE id = ?`, req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })
    const body = req.body || {}
    const cols = def.fields.filter((f) => f in body)
    if (!cols.length) return res.json(before)
    const extra = def.table === 'products' ? ", updated_at = datetime('now')" : ''
    run(
      `UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${extra} WHERE id = ?`,
      ...cols.map((c) => body[c]), before.id
    )
    const after = get(`SELECT * FROM ${def.table} WHERE id = ?`, before.id)
    audit(req, {
      action: 'update', entity: key, entityId: after.id,
      summary: `Updated ${key.slice(0, -1)} ${def.label(after)}`,
      payload: { before, after }
    })
    res.json(after)
  })

  catalogRouter.delete(`/${key}/:id`, ownerOnly, (req, res) => {
    const before = get(`SELECT * FROM ${def.table} WHERE id = ?`, req.params.id)
    if (!before) return res.status(404).json({ error: 'not_found' })
    // Soft delete: history has to keep resolving names of retired staff/tables.
    run(`UPDATE ${def.table} SET archived = 1 WHERE id = ?`, before.id)
    audit(req, { action: 'archive', entity: key, entityId: before.id, summary: `Archived ${key.slice(0, -1)} ${def.label(before)}`, payload: before })
    res.json({ ok: true })
  })
}

/** Every location, regardless of the acting one — powers the location switcher. */
catalogRouter.get('/all-locations', (_req, res) => {
  res.json(all('SELECT * FROM locations WHERE archived = 0 ORDER BY id'))
})

/* ----------------------------------- tasks ---------------------------------- */

catalogRouter.get('/tasks', (req, res) => {
  const scope = req.query.scope === 'all' ? null : req.locationId
  const rows = all(
    `SELECT t.*, s.name AS assignee_name, u.display_name AS created_by_name, l.name AS location_name
       FROM tasks t
       LEFT JOIN staff s ON s.id = t.assignee_id
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN locations l ON l.id = t.location_id
      ${scope ? 'WHERE t.location_id = ?' : ''}
      ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
               CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               t.due_day = '', t.due_day, t.id DESC`,
    ...(scope ? [scope] : [])
  )
  res.json(rows)
})

catalogRouter.post('/tasks', (req, res) => {
  const b = req.body || {}
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'title_required' })
  const r = run(
    'INSERT INTO tasks (location_id, title, body, priority, status, due_day, assignee_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Number(b.location_id || req.locationId), String(b.title).trim(), String(b.body || ''),
    b.priority || 'normal', b.status || 'open', String(b.due_day || ''),
    b.assignee_id ? Number(b.assignee_id) : null, req.user.id
  )
  const id = Number(r.lastInsertRowid)
  audit(req, {
    action: 'create', entity: 'task', entityId: id,
    targetLocationId: Number(b.location_id || req.locationId),
    summary: `Task "${b.title}" (${b.priority || 'normal'})`
  })
  res.status(201).json(get('SELECT * FROM tasks WHERE id = ?', id))
})

catalogRouter.patch('/tasks/:id', (req, res) => {
  const before = get('SELECT * FROM tasks WHERE id = ?', req.params.id)
  if (!before) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const fields = ['title', 'body', 'priority', 'status', 'due_day', 'assignee_id', 'location_id']
  const cols = fields.filter((f) => f in b)
  if (cols.length) {
    const doneStamp = b.status === 'done' ? ", done_at = datetime('now')" : b.status ? ', done_at = NULL' : ''
    run(
      `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(', ')}${doneStamp} WHERE id = ?`,
      ...cols.map((c) => b[c]), before.id
    )
  }
  const after = get('SELECT * FROM tasks WHERE id = ?', before.id)
  audit(req, {
    action: 'update', entity: 'task', entityId: after.id, targetLocationId: after.location_id,
    summary: b.status && b.status !== before.status ? `Task "${after.title}" → ${b.status}` : `Updated task "${after.title}"`,
    payload: { before, after }
  })
  res.json(after)
})

catalogRouter.delete('/tasks/:id', (req, res) => {
  const before = get('SELECT * FROM tasks WHERE id = ?', req.params.id)
  if (!before) return res.status(404).json({ error: 'not_found' })
  run('DELETE FROM tasks WHERE id = ?', before.id)
  audit(req, { action: 'delete', entity: 'task', entityId: before.id, targetLocationId: before.location_id, summary: `Deleted task "${before.title}"` })
  res.json({ ok: true })
})

/* ----------------------------------- users ---------------------------------- */

catalogRouter.get('/users', ownerOnly, (req, res) => {
  res.json(
    all(`SELECT u.id, u.username, u.display_name, u.role, u.location_id, u.archived, l.name AS location_name
           FROM users u LEFT JOIN locations l ON l.id = u.location_id ORDER BY u.id`)
  )
})

catalogRouter.post('/users', ownerOnly, (req, res) => {
  const b = req.body || {}
  if (!b.username || !b.password) return res.status(400).json({ error: 'bad_request' })
  const r = run(
    'INSERT INTO users (username, password_hash, display_name, role, location_id) VALUES (?, ?, ?, ?, ?)',
    String(b.username).trim(), hash(String(b.password)), String(b.display_name || b.username),
    b.role === 'owner' ? 'owner' : 'admin', b.location_id ? Number(b.location_id) : null
  )
  const id = Number(r.lastInsertRowid)
  audit(req, { action: 'create', entity: 'user', entityId: id, summary: `Created account ${b.username}` })
  res.status(201).json(get('SELECT id, username, display_name, role, location_id FROM users WHERE id = ?', id))
})

catalogRouter.patch('/users/:id', ownerOnly, (req, res) => {
  const before = get('SELECT * FROM users WHERE id = ?', req.params.id)
  if (!before) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const cols = ['display_name', 'role', 'location_id', 'archived'].filter((f) => f in b)
  if (cols.length) {
    run(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => b[c]), before.id)
  }
  if (b.password) run('UPDATE users SET password_hash = ? WHERE id = ?', hash(String(b.password)), before.id)
  audit(req, { action: 'update', entity: 'user', entityId: before.id, summary: `Updated account ${before.username}` })
  res.json(get('SELECT id, username, display_name, role, location_id, archived FROM users WHERE id = ?', before.id))
})

/* ----------------------------------- audit ---------------------------------- */

catalogRouter.get('/audit', (req, res) => {
  const { entity, action, q, scope } = req.query
  const where = []
  const args = []
  if (scope !== 'all') { where.push('a.target_location_id = ?'); args.push(req.locationId) }
  if (entity) { where.push('a.entity = ?'); args.push(entity) }
  if (action) { where.push('a.action = ?'); args.push(action) }
  if (q) { where.push('(a.summary LIKE ? OR a.actor_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`) }
  res.json(
    all(
      `SELECT a.*, l1.name AS actor_location_name, l2.name AS target_location_name
         FROM audit_log a
         LEFT JOIN locations l1 ON l1.id = a.actor_location_id
         LEFT JOIN locations l2 ON l2.id = a.target_location_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.id DESC LIMIT 300`,
      ...args
    )
  )
})

/* --------------------------------- overview --------------------------------- */

/** Numbers for the dashboard header, per acting location. */
catalogRouter.get('/overview', (req, res) => {
  const day = String(req.query.day || '')
  const lid = req.locationId
  const today = get(
    `SELECT COUNT(*) AS bookings, COALESCE(SUM(guests), 0) AS guests,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN was_new_client = 1 THEN 1 ELSE 0 END) AS new_clients,
            COALESCE(SUM(total_sum), 0) AS revenue
       FROM bookings WHERE location_id = ? AND day = ? AND status NOT IN ('cancelled')`,
    lid, day
  )
  res.json({
    ...today,
    open_tasks: get(`SELECT COUNT(*) AS n FROM tasks WHERE location_id = ? AND status != 'done'`, lid)?.n ?? 0,
    urgent_tasks: get(`SELECT COUNT(*) AS n FROM tasks WHERE location_id = ? AND status != 'done' AND priority = 'urgent'`, lid)?.n ?? 0,
    low_stock: get('SELECT COUNT(*) AS n FROM products WHERE (location_id = ? OR location_id IS NULL) AND archived = 0 AND stock < min_stock', lid)?.n ?? 0,
    per_location: all(
      `SELECT l.id, l.name, l.accent,
              (SELECT COUNT(*) FROM bookings b WHERE b.location_id = l.id AND b.day = ? AND b.status NOT IN ('cancelled')) AS bookings,
              (SELECT COUNT(*) FROM tasks t WHERE t.location_id = l.id AND t.status != 'done') AS open_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.location_id = l.id AND t.status != 'done' AND t.priority IN ('urgent','high')) AS hot_tasks
         FROM locations l WHERE l.archived = 0 ORDER BY l.id`,
      day
    )
  })
})
