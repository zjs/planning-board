import { expect, test } from '@playwright/test';
import { card, dragTo, holding, openApp, reveal, storageSettled } from './app.ts';

// Calm (sprint 8): the colored edge is explained on the board, and holding lanes collapse to a rail that still
// takes drops.

test('the colored edge is the card’s area: its header shows the color, the view bar keys it, the edge names it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  // Identity & Access is the first area: its band and its cards share the first color.
  const band = page.locator('.band-y[data-band="identity"]');
  await expect(band).toHaveAttribute('data-area', '0');
  await expect(card(page, 'scim-2-0-group-push').first()).toHaveAttribute('data-area', '0');
  await expect(card(page, 'scim-2-0-group-push').first().locator('.area-edge')).toHaveAttribute('title', 'Area: Identity & Access');
  // With System on an axis, the headers are the key; with it on neither, the view bar is.
  await expect(page.getByTestId('area-key')).toHaveCount(0);
  await page.getByTestId('preset-sizing').click();
  await expect(page.getByTestId('area-key')).toContainText('Identity & Access');
});

test('a holding lane collapses to a rail that still takes drops, and stays collapsed after a reload', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  const lane = holding(page, { row: 'identity' });
  const before = Number(await lane.locator('.holding-count').textContent());
  await page.getByRole('button', { name: 'Collapse the No quarter lane' }).click();
  await expect(lane.locator('.card')).toHaveCount(0);
  await expect(lane.locator('.holding-count')).toHaveText(String(before));

  // Drop a card on the rail: it loses its quarter, and the count goes up.
  const scim = card(page, 'scim-2-0-group-push').first();
  await reveal(scim);
  await dragTo(page, scim, lane);
  await expect(lane.locator('.holding-count')).toHaveText(String(before + 1));

  await storageSettled(page);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(holding(page, { row: 'identity' }).locator('.card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the No quarter lane' }).click();
  await expect(holding(page, { row: 'identity' }).locator('.card[data-item="scim-2-0-group-push"]')).toBeVisible();
});
