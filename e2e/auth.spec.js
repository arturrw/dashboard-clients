import { test, expect, login } from './fixtures.js'

test.describe('sign-in and device binding', () => {
  test('lists venue accounts on an unbound terminal', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Choose an account')).toBeVisible()
    for (const venue of ['Forno · Rīga Centrs', 'Forno · Purvciems', 'Forno · Jūrmala']) {
      await expect(page.getByRole('button', { name: new RegExp(venue) })).toBeVisible()
    }
  })

  test('wrong password is rejected with a message', async ({ page }) => {
    test.info().annotations.push({ type: 'allow-console', description: '401' })
    await page.goto('/')
    await page.getByRole('button', { name: /Rīga Centrs/ }).click()
    await expect(page.getByLabel('Account')).toHaveValue('centrs')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Wrong account or password')).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveValue('')
  })

  test('venue admin signs in, lands on the diary, and the PC stays bound after sign-out', async ({ page }) => {
    await login(page, 'centrs')
    await expect(page).toHaveURL(/\/calendar$/)
    await expect(page.getByRole('button', { name: /Forno · Rīga Centrs/ }).first()).toBeVisible()
    // Admin has no Admin screen
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

    await page.getByRole('banner').getByRole('button').last().click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()

    await expect(page.getByText('This computer is bound to')).toBeVisible()
    await expect(page.getByLabel('Account')).toHaveCount(0)
    await page.getByLabel('Password').fill('centrs')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/calendar$/)

    // Unbinding brings the account list back
    await page.getByRole('banner').getByRole('button').last().click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Use a different account' }).click()
    await expect(page.getByText('Choose an account')).toBeVisible()
  })

  test('session survives a reload', async ({ page }) => {
    await login(page, 'owner')
    await page.reload()
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  })

  test('a stale token bounces back to the login screen', async ({ page }) => {
    test.info().annotations.push({ type: 'allow-console', description: '401' })
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('forno.token', 'garbage'))
    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('language can be switched on the login screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'LV', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pieslēgties' })).toBeVisible()
    await page.getByRole('button', { name: 'RU', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})
