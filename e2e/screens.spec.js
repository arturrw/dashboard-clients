import { test, expect, login } from './fixtures.js'

test.describe('every screen loads cleanly', () => {
  const screens = [
    ['/dashboard', 'Today at a glance'],
    ['/calendar', null],
    ['/tasks', 'Tasks'],
    ['/clients', 'Guests'],
    ['/price', 'Supply price list'],
    ['/rota', null],
    ['/activity', 'Activity log'],
    ['/admin', 'Administration']
  ]

  for (const who of ['owner', 'centrs']) {
    test(`all routes as ${who}`, async ({ page }) => {
      await login(page, who)
      for (const [path, heading] of screens) {
        await page.goto(path)
        if (path === '/admin' && who !== 'owner') {
          await expect(page.getByText('Owner access only')).toBeVisible()
          continue
        }
        if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
        await expect(page.getByText('Something went wrong')).toHaveCount(0)
        await expect(page.getByText('Loading…')).toHaveCount(0)
      }
    })
  }

  test('unknown route falls back to the calendar', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/does-not-exist')
    await expect(page).toHaveURL(/\/calendar$/)
  })

  test('deep link survives a hard reload (SPA fallback)', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/price')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Supply price list' })).toBeVisible()
  })

  test('theme and UI language toggle from the top bar', async ({ page }) => {
    await login(page, 'centrs')
    await page.getByRole('button', { name: 'Appearance' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('banner').getByRole('button', { name: 'EN', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Latviešu' }).click()
    await expect(page.getByRole('link', { name: 'Kalendārs' })).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('link', { name: 'Kalendārs' })).toBeVisible()
  })
})

test.describe('guests', () => {
  test('search the guest book and open a card with history', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/clients')
    await page.getByPlaceholder('Search by name or phone').fill('Vītola')
    await expect(page.getByText('Ilona Vītola')).toBeVisible()
    await expect(page.getByText('Andris Kalniņš')).toHaveCount(0)
    await page.getByText('Ilona Vītola').click()
    await expect(page).toHaveURL(/\/clients\/\d+$/)
    await expect(page.getByRole('heading', { name: 'Ilona Vītola' })).toBeVisible()
    await expect(page.getByText('Allergic to nuts. Never serve pesto.').first()).toBeVisible()
    await expect(page.getByText('Visit history')).toBeVisible()
  })

  test('add a note to a guest card', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/clients')
    await page.getByPlaceholder('Search by name or phone').fill('Roberts')
    await page.getByText('Roberts Ozols').click()
    const note = `Prefers sparkling water ${Date.now()}`
    await page.getByPlaceholder('Add note').fill(note)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('li').filter({ hasText: note })).toBeVisible()
    await expect(page.getByPlaceholder('Add note')).toHaveValue('')
  })
})

test.describe('tasks', () => {
  test('create, move and delete a task', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/tasks')
    const title = `Check the oven ${Date.now()}`
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await dialog.getByLabel(/^Task/).fill(title)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    const card = page.locator('article').filter({ hasText: title })
    const column = (name) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
    await expect(column('Open').locator('article').filter({ hasText: title })).toBeVisible()

    await card.hover()
    await card.getByRole('button', { name: '→ Done' }).click()
    await expect(column('Done').locator('article').filter({ hasText: title })).toBeVisible()

    await card.hover()
    await card.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete' }).click()
    await expect(card).toHaveCount(0)
  })

  test('drag a task card to another column', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/tasks')
    const title = `Drag task ${Date.now()}`
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog').getByLabel(/^Task/).fill(title)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

    const card = page.locator('article').filter({ hasText: title })
    const target = page.locator('section').filter({ has: page.getByRole('heading', { name: 'In progress', exact: true }) })
    await card.scrollIntoViewIfNeeded()
    const a = await card.boundingBox()
    const b = await target.boundingBox()
    await page.mouse.move(a.x + 40, a.y + 10)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + 30, { steps: 4 })
    await page.mouse.move(b.x + b.width / 2, Math.max(b.y, 0) + 60, { steps: 15 })
    await page.mouse.up()
    await expect(target.locator('article').filter({ hasText: title })).toBeVisible()
  })
})

test.describe('price list', () => {
  test('search by supplier and SKU', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/price')
    const search = page.getByPlaceholder('Search item, SKU or supplier')
    await search.fill('Vīna Studija')
    await expect(page.getByText('Chianti Classico DOCG')).toBeVisible()
    await expect(page.getByText('Flour Caputo 00 Pizzeria')).toHaveCount(0)
    await search.fill('FL-00')
    await expect(page.getByText('Flour Caputo 00 Pizzeria')).toBeVisible()
  })

  test('admins see prices read-only', async ({ page }) => {
    await login(page, 'centrs')
    await page.goto('/price')
    await expect(page.getByText('Prices are maintained by the owner')).toBeVisible()
  })
})

test.describe('activity', () => {
  test('the activity log lists sign-ins', async ({ page }) => {
    await login(page, 'owner')
    await page.goto('/activity')
    await expect(page.getByText(/signed in/).first()).toBeVisible()
  })
})
