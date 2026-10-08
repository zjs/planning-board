import { expect, test } from '@playwright/test';
import { APP_URL, openApp, planList, storageSettled, switchPlan } from './app.ts';

// Several plans per browser (Q58, Q66, Q67, ADR 0021): make, switch, rename, delete and undo, reload.

test('a first visit leaves one plan, and the sample replaces the untouched empty one', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.getByTestId('plan-name')).toHaveText('My plan');
  await page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Sample plan');
  expect(await planList(page)).toEqual(['Sample plan']);
  await expect(page).toHaveURL(/#plan=p[0-9a-f]+$/);
});

test('plans sit side by side: switch, rename, and each keeps its own view', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-sizing').click();

  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(page.getByTestId('draft-card').locator('textarea')).toBeFocused();
  await page.keyboard.type('Scratch idea');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card', { hasText: 'Scratch idea' })).toHaveCount(1);

  // Rename it from the toolbar.
  await page.getByTestId('plan-name').dblclick();
  await page.getByLabel('Plan name').fill('Q3 ideas');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-name')).toHaveText('Q3 ideas');
  await expect(page).toHaveTitle('Q3 ideas · Planning Board');
  expect(await planList(page)).toEqual(['Q3 ideas', 'Sample plan']);

  // The sample kept its own view and cards.
  await switchPlan(page, 'Sample plan');
  await expect(page.getByTestId('preset-sizing')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.card', { hasText: 'Scratch idea' })).toHaveCount(0);

  // The link names the plan, and a reload opens the one used last, with its new name.
  await switchPlan(page, 'Q3 ideas');
  await storageSettled(page);
  await page.reload();
  await expect(page.getByTestId('plan-name')).toHaveText('Q3 ideas');
  await expect(page.locator('.card', { hasText: 'Scratch idea' })).toHaveCount(1);
});

test('Delete plan opens another, and Undo brings it back as it was', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(page.getByTestId('draft-card').locator('textarea')).toBeFocused();
  await page.keyboard.type('Keep me');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await storageSettled(page);

  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Delete plan' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Sample plan');
  await expect(page.getByTestId('plan-notice')).toContainText('Deleted “Untitled plan”');
  expect(await planList(page)).toEqual(['Sample plan']);

  await page.getByTestId('plan-notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Untitled plan');
  await expect(page.locator('.card', { hasText: 'Keep me' })).toHaveCount(1);
  expect(await planList(page)).toEqual(['Untitled plan', 'Sample plan']);
});

test('deleting the only plan leaves an empty one to start from', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Delete plan' }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.getByTestId('plan-name')).toHaveText('Untitled plan');
  // After the Undo runs out, the deleted plan is gone for good.
  await expect(page.getByTestId('plan-notice')).toHaveCount(0, { timeout: 12_000 });
  expect(await planList(page)).toEqual(['Untitled plan']);
  await page.reload();
  await expect(page.locator('.empty-state')).toBeVisible();
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('planning-board:v2:plan:'))),
  ).toHaveLength(1);
});
