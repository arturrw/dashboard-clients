import { run, all } from './db.js'

/**
 * Records a mutation. `targetLocationId` is the diary that was touched, which
 * can differ from the actor's own venue when a forwarded call is booked
 * elsewhere — the booking detail view surfaces exactly that difference.
 */
export function audit(req, { action, entity, entityId, summary = '', payload = {}, targetLocationId }) {
  run(
    `INSERT INTO audit_log
      (actor_id, actor_name, actor_role, actor_location_id, target_location_id,
       action, entity, entity_id, summary, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user?.id ?? null,
    req.user?.display_name ?? 'system',
    req.user?.role ?? '',
    req.user?.location_id ?? null,
    targetLocationId ?? req.locationId ?? null,
    action,
    entity,
    entityId ?? null,
    summary,
    JSON.stringify(payload)
  )
}

export const auditFor = (entity, entityId) =>
  all(
    `SELECT a.*, l1.name AS actor_location_name, l2.name AS target_location_name
       FROM audit_log a
       LEFT JOIN locations l1 ON l1.id = a.actor_location_id
       LEFT JOIN locations l2 ON l2.id = a.target_location_id
      WHERE a.entity = ? AND a.entity_id = ?
      ORDER BY a.id ASC`,
    entity,
    entityId
  )
