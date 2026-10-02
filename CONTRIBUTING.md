# Contributing

Thanks for working on Forno. This page covers setup, the test suites, and what a
change needs before it is merged. For how the pieces fit together, read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first; endpoints are in
[docs/API.md](docs/API.md).

## Setup

Requirements: **Node 24** (the API uses the built-in `node:sqlite`), npm 10+.
Docker is optional and only needed for the production-like stack.

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm run seed                      # demo data into server/data.db
npm run dev                       # API :4000 + UI :5173
```

`npm run seed` **wipes and recreates** the database at `DB_PATH`
(default `server/data.db`). The test suites never touch that file — they run on
their own temporary databases.

Useful environment variables:

| Variable | Used by | Default |
| --- | --- | --- |
| `DB_PATH` | API, seed | `server/data.db` |
| `PORT` | API | `4000` |
| `JWT_SECRET` | API | `dev-secret-change-me` — always set it outside development |
| `API_PROXY_TARGET` | Vite dev server | `http://localhost:4000` |
| `TZ` | API | host timezone — the chain runs on `Europe/Riga` |

## Tests

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Lane-layout unit tests + API integration suite (`server/test/e2e.mjs`) against a throwaway API and database | nothing running |
| `npm run test:e2e` | Playwright browser tests in `e2e/` — boots a seeded API on `:4400` and Vite on `:5174` | Chromium installed |
| `BASE_URL=http://localhost:8080 npx playwright test` | Same browser tests against the docker stack, through nginx | `docker compose up`, freshly seeded |
| `API_URL=http://localhost:8080 npm -w server test` | API suite against a running stack | running stack |

The browser tests run serially on one shared database and fail on any uncaught
page error or `console.error` (4xx responses that a flow expects, like a 409
conflict, are allowed). If a test fails, `npx playwright show-report` opens the
HTML report with traces and screenshots.

To test the docker stack from a clean slate:

```bash
SEED_ON_START=always docker compose up -d --force-recreate
BASE_URL=http://localhost:8080 npx playwright test
docker compose up -d        # back to seeding only an empty volume
```

## Making a change

1. Branch from `main`.
2. Keep the existing style: no semicolons, single quotes, 2-space indent,
   comments that explain *why*. UI primitives live in `web/src/components/ui`;
   reuse them rather than adding new ones.
3. **Every user-facing string goes through `t()`** and needs keys in all three
   dictionaries (`en`, `lv`, `ru`) in `web/src/i18n/dictionary.js`. English is
   the fallback, but do not rely on it.
4. Form controls go inside `<Field label=…>` so the label is wired to the input
   (`Input`, `Textarea`, `SelectTrigger` and `TimeField` pick the id up from
   context).
5. Never call callbacks, API requests or other side effects inside a React state
   updater (`setX(prev => …)`): StrictMode runs updaters twice in development.
6. Every write on the API calls `audit(req, …)` so it shows in the Activity log.
7. Schema changes go in `server/src/lib/db.js` (`CREATE … IF NOT EXISTS`) and,
   if the demo should show them, in `server/src/seed.js`.
8. Add or update tests: API behaviour in `server/test/e2e.mjs`, user flows in
   `e2e/*.spec.js`. A bug fix should come with a test that fails without it.
9. Run `npm test` and `npm run test:e2e` before opening a pull request.

If a change affects what the screens look like, refresh the screenshots:

```bash
SEED_ON_START=always docker compose up -d --build --force-recreate
npm run docs:screenshots
```

## Commits and pull requests

- Small, focused commits with an imperative subject line
  (`Fix double confirm on diary drag`, not `fixes`).
- The pull request says what changed, why, and how it was tested; include a
  screenshot for UI changes.
- Never commit `.env`, database files (`*.db`, `*.db-wal`, `*.db-shm`) or test
  output — `.gitignore` covers them.
