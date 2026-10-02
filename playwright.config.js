import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

/**
 * Two modes:
 *  - default: boots a seeded API on :4400 (its own DB file) and Vite on :5174.
 *  - BASE_URL=http://localhost:8080 — tests an already-running stack, e.g.
 *    `docker compose up`, through nginx. Seed it first so the data matches.
 */
const external = process.env.BASE_URL
const API_PORT = 4400
const WEB_PORT = 5174
const dbPath = path.join(os.tmpdir(), 'forno-playwright.db')

export default defineConfig({
  testDir: './e2e',
  // The suite shares one database; running it serially keeps every scenario
  // deterministic without per-test fixtures.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: external || `http://127.0.0.1:${WEB_PORT}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Riga',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: external
    ? undefined
    : [
        {
          command: 'node --no-warnings server/src/seed.js && node --no-warnings server/src/index.js',
          url: `http://127.0.0.1:${API_PORT}/api/health`,
          env: { DB_PATH: dbPath, PORT: String(API_PORT), TZ: 'Europe/Riga' },
          reuseExistingServer: false,
          timeout: 30_000
        },
        {
          command: `npm -w web run dev -- --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
          url: `http://127.0.0.1:${WEB_PORT}`,
          env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
          reuseExistingServer: false,
          timeout: 60_000
        }
      ]
})
