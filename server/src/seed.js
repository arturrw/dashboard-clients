import { db, run, get, all, DB_PATH } from './lib/db.js'
import { hash } from './lib/auth.js'

const iso = (d) => d.toISOString().slice(0, 10)
const shift = (base, days) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return iso(d)
}
const TODAY = new Date()
const pick = (arr, i) => arr[i % arr.length]

console.log(`Seeding ${DB_PATH}`)
for (const t of ['audit_log', 'booking_services', 'bookings', 'breaks', 'shifts', 'tasks',
  'client_notes', 'clients', 'products', 'services', 'staff', 'resources', 'users', 'locations']) {
  db.exec(`DELETE FROM ${t}`)
  db.exec(`DELETE FROM sqlite_sequence WHERE name = '${t}'`)
}

/* -------------------------------- locations -------------------------------- */

const LOCATIONS = [
  { slug: 'centrs', name: 'Forno · Rīga Centrs', address: 'Tērbatas iela 12, Rīga', phone: '+371 6710 0011', accent: '#1F3D2E', open_min: 600, close_min: 1380 },
  { slug: 'purvciems', name: 'Forno · Purvciems', address: 'Dzelzavas iela 74, Rīga', phone: '+371 6710 0022', accent: '#7A4B2A', open_min: 660, close_min: 1350 },
  { slug: 'jurmala', name: 'Forno · Jūrmala', address: 'Jomas iela 45, Jūrmala', phone: '+371 6710 0033', accent: '#2C4A63', open_min: 660, close_min: 1440 }
]
const locIds = LOCATIONS.map((l) => {
  const r = run(
    'INSERT INTO locations (slug, name, address, phone, open_min, close_min, slot_min, accent) VALUES (?, ?, ?, ?, ?, ?, 15, ?)',
    l.slug, l.name, l.address, l.phone, l.open_min, l.close_min, l.accent
  )
  return Number(r.lastInsertRowid)
})

/* ---------------------------------- users ---------------------------------- */

run('INSERT INTO users (username, password_hash, display_name, role, location_id) VALUES (?, ?, ?, ?, NULL)',
  'owner', hash('owner'), 'Kristaps Bērziņš · Owner', 'owner')
LOCATIONS.forEach((l, i) => {
  run('INSERT INTO users (username, password_hash, display_name, role, location_id) VALUES (?, ?, ?, ?, ?)',
    l.slug, hash(l.slug), `${l.name.split('·')[1].trim()} — front desk`, 'admin', locIds[i])
})

/* --------------------------- tables, staff, services ------------------------ */

const ZONES = {
  0: [['Zāle', 6, 2], ['Zāle', 5, 4], ['Zāle', 4, 4], ['Terase', 3, 6], ['Terase', 2, 2], ['Bārs', 4, 2]],
  1: [['Zāle', 8, 2], ['Zāle', 6, 4], ['Zāle', 5, 4], ['Ģimenes', 3, 8], ['Bārs', 4, 2]],
  2: [['Terase', 5, 4], ['Terase', 4, 4], ['Zāle', 6, 2], ['Zāle', 5, 6], ['VIP', 2, 10], ['Bārs', 3, 2]]
}
const STAFF = {
  0: [['Anna Ozola', 'Hostess'], ['Marks Liepa', 'Waiter'], ['Jūlija Kalniņa', 'Waiter'], ['Dāvis Zvirbulis', 'Pizzaiolo']],
  1: [['Elīna Krūmiņa', 'Hostess'], ['Rihards Vītols', 'Waiter'], ['Nikita Sokolov', 'Pizzaiolo']],
  2: [['Laura Balode', 'Hostess'], ['Toms Grīnbergs', 'Waiter'], ['Sofia Ivanova', 'Waiter']]
}
const STAFF_COLORS = ['#1F3D2E', '#8A6A3B', '#2C4A63', '#7A4B2A', '#5B4B7A']

const resourceIds = {}
const staffIds = {}
locIds.forEach((lid, i) => {
  resourceIds[lid] = ZONES[i].map(([zone, n, seats], idx) => {
    const r = run('INSERT INTO resources (location_id, name, zone, seats, sort_order) VALUES (?, ?, ?, ?, ?)',
      lid, `${zone === 'Bārs' ? 'Bar' : 'T'}${n}`, zone, seats, idx)
    return Number(r.lastInsertRowid)
  })
  staffIds[lid] = STAFF[i].map(([name, role], idx) => {
    const r = run('INSERT INTO staff (location_id, name, role, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      lid, name, role, pick(STAFF_COLORS, idx), idx)
    return Number(r.lastInsertRowid)
  })
})

// Chain-wide booking types (location_id NULL = available everywhere).
const SERVICES = [
  ['Dinner reservation', 'Vakariņu rezervācija', 'Ужин', 'Standard', 90, 0],
  ['Lunch reservation', 'Pusdienu rezervācija', 'Обед', 'Standard', 60, 0],
  ['Birthday party', 'Dzimšanas dienas svinības', 'День рождения', 'Event', 180, 120],
  ['Corporate event', 'Korporatīvais pasākums', 'Корпоратив', 'Event', 240, 350],
  ['Wine tasting', 'Vīna degustācija', 'Дегустация вин', 'Event', 120, 45],
  ['Pizza masterclass', 'Picas meistarklase', 'Мастер-класс по пицце', 'Event', 120, 35],
  ['Family set menu', 'Ģimenes komplekts', 'Семейное меню', 'Standard', 120, 68],
  ['Business lunch', 'Biznesa pusdienas', 'Бизнес-ланч', 'Standard', 45, 14.5],
  ['Takeaway pickup', 'Līdzņemšana', 'Самовывоз', 'Standard', 15, 0]
]
const serviceIds = SERVICES.map(([en, lv, ru, cat, dur, price], i) => {
  const r = run(
    'INSERT INTO services (location_id, name_en, name_lv, name_ru, category, duration_min, price, sort_order) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)',
    en, lv, ru, cat, dur, price, i
  )
  return Number(r.lastInsertRowid)
})

/* ----------------------------- supply price list ---------------------------- */

const PRODUCTS = [
  ['FL-00', 'Flour Caputo 00 Pizzeria', 'Dry goods', 'kg', 1.42, 0, 'Caputo Baltics', 180, 60],
  ['TM-SM', 'San Marzano DOP tomatoes', 'Canned', 'kg', 3.85, 0, 'Italia Foods', 96, 40],
  ['MZ-FD', 'Fior di latte mozzarella', 'Dairy', 'kg', 7.20, 0, 'Latvijas Piens', 42, 25],
  ['MZ-BF', 'Buffalo mozzarella DOP', 'Dairy', 'kg', 14.60, 0, 'Italia Foods', 12, 8],
  ['PR-24', 'Parmigiano Reggiano 24m', 'Dairy', 'kg', 22.40, 0, 'Italia Foods', 9, 5],
  ['OL-EV', 'Extra virgin olive oil', 'Oils', 'l', 8.90, 0, 'Italia Foods', 55, 20],
  ['PP-SP', 'Spicy salami Napoli', 'Meat', 'kg', 12.30, 0, 'Rīgas Gaļas', 24, 12],
  ['PR-CR', 'Prosciutto crudo 18m', 'Meat', 'kg', 26.80, 0, 'Italia Foods', 7, 4],
  ['BS-FR', 'Fresh basil', 'Produce', 'kg', 18.00, 0, 'Zaļā Sēta', 3, 2],
  ['RC-AR', 'Arborio rice', 'Dry goods', 'kg', 3.10, 0, 'Caputo Baltics', 40, 15],
  ['WN-CH', 'Chianti Classico DOCG', 'Beverages', 'btl', 9.40, 24.00, 'Vīna Studija', 68, 24],
  ['WN-PG', 'Pinot Grigio delle Venezie', 'Beverages', 'btl', 6.10, 18.00, 'Vīna Studija', 74, 24],
  ['BR-PR', 'Prosecco DOC brut', 'Beverages', 'btl', 7.80, 21.00, 'Vīna Studija', 30, 18],
  ['AP-SP', 'Aperol', 'Beverages', 'btl', 13.50, 0, 'Vīna Studija', 11, 6],
  ['CF-ES', 'Espresso beans Miscela', 'Beverages', 'kg', 16.20, 0, 'Kafijas Nams', 14, 8],
  ['WT-SP', 'Sparkling water 0.75', 'Beverages', 'btl', 0.72, 3.50, 'Venden', 210, 96],
  ['NP-TB', 'Table napkins linen-touch', 'Consumables', 'pack', 4.30, 0, 'HoReCa Serviss', 26, 15],
  ['BX-PZ', 'Pizza box 33cm', 'Consumables', 'pack', 11.90, 0, 'HoReCa Serviss', 18, 10],
  ['CL-DG', 'Degreaser Pro 5l', 'Cleaning', 'can', 9.10, 0, 'HoReCa Serviss', 6, 4],
  ['GL-WN', 'Wine glass Vinum', 'Inventory', 'pcs', 3.40, 0, 'HoReCa Serviss', 88, 40]
]
locIds.forEach((lid, li) => {
  PRODUCTS.forEach(([sku, name, cat, unit, supply, retail, supplier, stock, min]) => {
    // Slight per-venue variance in price and stock, as real deliveries differ.
    const drift = 1 + (li - 1) * 0.03
    run(
      'INSERT INTO products (location_id, sku, name, category, unit, supply_price, retail_price, supplier, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      lid, sku, name, cat, unit, Math.round(supply * drift * 100) / 100, retail, supplier,
      Math.round(stock * (li === 2 ? 0.6 : 1)), min
    )
  })
})

/* --------------------------------- clients ---------------------------------- */

const CLIENTS = [
  ['37129481123', 'Andris Kalniņš', 'Plays for RFS — always books after training, table away from the window.', 'sport,regular'],
  ['37126713408', 'Ilona Vītola', 'Allergic to nuts. Never serve pesto.', 'allergy'],
  ['37125509971', 'Māris Bērzlapa', '', 'regular'],
  ['37122340015', 'Jekaterina Smirnova', 'Corporate account — invoices to SIA Nordwind.', 'corporate'],
  ['37128877340', 'Roberts Ozols', '', ''],
  ['37127001188', 'Signe Liepiņa', 'Birthday 14 March, always gets a complimentary dessert.', 'vip'],
  ['37124455201', 'Aleksandrs Petrov', 'Loud groups — seat on the terrace.', ''],
  ['37129900412', 'Elza Dūmiņa', '', 'regular'],
  ['37121122556', 'Nils Zariņš', 'Wine collector, prefers Chianti reserve list.', 'vip,wine'],
  ['37123344778', 'Kristīne Auziņa', '', ''],
  ['37126655443', 'Pāvels Kuzņecovs', '', ''],
  ['37128123456', 'Laima Skujiņa', 'Wheelchair access needed — keep T3 free.', 'access']
]
const clientIds = CLIENTS.map(([phone, name, note, tags], i) => {
  const r = run(
    'INSERT INTO clients (phone, name, permanent_note, tags, created_location_id) VALUES (?, ?, ?, ?, ?)',
    phone, name, note, tags, pick(locIds, i)
  )
  const id = Number(r.lastInsertRowid)
  if (note) {
    run('INSERT INTO client_notes (client_id, body, kind, author_id, location_id) VALUES (?, ?, ?, 1, ?)',
      id, note, 'permanent', pick(locIds, i))
  }
  return id
})

/* --------------------------------- bookings --------------------------------- */

const STATUSES = ['completed', 'completed', 'booked', 'arrived', 'in_progress', 'cancelled', 'no_show']
const NOTES = [
  'Window table if possible', 'Anniversary — bring candle', 'Coming straight from the airport',
  '', '', 'Pram, needs space', 'Will be 10 min late', ''
]
const DISCOUNTS = [['', '', 0], ['percent', 'Regular guest', 10], ['', '', 0], ['amount', 'Voucher from Facebook campaign', 15], ['percent', 'Staff family', 20], ['', '', 0]]
const DRINKS = ['', 'Prosecco', 'Aperol Spritz', '', 'Limoncello', '']

let bookingSeq = 0
for (let dayOffset = -12; dayOffset <= 20; dayOffset++) {
  const day = shift(TODAY, dayOffset)
  const isPast = dayOffset < 0
  const density = dayOffset >= -2 && dayOffset <= 3 ? 1 : 0.45

  locIds.forEach((lid) => {
    const resources = resourceIds[lid]
    const staffPool = staffIds[lid]
    const seats = Math.round(resources.length * (2.4 * density))

    for (let k = 0; k < seats; k++) {
      bookingSeq++
      const resourceId = pick(resources, bookingSeq * 3 + k)
      const svcIdx = (bookingSeq * 5 + k) % SERVICES.length
      const [enName, , , , duration, price] = SERVICES[svcIdx]
      const startMin = 660 + ((bookingSeq * 45 + k * 105) % 600)
      const endMin = Math.min(1440, startMin + duration)

      const clash = get(
        `SELECT id FROM bookings WHERE resource_id = ? AND day = ? AND start_min < ? AND end_min > ?
           AND status NOT IN ('cancelled','no_show')`,
        resourceId, day, endMin, startMin
      )
      if (clash) continue

      const clientId = pick(clientIds, bookingSeq * 7 + k)
      const status = isPast
        ? pick(['completed', 'completed', 'completed', 'cancelled', 'no_show'], bookingSeq + k)
        : dayOffset === 0
          ? pick(STATUSES, bookingSeq + k)
          : 'booked'
      const [dType, dReason, dValue] = pick(DISCOUNTS, bookingSeq + k)
      const gross = price || pick([0, 0, 24, 46, 62, 88], bookingSeq + k)
      const total = dType === 'percent' ? gross * (1 - dValue / 100) : dType === 'amount' ? Math.max(0, gross - dValue) : gross

      const r = run(
        `INSERT INTO bookings
          (location_id, resource_id, staff_id, client_id, day, start_min, end_min, guests, status, importance,
           note, cancel_reason, discount_type, discount_reason, discount_value, welcome_drink, deposit,
           total_sum, was_new_client, source, created_by, created_location_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
        lid, resourceId, pick(staffPool, bookingSeq + k), clientId, day, startMin, endMin,
        pick([2, 2, 3, 4, 4, 6, 8], bookingSeq + k),
        status,
        pick(['normal', 'normal', 'normal', 'normal', 'high', 'vip'], bookingSeq * 2 + k),
        pick(NOTES, bookingSeq + k),
        status === 'cancelled' ? pick(['Guest cancelled by phone', 'Double booking — moved to Purvciems', 'Illness in the party'], bookingSeq) : '',
        dType, dReason, dValue,
        pick(DRINKS, bookingSeq + k),
        pick([0, 0, 0, 20, 50], bookingSeq + k),
        Math.round(total * 100) / 100,
        0, pick(['phone', 'phone', 'phone', 'walk-in', 'online'], bookingSeq + k),
        pick([1, 2, 3, 4], bookingSeq), pick(locIds, bookingSeq + 1),
        `-${Math.abs(dayOffset) + 1} days`
      )
      const bid = Number(r.lastInsertRowid)
      run('INSERT INTO booking_services (booking_id, service_id, name, duration_min, price, qty) VALUES (?, ?, ?, ?, ?, 1)',
        bid, serviceIds[svcIdx], enName, duration, gross)
    }
  })
}

// Mark the genuinely-first booking of each client so the NEW badge is truthful.
for (const cid of clientIds) {
  const first = get('SELECT id FROM bookings WHERE client_id = ? ORDER BY day, start_min LIMIT 1', cid)
  if (first) run('UPDATE bookings SET was_new_client = 1 WHERE id = ?', first.id)
}

/* ---------------------------- breaks, rota, tasks --------------------------- */

for (let dayOffset = -2; dayOffset <= 20; dayOffset++) {
  const day = shift(TODAY, dayOffset)
  locIds.forEach((lid, li) => {
    // One hour of blocked time per venue per day: room reset between services.
    const resourceId = resourceIds[lid][li % resourceIds[lid].length]
    const startMin = 900 + li * 30
    const clash = get(
      `SELECT id FROM bookings WHERE resource_id = ? AND day = ? AND start_min < ? AND end_min > ?
         AND status NOT IN ('cancelled','no_show')`,
      resourceId, day, startMin + 60, startMin
    )
    if (!clash) {
      run('INSERT INTO breaks (location_id, resource_id, day, start_min, end_min, title, kind, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        lid, resourceId, day, startMin, startMin + 60, li === 2 ? 'Terrace reset' : 'Room reset', 'break')
    }
    staffIds[lid].forEach((sid, si) => {
      if ((dayOffset + si) % 4 === 3) return // one day off per rotation
      run(
        `INSERT INTO shifts (location_id, staff_id, day, start_min, end_min) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(staff_id, day) DO NOTHING`,
        lid, sid, day, si % 2 === 0 ? 600 : 780, si % 2 === 0 ? 1140 : 1380
      )
    })
  })
}

const TASKS = [
  ['Accept Caputo flour delivery and check invoice prices', 'Compare against the price list — last delivery was 4% over.', 'urgent', 'open', 0],
  ['Deep-clean the pizza oven', 'Scheduled with the technician for the morning before opening.', 'high', 'open', 1],
  ['Update terrace menu boards for the summer set', '', 'normal', 'in_progress', 2],
  ['Re-count wine cellar stock', 'Chianti and Prosecco figures do not match the till.', 'high', 'open', 3],
  ['Order new linen napkins', 'Down to 26 packs.', 'normal', 'open', 5],
  ['Staff briefing on the new tasting menu', '', 'normal', 'open', 2],
  ['Fix the wobbling terrace table T4', '', 'low', 'open', 4],
  ['Replace the espresso machine water filter', 'Every 3 months — last done in May.', 'normal', 'done', -3],
  ['Photograph the new dessert for delivery apps', '', 'low', 'open', 7],
  ['Renew the outdoor seating permit', 'Deadline with the city council.', 'urgent', 'open', 6],
  ['Check emergency exit lighting', '', 'high', 'in_progress', 1],
  ['Collect guest feedback cards from last week', '', 'low', 'done', -1]
]
locIds.forEach((lid, li) => {
  TASKS.forEach(([title, body, priority, status, due], i) => {
    if ((i + li) % 3 === 2 && li !== 0) return
    run(
      `INSERT INTO tasks (location_id, title, body, priority, status, due_day, assignee_id, created_by, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      lid, title, body, priority, status, shift(TODAY, due),
      pick(staffIds[lid], i + li), 1, status === 'done' ? new Date().toISOString() : null
    )
  })
})

run(
  `INSERT INTO audit_log (actor_id, actor_name, actor_role, actor_location_id, target_location_id, action, entity, entity_id, summary)
   VALUES (1, 'System', 'owner', NULL, NULL, 'seed', 'system', NULL, 'Demo dataset generated')`
)

console.log('Seeded:',
  { locations: all('SELECT id FROM locations').length,
    resources: all('SELECT id FROM resources').length,
    staff: all('SELECT id FROM staff').length,
    clients: all('SELECT id FROM clients').length,
    bookings: all('SELECT id FROM bookings').length,
    breaks: all('SELECT id FROM breaks').length,
    shifts: all('SELECT id FROM shifts').length,
    tasks: all('SELECT id FROM tasks').length,
    products: all('SELECT id FROM products').length })
console.log('Logins:  owner/owner   centrs/centrs   purvciems/purvciems   jurmala/jurmala')
