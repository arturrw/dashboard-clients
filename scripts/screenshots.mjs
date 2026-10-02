/**
 * Regenerates docs/screenshots/*.png from a running, freshly seeded stack.
 *
 *   docker compose up -d          (or: npm run seed && npm run dev)
 *   BASE_URL=http://localhost:8080 npm run docs:screenshots
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:8080'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-GB',
  timezoneId: 'Europe/Riga'
})
await context.addInitScript(() => localStorage.setItem('forno.lang', 'en'))
const page = await context.newPage()
const shot = async (name) => {
  // Let fonts and the toast stack settle so images are stable between runs.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log(`  ✓ ${name}.png`)
}
const signIn = async (user) => {
  await page.goto('/')
  await page.evaluate(() => ['forno.device', 'forno.token', 'forno.location'].forEach((k) => localStorage.removeItem(k)))
  await page.goto('/')
  await page.getByLabel('Account').fill(user)
  await page.getByLabel('Password').fill(user)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('navigation', { name: 'Main' }).first().waitFor()
}

console.log(`Capturing from ${BASE}`)

await page.goto('/')
await page.getByText('Choose an account').waitFor()
await page.getByRole('button', { name: /Rīga Centrs/ }).click()
await shot('login')

await signIn('centrs')
await page.locator('[data-block="booking"]').first().waitFor()
await shot('calendar-day')

const busiest = page.locator('[data-block="booking"]').first()
await busiest.click()
const dialog = page.getByRole('dialog', { name: 'Edit booking' })
await dialog.getByText('Returning guest').waitFor()
await shot('booking-dialog')
await page.keyboard.press('Escape')

await page.getByRole('tab', { name: 'Month' }).click()
await page.waitForTimeout(600)
await shot('calendar-month')

for (const [route, name] of [['/dashboard', 'dashboard'], ['/tasks', 'tasks'], ['/price', 'price-list'], ['/rota', 'rota']]) {
  await page.goto(route)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.waitForLoadState('networkidle')
  await shot(name)
}

await page.goto('/clients')
await page.getByPlaceholder('Search by name or phone').fill('Vītola')
await page.getByText('Ilona Vītola').click()
await page.getByRole('heading', { name: 'Ilona Vītola' }).waitFor()
await page.waitForLoadState('networkidle')
await shot('guest-card')

await signIn('owner')
await page.goto('/activity')
await page.waitForLoadState('networkidle')
await shot('activity')
await page.goto('/admin')
await page.waitForLoadState('networkidle')
await shot('admin')

await page.goto('/calendar')
await page.getByRole('button', { name: 'Appearance' }).click()
await page.locator('[data-block="booking"]').first().waitFor()
await shot('calendar-dark')
await page.getByRole('button', { name: 'Appearance' }).click()

await browser.close()
