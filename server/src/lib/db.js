import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.db')

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

/**
 * Times are stored as a local calendar day plus minute offsets from midnight.
 * The chain runs in a single timezone, so naive local time keeps drag-and-drop
 * arithmetic exact and avoids a whole class of DST/offset bugs.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  open_min    INTEGER NOT NULL DEFAULT 600,
  close_min   INTEGER NOT NULL DEFAULT 1380,
  slot_min    INTEGER NOT NULL DEFAULT 15,
  accent      TEXT NOT NULL DEFAULT '#1F3D2E',
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','owner')),
  location_id   INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Calendar columns. In hospitality a "resource" is a table or a zone slot.
CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  zone        TEXT NOT NULL DEFAULT '',
  seats       INTEGER NOT NULL DEFAULT 2,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0
);

-- Staff assigned to a booking (waiter / host / pizzaiolo).
CREATE TABLE IF NOT EXISTS staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#8A6A3B',
  phone       TEXT NOT NULL DEFAULT '',
  archived    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id  INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  name_en      TEXT NOT NULL,
  name_lv      TEXT NOT NULL DEFAULT '',
  name_ru      TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 90,
  price        REAL NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

-- Supply price list: what the admin checks when a delivery arrives.
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  unit          TEXT NOT NULL DEFAULT 'kg',
  supply_price  REAL NOT NULL DEFAULT 0,
  retail_price  REAL NOT NULL DEFAULT 0,
  supplier      TEXT NOT NULL DEFAULT '',
  stock         REAL NOT NULL DEFAULT 0,
  min_stock     REAL NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  phone          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  birthday       TEXT NOT NULL DEFAULT '',
  permanent_note TEXT NOT NULL DEFAULT '',
  tags           TEXT NOT NULL DEFAULT '',
  blacklisted    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

CREATE TABLE IF NOT EXISTS client_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','permanent')),
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  staff_id      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  day           TEXT NOT NULL,
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  guests        INTEGER NOT NULL DEFAULT 2,
  status        TEXT NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked','arrived','in_progress','completed','cancelled','no_show')),
  importance    TEXT NOT NULL DEFAULT 'normal'
                CHECK (importance IN ('low','normal','high','vip')),
  note          TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  discount_type   TEXT NOT NULL DEFAULT '',
  discount_reason TEXT NOT NULL DEFAULT '',
  discount_value  REAL NOT NULL DEFAULT 0,
  gift_card     TEXT NOT NULL DEFAULT '',
  welcome_drink TEXT NOT NULL DEFAULT '',
  deposit       REAL NOT NULL DEFAULT 0,
  total_sum     REAL NOT NULL DEFAULT 0,
  was_new_client INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'phone',
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_day ON bookings(location_id, day);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);

CREATE TABLE IF NOT EXISTS booking_services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 0,
  price        REAL NOT NULL DEFAULT 0,
  qty          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_bsvc_booking ON booking_services(booking_id);

-- Blocked time: cleaning, re-setting the room, staff break.
CREATE TABLE IF NOT EXISTS breaks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  staff_id    INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Break',
  kind        TEXT NOT NULL DEFAULT 'break',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_breaks_day ON breaks(location_id, day);

-- Staff rota, fillable a month ahead.
CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  start_min   INTEGER NOT NULL DEFAULT 600,
  end_min     INTEGER NOT NULL DEFAULT 1320,
  note        TEXT NOT NULL DEFAULT '',
  UNIQUE (staff_id, day)
);
CREATE INDEX IF NOT EXISTS idx_shifts_day ON shifts(location_id, day);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  due_day     TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  done_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_loc ON tasks(location_id, status);

-- Every mutation lands here: who, from which location, when, and what changed.
CREATE TABLE IF NOT EXISTS audit_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name         TEXT NOT NULL DEFAULT '',
  actor_role         TEXT NOT NULL DEFAULT '',
  actor_location_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  target_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  action             TEXT NOT NULL,
  entity             TEXT NOT NULL,
  entity_id          INTEGER,
  summary            TEXT NOT NULL DEFAULT '',
  payload            TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
`)

export const all = (sql, ...p) => db.prepare(sql).all(...p)
export const get = (sql, ...p) => db.prepare(sql).get(...p)
export const run = (sql, ...p) => db.prepare(sql).run(...p)
