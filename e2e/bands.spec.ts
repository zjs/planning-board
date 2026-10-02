import { expect, test, type Page } from '@playwright/test';
import { APP_URL, card, dragTo, foldAll, openApp, pickAxes, reveal } from './app.ts';

// Nested axes (Q34, ADR 0012) folded and unfolded (Q43, ADR 0013): one axis choice per property,
// parent bands folded by default, a lane per parent, and folding instead of zoom.

const rowOf = (page: Page, id: string) =>
  card(page, id).first().locator('xpath=ancestor::*[contains(@class, "cell")][1]');

test('unfolded System: area bands, a "no component" lane per area, and the edge lane for no system at all', async ({ page }) => {
  await openApp(page);
  await foldAll(page, 'System', false);
  await expect(page.locator('.band-y .band-head')).toHaveText([/▾\s*Identity & Access/, /▾\s*Billing/, /▾\s*Data Platform/, /▾\s*Customer Experience/]);
  await expect(page.locator('.row-header.lane-parent')).toHaveCount(4);
  await expect(page.locator('.row-header.lane-parent').first()).toHaveText('No component');
  // An area-only card sits in its area's own lane, not at the board's edge.
  await expect(rowOf(page, 'contractor-and-guest-identities')).toHaveAttribute('data-row', 'identity');
  await expect(page.locator('.holding-bottom .card[data-item="contractor-and-guest-identities"]')).toHaveCount(0);
  await expect(page.locator('.holding-row-header')).toHaveText('No area');
  await expect(page.locator('.holding-bottom .card[data-item="accessibility-audit-fixes"]').first()).toBeAttached();

  // Dropping a card on Identity's own lane gives it plain Identity (Q22's rule); undo puts RBAC back.
  const column = (await rowOf(page, 'custom-roles').getAttribute('data-column'))!;
  await dragTo(page, card(page, 'custom-roles'), page.locator(`.cell[data-row="identity"][data-column="${column}"]`));
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity/rbac');
});

test('a folded band is one lane; moving a card within it keeps its component; folding is remembered', async ({ page }) => {
  await openApp(page);
  // Folded by default, so a fresh view looks like the area view did.
  await expect(page.locator('.row-header.lane-collapsed').first()).toHaveText('4 components ▸');
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
  // The component it's folded into shows as a badge.
  await expect(card(page, 'custom-roles').locator('.attr[data-property="system"]')).toHaveText('Roles & Permissions');

  const target = page.locator('.cell[data-row="identity"]').nth(3);
  await dragTo(page, card(page, 'custom-roles'), target);
  await expect(card(page, 'custom-roles').locator('.attr[data-property="system"]')).toHaveText('Roles & Permissions');

  // Clicking the folded lane's header unfolds it: a bigger target than ▸.
  await page.locator('.row-header.lane-collapsed').first().getByRole('button').click();
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity/rbac');
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity/rbac');
  await page.getByRole('button', { name: 'Fold Identity & Access' }).click();
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
});

test('Fold all and Unfold all, and there is no zoom: a band header folds rather than zooms', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('axis-y').locator('option')).not.toContainText(['System (component)']);
  await foldAll(page, 'System', false);
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(0);
  const billing = page.locator('.band-y[data-band="billing"]');
  await reveal(billing);
  await billing.getByRole('button', { name: 'Fold Billing' }).click();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(1);
  await expect(page.locator('.band-y')).toHaveCount(4);
  await expect(page.getByTestId('zoom-bar')).toHaveCount(0);
  await foldAll(page, 'System', true);
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(4);
  // ⌘↓ does nothing now.
  await card(page, 'eu-data-residency').locator('.card-title').click();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await expect(card(page, 'custom-roles')).toHaveCount(1);
});

test('Time: quarter bands, a "no release" column per quarter, and folding a quarter', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'Time', false);
  await expect(page.locator('.band-x .band-head')).toHaveText([/Q1 2027/, /Q2 2027/, /Q3 2027/, /Q4 2027/]);
  await expect(page.locator('.column-header.lane-parent')).toHaveText(['No release', 'No release', 'No release', 'No release']);
  // A quarter-only card is in its quarter's own column.
  const quarterOnly = card(page, 'contractor-and-guest-identities').first();
  await reveal(quarterOnly);
  await expect(quarterOnly.locator('xpath=ancestor::*[contains(@class, "cell")][1]')).toHaveAttribute('data-column', 'q3');

  await page.getByRole('button', { name: 'Fold Q1 2027' }).click();
  await expect(page.locator('.column-header.lane-collapsed')).toHaveText('2 releases ▸');
});

test('a view saved by an earlier build carries over: "System (component)" opens unfolded', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    localStorage.removeItem('planning-board:folding');
    localStorage.setItem('planning-board:view', JSON.stringify({ x: 'sequence', y: 'system:1', yWithin: 'billing' }));
    localStorage.setItem('planning-board:collapsed', JSON.stringify({ system: ['data'] }));
    localStorage.setItem('planning-board:zoom', JSON.stringify(['eu-data-residency']));
  });
  await page.goto(APP_URL);
  await page.getByTestId('board').waitFor();
  await expect(page.getByTestId('axis-y')).toHaveValue('system');
  // Unfolded, except the band it had collapsed; the lane zoom and group zoom are dropped.
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(1);
  await expect(page.locator('.band-y.collapsed')).toHaveAttribute('data-band', 'data');
  await expect(card(page, 'eu-data-residency')).toHaveCount(1);
});
