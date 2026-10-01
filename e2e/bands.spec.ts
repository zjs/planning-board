import { expect, test, type Page } from '@playwright/test';
import { card, dragTo, openApp, pickAxes, reveal } from './app.ts';

// Nested axes (Q34, ADR 0012): parent bands, a lane per parent, collapsing, and zoom.

const rowOf = (page: Page, id: string) =>
  card(page, id).first().locator('xpath=ancestor::*[contains(@class, "cell")][1]');

test('components as rows: area bands, a "no component" lane per area, and the edge lane for no system at all', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'sequence', 'system:1');
  await expect(page.locator('.band-y .band-head')).toHaveText(['▾Identity & Access', '▾Billing', '▾Data Platform', '▾Customer Experience']);
  await expect(page.locator('.row-header.lane-parent')).toHaveCount(4);
  // An area-only card sits in its area's own lane, not at the board's edge.
  await expect(rowOf(page, 'contractor-and-guest-identities')).toHaveAttribute('data-row', 'identity');
  await expect(page.locator('.holding-bottom .card[data-item="contractor-and-guest-identities"]')).toHaveCount(0);
  await expect(page.locator('.holding-bottom .card[data-item="accessibility-audit-fixes"]').first()).toBeAttached();

  // Dropping a card on Identity's own lane gives it plain Identity (Q22's rule); undo puts RBAC back.
  const column = (await rowOf(page, 'custom-roles').getAttribute('data-column'))!;
  await dragTo(page, card(page, 'custom-roles'), page.locator(`.cell[data-row="identity"][data-column="${column}"]`));
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity/rbac');
});

test('a collapsed band is one lane; moving a card within it keeps its component; it stays collapsed after a reload', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'sequence', 'system:1');
  await page.getByRole('button', { name: 'Collapse Identity & Access' }).click();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveText('4 components');
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
  // The component it's hidden in shows as a badge.
  await expect(card(page, 'custom-roles').locator('.attr[data-property="system"]')).toHaveText('Roles & Permissions');

  const target = page.locator('.cell[data-row="identity"]').nth(3);
  await dragTo(page, card(page, 'custom-roles'), target);
  await expect(card(page, 'custom-roles').locator('.attr[data-property="system"]')).toHaveText('Roles & Permissions');

  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveText('4 components');
  await page.getByRole('button', { name: 'Expand Identity & Access' }).click();
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity/rbac');
});

test('clicking a band zooms into it, and zooming out brings the bands back (requirement 7)', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'sequence', 'system:1');
  const billing = page.locator('.band-y[data-band="billing"]');
  await reveal(billing);
  await billing.locator('.lane-zoom').click();
  await expect(page.locator('.row-header')).toHaveText(['Invoicing', 'Payment Gateway', 'Tax Engine', 'Subscriptions']);
  await expect(page.locator('.band')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.band-y')).toHaveCount(4);
});

test('releases as columns: quarter bands, a "no release" column per quarter, and collapsing a quarter', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time:1', 'system');
  await expect(page.locator('.band-x .band-head')).toHaveText(['▾Q1 2027', '▾Q2 2027', '▾Q3 2027', '▾Q4 2027']);
  await expect(page.locator('.column-header.lane-parent')).toHaveText(['No release', 'No release', 'No release', 'No release']);
  // A quarter-only card is in its quarter's own column.
  const quarterOnly = card(page, 'contractor-and-guest-identities').first();
  await reveal(quarterOnly);
  await expect(quarterOnly.locator('xpath=ancestor::*[contains(@class, "cell")][1]')).toHaveAttribute('data-column', 'q3');

  await page.getByRole('button', { name: 'Collapse Q1 2027' }).click();
  await expect(page.locator('.column-header.lane-collapsed')).toHaveText('2 releases');
});
