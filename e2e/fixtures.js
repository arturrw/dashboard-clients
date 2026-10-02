import { test as base, expect } from '@playwright/test'

/**
 * Every test runs in English and fails on any uncaught page error or
 * console.error — React warnings and failed requests included — so a screen
 * that "looks fine" but throws underneath does not pass silently.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const problems = []
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      // 4xx responses are part of tested flows (409 conflict, 401 bad login);
      // the browser logs them, but they are not defects. 5xx still fails.
      if (/Failed to load resource: .* status of 4\d\d/.test(msg.text())) return
      problems.push(`console.error: ${msg.text()}`)
    })
    await page.addInitScript(() => {
      if (!localStorage.getItem('forno.lang')) localStorage.setItem('forno.lang', 'en')
    })
    await use(page)
    const allowed = testInfo.annotations.filter((a) => a.type === 'allow-console').map((a) => a.description)
    const real = problems.filter((p) => !allowed.some((a) => p.includes(a)))
    expect(real, 'browser errors during the test').toEqual([])
  }
})

export { expect }

/**
 * Signs in through the real form. The seeded demo accounts (owner, centrs,
 * purvciems, jurmala) use the account name as the password — see seed.js.
 */
export async function login(page, username = 'centrs') {
  await page.goto('/')
  await page.getByLabel('Account').fill(username)
  await page.getByLabel('Password').fill(username)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
}

export const isoDay = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A day well past the seeded range (today−12 … today+20), so the diary is empty. */
export const freeDay = (offset = 0) => isoDay(new Date(Date.now() + (60 + offset) * 86400000))

export async function openDay(page, day) {
  await page.goto('/calendar')
  await page.locator('header input[type="date"]').fill(day)
  await expect(page.getByText('T1', { exact: true }).or(page.locator('[data-block]')).first()).toBeVisible()
}
