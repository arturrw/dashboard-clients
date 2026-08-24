const API = 'http://localhost:4000/api'
let token = null
let LID = 1
const results = []

const call = async (path, { method = 'GET', body, lid } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(lid ?? LID ? { 'x-location-id': String(lid ?? LID) } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const today = new Date().toISOString().slice(0, 10)
// Seed data covers today−12 … today+20, so an empty far-future day gives the
// move/cancel/reuse scenario a diary with no pre-existing bookings to collide with.
const free = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)

// 1. Login as a venue admin
let r = await call('/auth/login', { method: 'POST', body: { username: 'centrs', password: 'centrs' } })
check('login as venue admin', r.status === 200 && !!r.body.token, r.body?.user?.display_name)
token = r.body.token
LID = r.body.user.location_id

// 2. Bad password rejected
r = await call('/auth/login', { method: 'POST', body: { username: 'centrs', password: 'nope' } })
check('wrong password rejected', r.status === 401)

// 3. Day view
r = await call(`/day?day=${today}`)
const dayData = r.body
check('day view loads', r.status === 200 && dayData.resources.length > 0,
  `${dayData.resources.length} tables, ${dayData.bookings.length} bookings, ${dayData.breaks.length} breaks`)

const freeResource = dayData.resources[0]

// 4. Create booking for a brand-new phone number → NEW client
const newPhone = `3712${Date.now().toString().slice(-7)}`
r = await call('/bookings', {
  method: 'POST',
  body: {
    location_id: LID, resource_id: freeResource.id, day: free,
    start_min: 1290, end_min: 1380, guests: 4, phone: newPhone, name: 'Test Jaunais',
    services: [{ service_id: null, name: 'Dinner reservation', duration_min: 90, price: 60 }],
    discount_type: 'percent', discount_value: 10, discount_reason: 'Test discount',
    note: 'Window table', permanent_note: 'Allergic to shellfish'
  }
})
const created = r.body
check('create booking with new guest', r.status === 201 && created.client_is_new === true,
  `id=${created?.id} sum=${created?.total_sum} (60 − 10% = 54)`)
check('discount applied to total', created?.total_sum === 54, String(created?.total_sum))
check('was flagged as new client', created?.is_new_client === true)

// 5. Overlapping booking on the same table is rejected
r = await call('/bookings', {
  method: 'POST',
  body: { location_id: LID, resource_id: freeResource.id, day: free, start_min: 1320, end_min: 1400, phone: newPhone }
})
check('overlap rejected with 409', r.status === 409 && r.body.error === 'conflict',
  r.body?.conflict ? `blocked by ${r.body.conflict.label}` : '')

// 6. Same overlap accepted with force
r = await call('/bookings', {
  method: 'POST',
  body: { location_id: LID, resource_id: freeResource.id, day: free, start_min: 1320, end_min: 1400, phone: newPhone, force: true }
})
const forced = r.body
check('overlap allowed when forced', r.status === 201)

// 7. Phone lookup finds the guest, autofill data present
r = await call(`/clients/lookup?q=${newPhone}`)
const match = r.body[0]
check('phone lookup finds guest', r.status === 200 && match?.phone === newPhone,
  `${match?.name}, visits=${match?.visits}, permanent="${match?.permanent_note}"`)
check('permanent note stored on client', match?.permanent_note === 'Allergic to shellfish')

// 8. Drag: move booking to another table + time
const otherResource = dayData.resources[1]
r = await call(`/bookings/${created.id}`, {
  method: 'PATCH',
  body: { resource_id: otherResource.id, day: free, start_min: 660, end_min: 750 }
})
check('drag-move to another table', r.status === 200 && r.body.resource_id === otherResource.id,
  `${r.body?.start_label}–${r.body?.end_label} @ ${r.body?.resource_name}`)

// 9. Cancel without reason is rejected
r = await call(`/bookings/${created.id}`, { method: 'PATCH', body: { status: 'cancelled' } })
check('cancel without reason rejected', r.status === 400 && r.body.error === 'cancel_reason_required')

// 10. Cancel with reason succeeds
r = await call(`/bookings/${created.id}`, {
  method: 'PATCH',
  body: { status: 'cancelled', cancel_reason: 'Guest called back to cancel' }
})
check('cancel with reason accepted', r.status === 200 && r.body.status === 'cancelled', r.body?.cancel_reason)

// 11. Cancelled booking frees its slot again
r = await call('/bookings', {
  method: 'POST',
  body: { location_id: LID, resource_id: otherResource.id, day: free, start_min: 660, end_min: 750, phone: newPhone }
})
check('cancelled slot is reusable', r.status === 201)
const reused = r.body

// 12. Audit trail on the booking records move + cancel, with acting location
r = await call(`/bookings/${created.id}`)
const trail = r.body.audit ?? []
check('audit trail recorded', trail.length >= 3, trail.map((a) => a.action).join(' → '))
check('audit names the acting venue', trail.every((a) => a.actor_location_name || a.actor_name),
  trail[0]?.actor_location_name ?? '')

// 13. Status progression
r = await call(`/bookings/${reused.id}`, { method: 'PATCH', body: { status: 'arrived' } })
check('status → arrived', r.body?.status === 'arrived')
r = await call(`/bookings/${reused.id}`, { method: 'PATCH', body: { status: 'in_progress' } })
check('status → in_progress', r.body?.status === 'in_progress')

// 14. Forwarded call: admin books into another venue's diary
const otherLid = LID === 1 ? 2 : 1
r = await call(`/day?day=${free}`, { lid: otherLid })
const otherDay = r.body
r = await call('/bookings', {
  method: 'POST',
  lid: otherLid,
  body: {
    location_id: otherLid, resource_id: otherDay.resources[0].id, day: free,
    start_min: 1410, end_min: 1440, phone: newPhone, name: 'Test Jaunais', force: true
  }
})
const forwarded = r.body
check('forwarded call books another venue', r.status === 201 && forwarded.location_id === otherLid,
  `${forwarded?.location_name}`)
check('booking records originating venue', forwarded?.created_location_name === dayData.location.name,
  `created from ${forwarded?.created_location_name}, belongs to ${forwarded?.location_name}`)

// 15. Break move and conflict
r = await call('/breaks', {
  method: 'POST',
  body: { location_id: LID, resource_id: freeResource.id, day: free, start_min: 630, end_min: 690, title: 'Test reset' }
})
const brk = r.body
check('create break', r.status === 201, `${brk?.title}`)
r = await call(`/breaks/${brk.id}`, { method: 'PATCH', body: { start_min: 690, end_min: 750, day: free, resource_id: freeResource.id } })
check('drag-move break', r.status === 200 && r.body.start_min === 690)

// 16. Break blocks a booking on that slot
r = await call('/bookings', {
  method: 'POST',
  body: { location_id: LID, resource_id: freeResource.id, day: free, start_min: 700, end_min: 760, phone: newPhone }
})
check('break blocks booking slot', r.status === 409 && r.body.conflict?.type === 'break')

// 17. Client card carries history + adjustments
r = await call(`/clients/${match.id}`)
check('client card loads history', r.status === 200 && r.body.history.length >= 3,
  `${r.body?.history?.length} visits, ${r.body?.adjustments?.length} adjustments, ${r.body?.notes?.length} notes`)
check('discount reason visible in history', r.body.adjustments.some((a) => a.discount_reason === 'Test discount'))
check('cancel reason visible in history', r.body.adjustments.some((a) => a.cancel_reason === 'Guest called back to cancel'))

// 18. Admin cannot touch owner-only reference data
r = await call('/staff', { method: 'POST', body: { name: 'Sneaky' } })
check('admin blocked from owner endpoints', r.status === 403)

// 19. Owner can
const adminToken = token
r = await call('/auth/login', { method: 'POST', body: { username: 'owner', password: 'owner' } })
token = r.body.token
r = await call('/staff', { method: 'POST', body: { name: 'Test Waiter', role: 'Waiter', location_id: LID } })
const staffRow = r.body
check('owner creates staff', r.status === 201, staffRow?.name)
r = await call(`/staff/${staffRow.id}`, { method: 'DELETE' })
check('owner archives staff (soft delete)', r.status === 200)
r = await call('/staff')
check('archived staff hidden from calendar list', !r.body.some((s) => s.id === staffRow.id))

// 20. Tasks, price list, rota, audit feed
r = await call('/tasks')
check('tasks load for venue', r.status === 200 && r.body.length > 0, `${r.body.length} tasks`)
r = await call('/products')
check('price list loads', r.status === 200 && r.body.length > 0, `${r.body.length} products`)
r = await call('/month?month=' + today.slice(0, 7))
check('month planner loads', r.status === 200 && r.body.days.length > 0,
  `${r.body.days.length} days with bookings, ${r.body.shifts.length} shifts`)
r = await call('/shifts', { method: 'PUT', body: { staff_id: dayData.staff[0].id, day: today, start_min: 600, end_min: 1200 } })
check('rota shift upsert', r.status === 200)
r = await call('/audit?scope=all')
check('audit feed loads', r.status === 200 && r.body.length > 0, `${r.body.length} entries`)
const forwardedEntry = r.body.find((a) => a.actor_location_name && a.target_location_name && a.actor_location_name !== a.target_location_name)
check('audit flags cross-venue action', Boolean(forwardedEntry),
  forwardedEntry ? `${forwardedEntry.actor_location_name} → ${forwardedEntry.target_location_name}` : '')

// 21. Cross-venue booking from the dialog: the acting header stays on the home
//     venue while the body aims the booking at another one.
token = adminToken
const homeDay = await call(`/day?day=${free}`)
const awayDay = await call(`/day?day=${free}`, { lid: otherLid })
const awayTable = awayDay.body.resources[2]

r = await call('/bookings', {
  method: 'POST',
  body: {
    location_id: otherLid, resource_id: awayTable.id, day: free,
    start_min: 800, end_min: 860, phone: newPhone, name: 'Test Jaunais'
  }
})
const crossVenue = r.body
check('book another venue without switching diary', r.status === 201 && crossVenue.location_id === otherLid,
  `${crossVenue?.location_name}, table ${crossVenue?.resource_name}`)
check('origin venue still recorded', crossVenue?.created_location_name === dayData.location.name,
  `from ${crossVenue?.created_location_name}`)

// 22. Table from the wrong venue is refused on create
r = await call('/bookings', {
  method: 'POST',
  body: { location_id: otherLid, resource_id: homeDay.body.resources[0].id, day: free, start_min: 900, end_min: 960, phone: newPhone }
})
check('mismatched table refused on create', r.status === 400 && r.body.error === 'resource_not_in_location')

// 23. Relocate an existing booking to another venue
r = await call(`/bookings/${crossVenue.id}`, {
  method: 'PATCH',
  body: { location_id: LID, resource_id: homeDay.body.resources[2].id, day: free, start_min: 800, end_min: 860 }
})
check('relocate booking to another venue', r.status === 200 && r.body.location_id === LID,
  `now at ${r.body?.location_name} / ${r.body?.resource_name}`)

// 24. Table from the wrong venue is refused on relocate
r = await call(`/bookings/${crossVenue.id}`, {
  method: 'PATCH',
  body: { location_id: otherLid, resource_id: homeDay.body.resources[2].id, day: free, start_min: 800, end_min: 860 }
})
check('mismatched table refused on relocate', r.status === 400 && r.body.error === 'resource_not_in_location')

// 25. The relocation is spelled out in the trail
r = await call(`/bookings/${crossVenue.id}`)
const relocation = (r.body.audit ?? []).find((a) => a.action === 'move')
check('relocation named in audit trail', Boolean(relocation) && relocation.summary.includes('Moved to'),
  relocation?.summary ?? '')

// 26. Tasks can be filed against another venue's board
r = await call('/tasks', {
  method: 'POST',
  body: { location_id: otherLid, title: 'Cross-venue test task', priority: 'high' }
})
const crossTask = r.body
check('create task for another venue', r.status === 201 && crossTask.location_id === otherLid)
r = await call('/tasks', { lid: otherLid })
check('task shows on that venue board', r.body.some((x) => x.id === crossTask.id))
r = await call('/tasks')
check('task absent from home board', !r.body.some((x) => x.id === crossTask.id))
await call(`/tasks/${crossTask.id}`, { method: 'DELETE' })

// 27. A discount must carry a reason
r = await call('/bookings', {
  method: 'POST',
  body: {
    location_id: LID, resource_id: freeResource.id, day: free, start_min: 1000, end_min: 1060,
    phone: newPhone, discount_type: 'percent', discount_value: 15
  }
})
check('discount without reason rejected on create', r.status === 400 && r.body.error === 'discount_reason_required')

r = await call('/bookings', {
  method: 'POST',
  body: {
    location_id: LID, resource_id: freeResource.id, day: free, start_min: 1000, end_min: 1060,
    phone: newPhone, discount_type: 'percent', discount_value: 15, discount_reason: 'Regular guest'
  }
})
const discounted = r.body
check('discount with reason accepted', r.status === 201)

r = await call(`/bookings/${discounted.id}`, { method: 'PATCH', body: { discount_type: 'amount', discount_value: 5, discount_reason: '' } })
check('discount without reason rejected on edit', r.status === 400 && r.body.error === 'discount_reason_required')

// 28. Editing guest details actually writes them back to the guest card
const editedPhone = `3712${(Date.now() + 11).toString().slice(-7)}`
r = await call(`/bookings/${discounted.id}`, {
  method: 'PATCH',
  body: { phone: editedPhone, name: 'Pārsaukts Viesis', permanent_note: 'Prefers the terrace' }
})
check('edit relinks guest by phone', r.status === 200 && r.body.client_phone === editedPhone,
  `${r.body?.client_name} / ${r.body?.client_phone}`)
check('edit saves guest name', r.body?.client_name === 'Pārsaukts Viesis')
check('edit saves permanent note', r.body?.client_permanent_note === 'Prefers the terrace')

r = await call(`/bookings/${discounted.id}`)
check('guest details survive a reload', r.body?.client_phone === editedPhone && r.body?.client_name === 'Pārsaukts Viesis',
  `${r.body?.client_name} / ${r.body?.client_phone} / "${r.body?.client_permanent_note}"`)

// 29. The permanent note reaches the guest card and its note history
r = await call(`/clients/lookup?q=${editedPhone}`)
const edited = r.body[0]
check('permanent note lands on the guest card', edited?.permanent_note === 'Prefers the terrace')
r = await call(`/clients/${edited.id}`)
check('permanent note logged in note history', r.body.notes.some((n) => n.kind === 'permanent' && n.body === 'Prefers the terrace'),
  `${r.body?.notes?.length} note(s)`)

// 30. Re-saving the same note does not pile up duplicates
await call(`/bookings/${discounted.id}`, { method: 'PATCH', body: { permanent_note: 'Prefers the terrace' } })
r = await call(`/clients/${edited.id}`)
check('unchanged note is not duplicated',
  r.body.notes.filter((n) => n.body === 'Prefers the terrace').length === 1,
  `${r.body.notes.filter((n) => n.body === 'Prefers the terrace').length} copies`)

// 31. Attention flags round-trip
r = await call(`/bookings/${discounted.id}`, { method: 'PATCH', body: { importance: 'vip' } })
check('VIP flag saved', r.body?.importance === 'vip')
r = await call(`/bookings/${discounted.id}`, { method: 'PATCH', body: { importance: 'high' } })
check('high flag saved', r.body?.importance === 'high')

// 32. Unauthenticated access blocked
token = null
r = await call(`/day?day=${today}`)
check('unauthenticated request blocked', r.status === 401)

const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILURES:')
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`)
  process.exit(1)
}
