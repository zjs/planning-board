import { expect, test } from '@playwright/test';
import { card, dragTo, openApp, pickAxes } from './app.ts';

test('dropping a card in the gap between sequence columns opens a new column there', async ({ page }) => {
  await openApp(page);
  const columns = page.locator('.column-header:not(.gap)');
  const before = await columns.count();
  const id = 'tenant-data-deletion-gdpr';
  const copy = page.locator(`.cell[data-row="billing"] .card[data-item="${id}"]`);
  const fromColumn = await copy.evaluate((el) => el.closest<HTMLElement>('.cell')!.dataset.column!);

  // The gap just before the card's current column, in the Billing row.
  const gapKeys = await page
    .locator('.cell.gap[data-row="billing"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.column!));
  const target = gapKeys.filter((k) => k < fromColumn).at(-1)!;
  await dragTo(page, copy, page.locator(`.cell.gap[data-row="billing"][data-column="${target}"]`));

  // The item left a shared column, so the column count goes up by one.
  await expect(columns).toHaveCount(before + 1);
  await expect(page.locator(`.cell[data-row="billing"][data-column="${target}"] .card[data-item="${id}"]`)).toBeVisible();
  // It's a multi-lane card, so all its copies moved to the new column together.
  await expect(page.locator(`.cell[data-column="${target}"] .card[data-item="${id}"]`)).toHaveCount(3);
  // Sequence columns still carry no labels.
  for (const text of await columns.allTextContents()) expect(text).toBe('');
});

test('cards show badges for values that are not on an axis', async ({ page }) => {
  await openApp(page);
  const c = card(page, 'idp-initiated-login');
  await expect(c.locator('.attr[data-property="size"]')).toHaveText('XL');
  await expect(c.locator('.attr[data-property="time"]')).toHaveText('27.4');
  await expect(c.locator('.attr[data-property="time"]')).toHaveAttribute('title', 'Time: Q2 2027 › 27.4');
  // The rows show the area; the component is more precise, so it gets a badge.
  await expect(c.locator('.attr[data-property="system"]')).toHaveText('SSO');

  await pickAxes(page, 'time', 'size');
  await expect(c.locator('.attr[data-property="system"]')).toHaveText('SSO');
  // Size is shown exactly by the rows; the release is more precise than the quarter columns.
  await expect(c.locator('.attr[data-property="size"]')).toHaveCount(0);
  await expect(c.locator('.attr[data-property="time"]')).toHaveText('27.4');
});
