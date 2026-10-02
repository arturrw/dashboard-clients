# API reference

Base path: `/api`. JSON in, JSON out. Through docker compose the API is reached
via nginx at `http://localhost:8080/api`; in development at
`http://localhost:4000/api` (or through Vite on `:5173/api`).

- [Conventions](#conventions)
- [Auth](#auth)
- [Diary](#diary-bookings-breaks-rota)
- [Guests](#guests)
- [Tasks](#tasks)
- [Reference data](#reference-data-owner-managed)
- [Accounts, activity, dashboard](#accounts-activity-dashboard)
- [Errors](#errors)

## Conventions

| Header | Meaning |
| --- | --- |
| `Authorization: Bearer <token>` | Required on everything except `/health` and `/auth/login`, `/auth/accounts`. Tokens live 30 days. |
| `X-Location-Id: <id>` | The venue whose diary you are acting on. Defaults to the user's home venue (or the first venue for the owner). `?location_id=` works too. |

- **Times**: `day` is a local `YYYY-MM-DD`; `start_min` / `end_min` are minutes
  from midnight (`630` = 10:30). `end_min` must be greater than `start_min`.
- **Roles**: `admin` (a venue's front desk) and `owner`. 🔒 marks owner-only
  endpoints — admins get `403 owner_only`.
- **Audit**: every write is recorded in the activity log with the acting user,
  their home venue and the target venue.

Quick start:

```bash
TOKEN=$(curl -s localhost:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"centrs","password":"centrs"}' | jq -r .token)

curl -s "localhost:8080/api/day?day=$(date +%F)" -H "authorization: Bearer $TOKEN" | jq '.bookings | length'
```

## Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ ok: true, seeded: boolean }`. No auth. Used by the container healthcheck. |

## Auth

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/auth/accounts` | — | Accounts a terminal can bind to: `username, display_name, role, location_id, location_name, accent`. |
| POST | `/auth/login` | `{ username, password }` | `{ token, user }` · `401 bad_credentials` |
| GET | `/auth/me` | — | The signed-in user. |

## Diary (bookings, breaks, rota)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/day?day=YYYY-MM-DD` | — | Everything the day grid needs for the acting venue: `location, resources, staff, services, bookings, breaks, shifts`. |
| GET | `/month?month=YYYY-MM` | — | Per-day load (`total, cancelled, guests`), `shifts`, `staff`. |
| GET | `/bookings/:id` | — | Booking with `services`, client fields, `created_*` origin and its `audit` trail. |
| POST | `/bookings` | see below | `201` booking; `client_is_new` tells whether the guest card was just created. |
| PATCH | `/bookings/:id` | any subset of the fields below | Move, resize, re-seat in another venue, change status, edit guest details. |
| DELETE | `/bookings/:id` 🔒 | — | Hard delete. Admins cancel instead. |
| POST | `/breaks` | `{ location_id, resource_id, day, start_min, end_min, title }` | Blocked time; blocks bookings like a booking would. |
| PATCH | `/breaks/:id` | `{ resource_id, day, start_min, end_min, title, force }` | |
| DELETE | `/breaks/:id` | — | |
| PUT | `/shifts` | `{ staff_id, day, start_min, end_min, note }` | Upsert one rota cell (unique per staff + day). |
| DELETE | `/shifts?staff_id=&day=` | — | Clear a rota cell. |

Booking fields:

```jsonc
{
  "location_id": 1,            // venue the booking belongs to (may differ from X-Location-Id)
  "resource_id": 3,            // table — must belong to location_id
  "staff_id": null,
  "day": "2026-10-02", "start_min": 1140, "end_min": 1230,
  "guests": 4,
  "status": "booked",          // booked | arrived | in_progress | completed | cancelled | no_show
  "importance": "normal",      // low | normal | high | vip
  "phone": "37126713408",      // finds or creates the guest card
  "name": "Ilona Vītola",
  "note": "Window table",      // this visit only
  "permanent_note": "Nut allergy", // written to the guest card
  "services": [{ "service_id": 1, "name": "Dinner reservation", "duration_min": 90, "price": 0, "qty": 1 }],
  "discount_type": "percent",  // "" | percent | amount
  "discount_value": 10,
  "discount_reason": "Regular guest", // required whenever discount_type is set
  "gift_card": "", "welcome_drink": "Prosecco", "deposit": 20,
  "source": "phone",           // phone | walk-in | online
  "cancel_reason": "",         // required when status becomes "cancelled"
  "force": false               // true = accept an overlap the server reported
}
```

`total_sum` is computed by the server from `services` and the discount.

Overlap with another booking or a break on the same table:

```json
HTTP 409
{ "error": "conflict",
  "conflict": { "type": "booking", "id": 812, "start_min": 1140, "end_min": 1230,
                "client_name": "Ilona Vītola", "label": "Ilona Vītola" } }
```

For a break, `type` is `"break"` and `label` is its title. Repeat the request with `"force": true` to place it anyway (the UI asks first).
Cancelled bookings and no-shows do not block a slot.

## Guests

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/clients/lookup?q=` | ≥ 3 chars; digits match the phone, otherwise the name | Up to 8 matches with `visits, no_shows, last_visit, next_visit`. Powers the phone typeahead. |
| GET | `/clients?q=` | optional | Guest book (200 max) with visit stats. |
| GET | `/clients/:id` | — | Card: stats, `last_visit`, `next_visit`, `history`, `notes`, `adjustments` (discounts, cancellations, gift cards, deposits). |
| PATCH | `/clients/:id` | `name, email, birthday, permanent_note, tags, blacklisted` | |
| POST | `/clients/:id/notes` | `{ body, kind: "note" \| "permanent" }` | |
| DELETE | `/clients/:id/notes/:noteId` | — | |

Phones are normalised to digits, so `+371 26 713 408` and `37126713408` are the same guest.

## Tasks

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/tasks?scope=all` | `scope=all` for the whole chain | Default: the acting venue's board. Sorted by status, priority, due day. |
| POST | `/tasks` | `{ title, body, priority, status, due_day, assignee_id, location_id }` | `priority`: low · normal · high · urgent; `status`: open · in_progress · done. |
| PATCH | `/tasks/:id` | any subset | Moving to `done` stamps `done_at`. |
| DELETE | `/tasks/:id` | — | |

## Reference data (owner-managed)

The same four routes exist for `locations`, `resources` (tables), `staff`,
`services` and `products` (supply price list):

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/{entity}?archived=1` | Readable by everyone. Venue-scoped entities return the acting venue's rows plus chain-wide ones (`location_id IS NULL`). Archived rows only with `archived=1`. |
| POST | `/{entity}` 🔒 | `201`. Venue-scoped rows take `location_id` from the body or the acting venue. |
| PATCH | `/{entity}/:id` 🔒 | |
| DELETE | `/{entity}/:id` 🔒 | Soft delete (`archived = 1`): history keeps resolving the row. |
| GET | `/all-locations` | Every active venue, independent of the acting one. |

Writable fields:

| Entity | Fields |
| --- | --- |
| `locations` | `slug, name, address, phone, open_min, close_min, slot_min, accent, archived` |
| `resources` | `name, zone, seats, sort_order, archived` |
| `staff` | `name, role, color, phone, sort_order, archived` |
| `services` | `name_en, name_lv, name_ru, category, duration_min, price, sort_order, archived` |
| `products` | `sku, name, category, unit, supply_price, retail_price, supplier, stock, min_stock, archived` |

## Accounts, activity, dashboard

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/users` 🔒 | — | |
| POST | `/users` 🔒 | `{ username, password, display_name, role, location_id }` | |
| PATCH | `/users/:id` 🔒 | `display_name, role, location_id, archived, password` | Username is fixed. Omit or leave `password` empty to keep it. |
| GET | `/audit` | `scope=all`, `entity`, `action`, `q` | Latest 300 entries, with `actor_location_name` and `target_location_name`. Without `scope=all`, only entries that touched the acting venue. |
| GET | `/overview?day=YYYY-MM-DD` | — | Dashboard numbers for the acting venue plus a chain-wide comparison. |

## Errors

Errors are `{ "error": "<code>" }` with an HTTP status:

| Status | `error` | When |
| --- | --- | --- |
| 400 | `bad_time` | Missing day, or `end_min <= start_min`. |
| 400 | `resource_required` | Booking without a table. |
| 400 | `resource_not_in_location` | Table belongs to a different venue than `location_id`. |
| 400 | `discount_reason_required` | Discount without a reason. |
| 400 | `cancel_reason_required` | Cancellation without a reason. |
| 400 | `title_required`, `bad_request` | Missing required fields. |
| 401 | `no_token`, `bad_token`, `user_gone` | Not signed in / token invalid / account archived. The UI signs out. |
| 401 | `bad_credentials` | Wrong username or password on `/auth/login`. |
| 403 | `owner_only` | Admin tried an owner-only endpoint. |
| 404 | `not_found` | |
| 409 | `conflict` | Slot overlap; body includes `conflict`. Retry with `force: true`. |
| 500 | `server_error` | Unhandled error; `detail` carries the message. |

The integration suite in [`server/test/e2e.mjs`](../server/test/e2e.mjs) exercises
most of these paths and doubles as executable examples.
