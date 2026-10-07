import { expect, test, type Page } from '@playwright/test';
import { card, cell, foldAll, openApp, pickAxes } from './app.ts';

// Editing values (requirement 27, Q4): rename, move, add, reorder, delete,
// each one undo step.

const panel = (page: Page) => page.getByTestId('properties-panel');
const section = (page: Page, name: string) => panel(page).locator('details.property', { hasText: name });
const undo = (page: Page) => page.locator('.toolbar').getByRole('button', { name: /Undo/ }).click();

async function openSection(page: Page, name: string) {
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await section(page, name).locator('summary').click();
  return section(page, name);
}

test('rename a component and move it to another area; its cards come with it', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await expect(cell(page, 'billing', 'q2').locator('.card[data-item="vat-oss-reporting"]')).toBeVisible();
  const system = await openSection(page, 'System');

  await system.getByRole('button', { name: 'Rename Tax Engine' }).click();
  await system.getByRole('textbox', { name: 'Rename Tax Engine' }).fill('Invoicing');
  await system.getByRole('textbox', { name: 'Rename Tax Engine' }).press('Enter');
  await expect(system.getByRole('alert')).toHaveText('“Invoicing” is already here.');
  await system.getByRole('textbox', { name: 'Rename Tax Engine' }).fill('Tax & VAT');
  await system.getByRole('textbox', { name: 'Rename Tax Engine' }).press('Enter');
  await expect(card(page, 'vat-oss-reporting').locator('.attr[data-property="system"]')).toHaveText('Tax & VAT');

  await system.getByRole('combobox', { name: 'Move Tax & VAT to' }).selectOption({ label: 'Data Platform' });
  await expect(page.getByTestId('notice')).toContainText('Moved “Tax & VAT” to Data Platform');
  await expect(cell(page, 'data', 'q2').locator('.card[data-item="vat-oss-reporting"]')).toBeVisible();
  await expect(system.locator('li[data-value="data"] .value-label')).toContainText(['Tax & VAT']);

  await undo(page);
  await expect(cell(page, 'billing', 'q2').locator('.card[data-item="vat-oss-reporting"]')).toBeVisible();
  await undo(page);
  await expect(card(page, 'vat-oss-reporting').locator('.attr[data-property="system"]')).toHaveText('Tax Engine');
});

test('add and reorder a release, then delete one: its cards move to the quarter (Q4)', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'Time', false);
  const time = await openSection(page, 'Time');
  const q1 = time.locator('li[data-value="q1"]');

  await q1.getByLabel('Add release to Q1 2027').fill('27.2 hotfix');
  await q1.getByLabel('Add release to Q1 2027').press('Enter');
  await expect(page.locator('.column-header')).toContainText(['27.1', '27.2', '27.2 hotfix', '27.3']);
  await time.getByRole('button', { name: 'Move 27.2 hotfix up' }).click();
  await expect(q1.locator('.value-list .value-label')).toHaveText(['27.1', '27.2 hotfix', '27.2']);

  await time.getByRole('button', { name: 'Delete 27.2', exact: true }).click();
  await expect(page.getByTestId('notice')).toContainText('Deleted “27.2” · 2 cards moved to Q1 2027');
  await expect(page.locator('.column-header', { hasText: /^27\.2$/ })).toHaveCount(0);
  // Folded to quarters, they're still in Q1.
  await foldAll(page, 'Time', true);
  await expect(page.locator('.cell[data-column="q1"] .card').first()).toBeVisible();

  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await foldAll(page, 'Time', false);
  await expect(page.locator('.column-header', { hasText: /^27\.2$/ })).toHaveCount(1);
});

test('deleting an area asks first, because its components go too', async ({ page }) => {
  await openApp(page);
  const system = await openSection(page, 'System');
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete “Customer Experience” and the 3 components inside it? You can undo this.');
    void d.dismiss();
  });
  await system.getByRole('button', { name: 'Delete Customer Experience' }).click();
  await expect(system.locator('li[data-value="cx"]')).toHaveCount(1);
});

test('rename a level', async ({ page }) => {
  await openApp(page);
  const system = await openSection(page, 'System');
  await system.getByRole('button', { name: 'Rename level Component' }).click();
  await system.getByRole('textbox', { name: 'Rename level Component' }).fill('Service');
  await system.getByRole('textbox', { name: 'Rename level Component' }).press('Enter');
  // An unfolded area's own lane is named for the level below it.
  await foldAll(page, 'System', false);
  await expect(page.locator('.row-header.lane-parent .lane-note').first()).toHaveText('No service');
});
