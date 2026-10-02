# Architecture

Forno is a two-tier app: a React single-page UI and a small Express API with
SQLite (`node:sqlite`) for storage. In production nginx serves the built UI and
reverse-proxies `/api` to the API container, so the browser only ever talks to
one origin.

- [Deployment topology](#deployment-topology)
- [Request lifecycle](#request-lifecycle)
- [Booking flow](#booking-flow)
- [Drag, confirm, persist](#drag-confirm-persist)
- [Data model](#data-model)
- [Key decisions](#key-decisions)
- [Source layout](#source-layout)

## Deployment topology

```mermaid
flowchart LR
    subgraph Browser["Front-desk PC (browser)"]
        SPA["React SPA<br/>localStorage: token, venue binding, lang, theme"]
    end

    subgraph Compose["docker compose"]
        subgraph Web["web container · nginx:1.27-alpine"]
            Static["/ · /assets/*<br/>built Vite bundle<br/>SPA fallback → index.html"]
            Proxy["/api/* → reverse proxy"]
        end
        subgraph Api["api container · node:24-alpine"]
            Express["Express app<br/>auth · calendar · clients · catalog"]
            Entrypoint["docker-entrypoint.sh<br/>seeds an empty volume"]
        end
        Volume[("forno-data volume<br/>/data/data.db (SQLite, WAL)")]
    end

    SPA -- "HTTP :8080" --> Static
    SPA -- "fetch /api/... + Bearer JWT<br/>+ X-Location-Id" --> Proxy
    Proxy -- "http://api:4000" --> Express
    Entrypoint -.-> Volume
    Express <--> Volume
```

In development the same shape is produced by Vite: `npm run dev` serves the UI
on `:5173` and its dev-server proxy forwards `/api` to the API on `:4000`
(`API_PROXY_TARGET` overrides the target).

## Request lifecycle

Every authenticated call carries two pieces of context: **who** (the JWT) and
**which venue's diary** they are acting on (`X-Location-Id`). They differ when
an admin takes a forwarded call for another venue — the audit log records both.

```mermaid
flowchart TD
    A["UI calls api(path)<br/>web/src/lib/api.js"] --> B["Headers: Authorization: Bearer &lt;jwt&gt;<br/>X-Location-Id: &lt;acting venue&gt;"]
    B --> C{"nginx / Vite proxy<br/>/api/*"}
    C --> D["express.json()"]
    D --> E{"Route group"}
    E -- "/api/auth/*" --> L["login / accounts<br/>(no token needed)"]
    E -- "everything else" --> F["requireAuth<br/>verify JWT · load user<br/>req.locationId = header ‖ user's venue"]
    F -- "bad / missing token" --> U["401 → UI signs out<br/>(only when a token was sent)"]
    F --> G{"Owner-only?<br/>(reference data, users, delete booking)"}
    G -- "admin" --> X["403 owner_only"]
    G -- "ok" --> H["Handler<br/>validate → conflict check → write"]
    H --> I["audit(req, …)<br/>actor venue + target venue"]
    I --> J["JSON response"]
    H -- "slot taken" --> K["409 conflict + blocking item<br/>UI offers 'Place it anyway' (force)"]
```

## Booking flow

What happens between the admin typing a phone number and the block appearing
in the diary.

```mermaid
flowchart TD
    S([Admin clicks a free slot<br/>or 'New booking']) --> P["Type phone number"]
    P --> Q{"≥ 3 digits?"}
    Q -- no --> P
    Q -- yes --> R["GET /clients/lookup?q=…<br/>(220 ms debounce)"]
    R --> M{"Exact number match?"}
    M -- yes --> AF["Autofill guest card<br/>(never overwrites fields the admin typed)"]
    M -- "partial matches" --> DD["Dropdown: name · visits · last visit"]
    DD --> AF
    M -- none --> NEW["'First time in the database' + NEW badge"]
    AF --> SV
    NEW --> SV
    SV["Pick venue · table · time · services<br/>services drive duration and total"] --> DIS{"Discount set?"}
    DIS -- "yes, no reason" --> BLK["Save disabled<br/>(also 400 discount_reason_required)"]
    DIS -- "no / reason given" --> POST["POST /bookings"]
    POST --> VAL{"Server checks"}
    VAL -- "table not in that venue" --> E400["400 resource_not_in_location"]
    VAL -- "overlaps booking or break" --> C409["409 conflict"]
    C409 --> ASK{"'Place it anyway'?"}
    ASK -- no --> SV
    ASK -- yes --> FORCE["POST /bookings { force: true }"]
    VAL -- ok --> SAVE["Insert booking + services<br/>upsert client · permanent note<br/>audit 'create'"]
    FORCE --> SAVE
    SAVE --> DONE([Diary reloads · toast names the venue<br/>if it was booked elsewhere])
```

Cancelling follows the same rule as discounts: the dialog demands a written
reason, and `PATCH /bookings/:id { status: 'cancelled' }` without
`cancel_reason` is rejected by the API as well.

## Drag, confirm, persist

The diary never saves on drop. A drag only produces a *proposal*; the page asks
first, and a conflict asks a second time.

```mermaid
sequenceDiagram
    actor Admin
    participant Grid as DayGrid
    participant Page as Calendar page
    participant Confirm as ConfirmDialog
    participant API

    Admin->>Grid: pointerdown on a block
    Grid->>Grid: dragRef = item, mode (move/resize)
    loop pointermove
        Grid->>Grid: snap to 5 min · hit-test column · re-layout lanes
    end
    Admin->>Grid: pointerup
    alt not moved
        Grid->>Page: onOpenBooking(item)
    else moved
        Grid->>Page: onProposeMove({ item, next })
        Page->>Confirm: "Move this booking?"
        Confirm-->>Page: confirm / cancel
        Page->>API: PATCH /bookings/:id (force=false)
        alt 409 conflict
            API-->>Page: conflict { label, start, end }
            Page->>Confirm: "That slot is taken"
            Confirm-->>Page: Place it anyway
            Page->>API: PATCH … (force=true)
        end
        API-->>Page: 200
        Page->>Grid: reload day
    end
```

Callbacks are fired from the pointer-up handler, never from inside a React
state updater — StrictMode runs updaters twice, which used to open two
confirmation dialogs (and, on the task board, send the status change twice).

## Data model

```mermaid
erDiagram
    locations ||--o{ resources : "tables / zones"
    locations ||--o{ staff : employs
    locations ||--o{ bookings : "diary of"
    locations ||--o{ breaks : ""
    locations ||--o{ shifts : ""
    locations ||--o{ tasks : ""
    locations |o--o{ services : "NULL = chain-wide"
    locations |o--o{ products : ""
    locations |o--o{ users : "home venue (admins)"
    resources ||--o{ bookings : "column"
    staff |o--o{ bookings : "served by"
    clients |o--o{ bookings : guest
    clients ||--o{ client_notes : ""
    bookings ||--o{ booking_services : "line items"
    services |o--o{ booking_services : "copied at booking time"
    staff ||--o{ shifts : rota
    users |o--o{ audit_log : actor
```

- Times are a local calendar `day` (`YYYY-MM-DD`) plus `start_min`/`end_min`
  minute offsets from midnight. The chain runs in one timezone (set `TZ` on the
  API container), which keeps drag arithmetic exact and avoids DST bugs.
- Reference data is soft-deleted (`archived = 1`) so history still resolves
  retired staff and tables.
- `booking_services` copies name, duration and price at booking time, so a later
  price change does not rewrite past bills.
- `audit_log` stores actor venue and target venue separately; a mismatch is a
  forwarded call and is highlighted in the Activity screen.

## Key decisions

| Decision | Why |
| --- | --- |
| `node:sqlite`, no ORM, no native modules | Zero build step for the API; the image is plain `node:24-alpine`. One file to back up. |
| Single origin behind nginx | No CORS in production, the SPA fallback lives next to the API proxy, and fingerprinted `/assets` get a 1-year immutable cache while `index.html` is `no-cache`. |
| JWT (30 days) + device binding in `localStorage` | Front-desk PCs stay signed in; after sign-out the terminal still remembers its venue so only the password is asked for. |
| Server-side conflict detection with explicit `force` | Overlaps are visible and deliberate, never accidental, and the override is in the audit trail. |
| Reasons enforced in UI **and** API | Discounts and cancellations always explain themselves in the guest history. |
| Hand-written diary grid | Lanes for overlaps, 15-min grid, drag/resize with confirmation — none of which calendar libraries do the way the floor works. |

## Source layout

```
server/
  Dockerfile, docker-entrypoint.sh   API image; seeds an empty volume on first start
  src/index.js            Express app, route mounting, error handler
  src/lib/db.js           schema (CREATE IF NOT EXISTS) + query helpers
  src/lib/auth.js         JWT, requireAuth, acting-location resolution
  src/lib/audit.js        the write-trail
  src/routes/             auth, calendar, clients, catalog
  src/seed.js             demo dataset (resets the DB at DB_PATH)
  test/e2e.mjs            API integration suite
  test/run-e2e.mjs        boots a throwaway API + DB and runs the suite
web/
  Dockerfile, nginx.conf  UI image: Vite build served by nginx, /api proxied
  src/lib/api.js          fetch wrapper, token + venue headers, 401 handling
  src/lib/session.jsx     user, venues, device binding, theme
  src/components/ui/      shadcn-style primitives on Radix
  src/components/calendar/  day grid, tile, hover card, month view
  src/pages/              one file per screen
  src/i18n/               lv / en / ru dictionary
e2e/                      Playwright browser tests
scripts/screenshots.mjs   regenerates docs/screenshots
docker-compose.yml        api + web (nginx) + data volume
```
