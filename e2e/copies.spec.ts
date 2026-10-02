import { expect, test } from '@playwright/test';
import { card, openApp, reveal } from './app.ts';

// A card's copies (Q45): a card in several lanes has a copy in each. Hovering or selecting one joins
// them with dashed lines and outlines every copy, so they can be found, along with all of its links.

const SEAT_SYNC = 'seat-sync-from-directory'; // Identity and Billing; two dependencies

test('hovering a copy joins every copy with a dashed line, outlines them, and shows all its links', async ({ page }) => {
  await openApp(page);
  const copies = card(page, SEAT_SYNC);
  await expect(copies).toHaveCount(2);
  await expect(page.locator('.copy-line')).toHaveCount(0);

  await reveal(copies.first());
  await copies.first().hover();
  await expect(page.locator(`.copy-line[data-item="${SEAT_SYNC}"]`)).toHaveCount(1);
  await expect(page.locator(`.card.copy-focus[data-item="${SEAT_SYNC}"]`)).toHaveCount(2);
  // Both links show, each drawn from the copy nearest its other end.
  const links = page.locator(`.dep-line.focus[data-from="${SEAT_SYNC}"], .dep-line.focus[data-to="${SEAT_SYNC}"]`);
  await expect(links).toHaveCount(2);
  // Dashed and arrowless, unlike a dependency.
  const dash = await page.locator('.copy-line').first().evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash).not.toBe('none');
  await expect(page.locator('.copy-line').first()).not.toHaveAttribute('marker-end', /.+/);

  // Moving away clears it; a card with one copy has nothing to join.
  await page.mouse.move(2, 2);
  await expect(page.locator('.copy-line')).toHaveCount(0);
  await card(page, 'custom-roles').hover();
  await expect(page.locator('.copy-line')).toHaveCount(0);
  await expect(page.locator('.card.copy-focus')).toHaveCount(0);
});

test('a selected card keeps its copies joined until it is deselected', async ({ page }) => {
  await openApp(page);
  const first = card(page, SEAT_SYNC).first();
  await reveal(first);
  await first.locator('.card-title').click();
  await page.mouse.move(2, 2);
  await expect(page.locator(`.copy-line[data-item="${SEAT_SYNC}"]`)).toHaveCount(1);
  await expect(page.locator(`.card.copy-focus[data-item="${SEAT_SYNC}"]`)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.copy-line')).toHaveCount(0);
});
