import { test, expect, login, freeDay } from './fixtures.js'

const PX_PER_MIN = 1.5

async function openDay(page, day) {
  await page.goto('/calendar')
  await page.locator('header input[type="date"]').fill(day)
  await expect(page.getByText('T6', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('')
  // A live day scrolls to "now"; other days keep that offset. Start at opening time.
  await page.locator('div.overflow-auto').filter({ has: page.getByText('T6', { exact: true }) }).evaluate((el) => {
    el.scrollTop = 0
  })
}

async function pickOption(page, trigger, option) {
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

/** Opens "New booking" (10:00 on the first table for a non-today day) and fills the guest. */
async function createBooking(page, { phone, name, service = 'Dinner reservation', extra } = {}) {
  await page.getByRole('button', { name: 'New booking' }).click()
  const dialog = page.getByRole('dialog', { name: 'New booking' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Phone number').fill(phone)
  await dialog.getByLabel('Guest name').fill(name)
  if (service) {
    await dialog.getByRole('combobox').filter({ hasText: 'Add service' }).click()
    await page.getByRole('option', { name: new RegExp(service) }).click()
  }
  await extra?.(dialog)
  await dialog.getByRole('button', { name: 'Confirm booking' }).click()
  return dialog
}

const tile = (page, name) => page.locator('[data-block="booking"]').filter({ hasText: name })

test.describe('diary', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'centrs')
  })

  test("today's diary renders tables, bookings and the now-line", async ({ page }) => {
    await expect(page.getByText('Drag to move · drag the edge to resize')).toBeVisible()
    for (const table of ['T6', 'T5', 'T4', 'T3', 'T2', 'Bar4']) {
      await expect(page.getByText(table, { exact: true })).toBeVisible()
    }
    await expect(page.locator('[data-block="booking"]').first()).toBeAttached()
  })

  test('day navigation moves one day at a time', async ({ page }) => {
    const date = page.locator('header input[type="date"]')
    const start = await date.inputValue()
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(date).not.toHaveValue(start)
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(date).toHaveValue(start)
  })

  test('new guest booking: NEW badge, service sets duration, discount needs a reason, total is computed', async ({ page }) => {
    const day = freeDay(0)
    await openDay(page, day)
    const phone = `3712${String(Date.now()).slice(-7)}`

    await page.getByRole('button', { name: 'New booking' }).click()
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    await dialog.getByLabel('Phone number').fill(phone)
    await dialog.getByLabel('Guest name').fill('Playwright Viesis')
    await expect(dialog.getByText('First time in the database')).toBeVisible()
    await expect(dialog.getByText('NEW', { exact: true })).toBeVisible()

    await dialog.getByRole('combobox').filter({ hasText: 'Add service' }).click()
    await page.getByRole('option', { name: /Birthday party/ }).click()
    // 180-minute service from 10:00 → 13:00
    await expect(dialog.getByLabel('To', { exact: true })).toHaveText('13:00')

    await pickOption(page, dialog.getByRole('combobox').filter({ hasText: 'No discount' }), 'Percent')
    await dialog.getByLabel('Discount', { exact: true }).fill('10')
    await expect(dialog.getByText('A discount must state its reason')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
    await dialog.getByLabel('Discount reason').fill('Regular guest')
    await expect(dialog.getByText('€108.00').or(dialog.getByText('108,00'))).toBeVisible()

    await dialog.getByLabel('Permanent note about the guest').fill('Gluten free')
    await dialog.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status').getByText('First time in the database')).toBeVisible()
    await expect(tile(page, 'Playwright Viesis')).toBeVisible()

    // Reopen: returning guest, values persisted, trail visible
    await tile(page, 'Playwright Viesis').click()
    const edit = page.getByRole('dialog', { name: 'Edit booking' })
    await expect(edit).toBeVisible()
    await expect(edit.getByLabel('Guest name')).toHaveValue('Playwright Viesis')
    await expect(edit.getByLabel('Discount reason')).toHaveValue('Regular guest')
    await expect(edit.getByText('Returning guest')).toBeVisible()
    await expect(edit.getByText('Gluten free').first()).toBeVisible()
    await edit.getByRole('button', { name: /Details/ }).click()
    await expect(edit.getByText('Created by:')).toBeVisible()
    await expect(edit.getByText(/created —/)).toBeVisible()
  })

  test('typing a known phone autofills the guest card', async ({ page }) => {
    await openDay(page, freeDay(1))
    await page.getByRole('button', { name: 'New booking' }).click()
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    await dialog.getByLabel('Phone number').fill('3712671')
    await page.getByRole('button', { name: /Ilona Vītola/ }).click()
    await expect(dialog.getByLabel('Guest name')).toHaveValue('Ilona Vītola')
    await expect(dialog.getByLabel('Phone number')).toHaveValue('37126713408')
    await expect(dialog.getByText('Returning guest')).toBeVisible()
    await expect(dialog.getByText('Allergic to nuts. Never serve pesto.').first()).toBeVisible()
    await expect(dialog.getByText('First time in the database')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('editing a returning guest booking shows their previous visit', async ({ page }) => {
    // Seeded bookings for today all belong to guests with history.
    await page.locator('[data-block="booking"]').first().click()
    const edit = page.getByRole('dialog', { name: 'Edit booking' })
    await expect(edit.getByText('Returning guest')).toBeVisible()
    await expect(edit.getByText('Previous visit:')).toBeVisible()
    await expect(edit.getByText('No previous visits')).toHaveCount(0)
  })

  test('a known phone does not overwrite a name typed before the lookup returns', async ({ page }) => {
    await openDay(page, freeDay(9))
    await page.getByRole('button', { name: 'New booking' }).click()
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    // Full known number, then the name straight away — faster than the 220 ms lookup.
    await dialog.getByLabel('Phone number').fill('37126713408')
    await dialog.getByLabel('Guest name').fill('Ilona (for her mother)')
    await expect(dialog.getByText('Returning guest')).toBeVisible()
    await expect(dialog.getByLabel('Guest name')).toHaveValue('Ilona (for her mother)')
    // The permanent note was not typed, so it is filled in from the card.
    await expect(dialog.getByLabel('Permanent note about the guest')).toHaveValue('Allergic to nuts. Never serve pesto.')
  })

  test('double-booking a table asks before overriding', async ({ page }) => {
    await openDay(page, freeDay(2))
    const phone = `3712${String(Date.now() + 1).slice(-7)}`
    await createBooking(page, { phone, name: 'First Party' })
    await expect(tile(page, 'First Party')).toBeVisible()

    await createBooking(page, { phone: `3712${String(Date.now() + 7).slice(-7)}`, name: 'Second Party' })
    const conflict = page.getByRole('dialog', { name: 'That slot is taken' })
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: 'Choose another slot' }).click()
    await expect(conflict).toBeHidden()
    // The booking dialog stays open for the admin to pick another slot
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm booking' }).click()
    await page.getByRole('dialog', { name: 'That slot is taken' }).getByRole('button', { name: 'Place it anyway' }).click()
    await expect(dialog).toBeHidden()
    await expect(tile(page, 'Second Party')).toBeVisible()
    await expect(page.getByText(/1 overlap\(s\) on this day/)).toBeVisible()
  })

  test('cancelling a booking demands a reason and frees the slot', async ({ page }) => {
    await openDay(page, freeDay(3))
    await createBooking(page, { phone: `3712${String(Date.now() + 2).slice(-7)}`, name: 'Cancel Me' })
    await tile(page, 'Cancel Me').click()
    const edit = page.getByRole('dialog', { name: 'Edit booking' })
    await edit.getByRole('button', { name: 'Cancel booking' }).click()

    const ask = page.getByRole('dialog', { name: 'Cancel this booking?' })
    await ask.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(ask.getByText('A reason is required to cancel')).toBeVisible()
    await ask.getByLabel(/Reason for cancellation/).fill('Guest called to cancel')
    await ask.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(edit).toBeHidden()
    await expect(page.getByRole('status').getByText('Cancelled')).toBeVisible()

    // Slot is bookable again without a conflict prompt
    await createBooking(page, { phone: `3712${String(Date.now() + 3).slice(-7)}`, name: 'Replacement' })
    await expect(page.getByRole('dialog', { name: 'That slot is taken' })).toHaveCount(0)
    await expect(tile(page, 'Replacement')).toBeVisible()
  })

  test('drag a booking to another table and later time, with confirmation', async ({ page }) => {
    await openDay(page, freeDay(4))
    await createBooking(page, { phone: `3712${String(Date.now() + 4).slice(-7)}`, name: 'Drag Me' })
    const block = tile(page, 'Drag Me')
    await expect(block).toBeVisible()

    const from = await block.boundingBox()
    const target = await page.getByText('T5', { exact: true }).boundingBox()
    const startX = from.x + from.width / 2
    const startY = from.y + 12
    const endX = target.x + 20
    const endY = startY + 60 * PX_PER_MIN // one hour later

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 10, startY + 10, { steps: 3 })
    await page.mouse.move(endX, endY, { steps: 12 })
    await page.mouse.up()

    const confirm = page.getByRole('dialog', { name: 'Move this booking?' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText(/10:00–11:30 to 11:00–12:30.*T5/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByRole('status').getByText('11:00–12:30')).toBeVisible()

    await block.click()
    const edit = page.getByRole('dialog', { name: 'Edit booking' })
    await expect(edit.getByText(/11:00–12:30/).first()).toBeVisible()
    await expect(edit.getByRole('combobox').filter({ hasText: /^T5/ })).toBeVisible()
  })

  test('dismissing the move confirmation leaves the booking where it was', async ({ page }) => {
    await openDay(page, freeDay(5))
    await createBooking(page, { phone: `3712${String(Date.now() + 5).slice(-7)}`, name: 'Stay Put' })
    const block = tile(page, 'Stay Put')
    const before = await block.boundingBox()
    await page.mouse.move(before.x + before.width / 2, before.y + 12)
    await page.mouse.down()
    await page.mouse.move(before.x + before.width / 2, before.y + 12 + 90, { steps: 10 })
    await page.mouse.up()
    await page.getByRole('dialog', { name: 'Move this booking?' }).getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(async () => (await block.boundingBox()).y).toBeCloseTo(before.y, 0)
  })

  test('clicking an empty slot opens a booking at that time and table', async ({ page }) => {
    await openDay(page, freeDay(6))
    const header = await page.getByText('T4', { exact: true }).boundingBox()
    const columnTop = header.y + header.height + 20
    // 10:00 is the top; aim for 12:00 (+120 min)
    await page.mouse.click(header.x + 30, columnTop + 120 * PX_PER_MIN)
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox').filter({ hasText: /^T4/ })).toBeVisible()
  })

  test('block time on a table and see it on the grid', async ({ page }) => {
    await openDay(page, freeDay(7))
    await page.getByRole('button', { name: 'Add break' }).click()
    const dialog = page.getByRole('dialog', { name: 'Block time' })
    await dialog.getByLabel('Title').fill('Deep clean')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-block="break"]').filter({ hasText: 'Deep clean' })).toBeVisible()
  })

  test('month view shows load and drills into a day', async ({ page }) => {
    await page.getByRole('tab', { name: 'Month' }).click()
    await expect(page.getByRole('button', { name: 'New booking' })).toHaveCount(0)
    const anyDay = page.locator('main button').filter({ hasText: /^\d{1,2}/ }).first()
    await anyDay.click()
    await expect(page.getByRole('tab', { name: 'Day', selected: true })).toBeVisible()
  })

  test('forwarded call: switch venue, warning shows, diary changes', async ({ page }) => {
    await page.getByRole('banner').getByRole('button', { name: /Forno · Rīga Centrs/ }).click()
    await page.getByRole('menuitem', { name: /Forno · Purvciems/ }).click()
    await expect(page.getByText('You are working in another venue’s diary').first()).toBeAttached()
    await expect(page.getByText('T8', { exact: true })).toBeVisible()
    await expect(page.getByText('Ģimenes · 8 seats')).toBeVisible()
  })

  test('booking into another venue from the dialog without switching the diary', async ({ page }) => {
    const day = freeDay(8)
    await openDay(page, day)
    await page.getByRole('button', { name: 'New booking' }).click()
    const dialog = page.getByRole('dialog', { name: 'New booking' })
    await dialog.getByLabel('Phone number').fill(`3712${String(Date.now() + 6).slice(-7)}`)
    await dialog.getByLabel('Guest name').fill('Forwarded Guest')
    await pickOption(page, dialog.getByRole('combobox').filter({ hasText: 'Forno · Rīga Centrs' }), /Forno · Jūrmala/)
    await expect(dialog.getByText(/This booking goes to Forno · Jūrmala/)).toBeVisible()
    const table = dialog.getByRole('combobox').filter({ hasText: '—' }).first()
    await pickOption(page, table, /^T5 · Terase/)
    await dialog.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status').getByText(/Forno · Jūrmala/)).toBeVisible()
    // Not in the Centrs diary
    await expect(tile(page, 'Forwarded Guest')).toHaveCount(0)
  })
})
