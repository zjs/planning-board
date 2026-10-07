import { expect, test, type Page } from '@playwright/test';
import { APP_URL, dragTo, holdOver, storageSettled } from './app.ts';

// Sprint 7, slice 6: the guided start (Q53). Each step is done by doing it on the board.

const guide = (page: Page) => page.getByTestId('guide');
const current = (page: Page) => guide(page).locator('li[aria-current="step"] .guide-title');

async function startBlank(page: Page) {
  await page.goto(APP_URL);
  await page.locator('.empty-state button.primary').click();
  await page.getByTestId('board').waitFor();
}

test('a blank plan walks through dumping, organizing, another view, and grouping', async ({ page }) => {
  test.setTimeout(60_000);
  await startBlank(page);
  await expect(guide(page)).toBeVisible();
  await expect(current(page)).toHaveText('Get your ideas down');

  // 1. Dump ideas: the first card is ready to type.
  for (const title of ['Passwordless login', 'Audit log export', 'SCIM provisioning']) {
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
  await expect(current(page)).toHaveText('Make a place for them');

  // 2. Make areas from the header.
  await page.getByTestId('add-y').click();
  await page.keyboard.type('Identity');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Compliance');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(current(page)).toHaveText('Sort them');

  // 3. Sort an idea into an area.
  const identity = (await page.locator('.band-y', { hasText: 'Identity' }).getAttribute('data-band'))!;
  await dragTo(page, page.locator('.card', { hasText: 'Passwordless login' }), page.locator(`.cell:not(.gap)[data-row="${identity}"]`).first());
  await expect(current(page)).toHaveText('See them another way');

  // 4. Another view: size a card in Sizing, then back to Sequence, where it kept its area.
  await page.getByTestId('preset-sizing').click();
  await dragTo(page, page.locator('.card', { hasText: 'Audit log export' }), page.locator('.holding-cell[data-column="m"]:not([data-row])'));
  await expect(current(page)).toHaveText('Group them');
  await page.getByTestId('preset-sequence').click();
  await expect(page.locator(`.cell[data-row="${identity}"] .card`, { hasText: 'Passwordless login' })).toHaveCount(1);

  // 5. Group: hold one card over another.
  await holdOver(page, page.locator('.card', { hasText: 'SCIM provisioning' }), page.locator('.card', { hasText: 'Audit log export' }));
  await page.mouse.up();
  await expect(guide(page).getByRole('heading')).toHaveText('That’s the board');
  await expect(guide(page)).toContainText('5 of 5');

  await guide(page).getByRole('button', { name: 'Done' }).click();
  await expect(guide(page)).toHaveCount(0);
  // Finished: a new blank plan doesn't offer it again.
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(guide(page)).toHaveCount(0);
});

test('the guide can be skipped, and stays skipped', async ({ page }) => {
  await startBlank(page);
  await page.keyboard.press('Escape');
  await guide(page).getByRole('button', { name: 'Skip the guide' }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(guide(page)).toHaveCount(0);
});

test('the guide survives a reload while it’s running', async ({ page }) => {
  await startBlank(page);
  await page.keyboard.type('One idea');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await storageSettled(page);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(current(page)).toHaveText('Get your ideas down');
  await expect(guide(page)).toContainText('1 of 3 so far');
});

test('the first click on a group says how to see inside it, once', async ({ page }) => {
  await page.goto(APP_URL);
  await page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  const group = page.locator('.card[data-item="passwordless-login"]:not(.via-children)').first();
  await group.locator('.card-title').click();
  await expect(page.getByTestId('notice')).toContainText('to see what’s inside right here');
  // Once per browser: after a reload, clicking a group says nothing.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await page.locator('.card[data-item="eu-data-residency"]:not(.via-children)').first().locator('.card-title').click();
  await expect(page.locator('.card[data-item="eu-data-residency"].selected').first()).toBeVisible();
  await expect(page.getByTestId('notice')).toHaveCount(0);
});
