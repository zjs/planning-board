import { expect, test, type Locator, type Page } from '@playwright/test';
import { card, cell, openApp, reveal } from './app.ts';

// Sprint 7, slice 3: the dragged card says what the drop gives it, and how to add instead (Q54).

/** Pick a card up and rest it over `to`, leaving the mouse down. */
async function hover(page: Page, from: Locator, to: Locator) {
  await reveal(from);
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 22, { steps: 3 });
  await reveal(to);
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height - 6, 40), { steps: 6 });
}

const where = (page: Page) => page.getByTestId('drop-where');

test('a dragged card names the cell it would land in, and Alt adds instead of moving', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  // OIDC provider support is in Identity, Q2. Over Billing, Q3, the drop would swap Identity for Billing.
  await hover(page, card(page, 'oidc-provider-support'), cell(page, 'billing', 'q3'));
  await expect(where(page)).toContainText('→ Q3 2027 · Billing');
  await expect(where(page)).toContainText('Alt adds instead');
  // Holding Alt turns the drop into an add: the hint gives way to "+ add".
  await page.keyboard.down('Alt');
  const b = (await cell(page, 'billing', 'q3').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2 + 4, b.y + Math.min(b.height - 6, 40));
  await expect(page.locator('.drag-ghost .add-badge')).toBeVisible();
  await expect(where(page)).not.toContainText('adds instead');
  await page.keyboard.up('Alt');
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('over a holding lane, the card says what it would lose', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  await hover(page, card(page, 'oidc-provider-support'), page.locator('.holding-cell[data-row="identity"]:not([data-column])'));
  await expect(where(page)).toContainText('→ No quarter · Identity');
  // Staying in Identity swaps nothing, so there's no hint.
  await expect(where(page)).not.toContainText('adds instead');
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('groups expand and collapse; only bands fold', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Collapse' })).toBeVisible();
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Fold', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('view-bar').getByRole('button', { name: 'Fold all' }).first()).toBeVisible();
});
