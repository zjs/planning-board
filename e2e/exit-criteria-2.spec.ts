import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragTo, foldAll, openApp, pickAxes } from './app.ts';

// Sprint 2's exit criteria (docs/sprint-2.md) 1–6, end to end, in order,
// with the sample export in docs/samples/. If this passes, the walkthrough
// in docs/demos/sprint-2.md works. Criterion 7 (your own export) is manual.

const SAMPLE = new URL('../docs/samples/jira-export.csv', import.meta.url);
const panel = (page: Page) => page.getByTestId('properties-panel');
const section = (page: Page, name: string) =>
  panel(page)
    .locator('details.property')
    .filter({ has: page.locator('.property-name', { hasText: new RegExp(`^${name}$`) }) });
const titled = (scope: Page | Locator, title: string) => scope.locator('.card:not(.via-children)', { hasText: title });
const undo = (page: Page) => page.locator('.toolbar').getByRole('button', { name: /Undo/ }).click();

async function save(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  return readFile(await (await download).path(), 'utf8');
}

/**
 * A lane's key, found by its header text (imported values have random IDs). A folded band's lane
 * (ADR 0013) is keyed by the band, whose name is in the band header.
 */
async function laneKey(page: Page, kind: 'row' | 'column', label: string) {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const header = page.locator(`.${kind}-header`, { hasText: exact });
  if ((await header.count()) > 0) return (await header.getAttribute(`data-${kind}`))!;
  const band = page.locator(`.band-${kind === 'row' ? 'y' : 'x'}`).filter({ has: page.locator('.band-head span', { hasText: exact }) });
  return (await band.getAttribute('data-band'))!;
}

test('sprint 2 exit criteria', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);

  // 1. Save the plan to a file, reset the board, open the file, and get the identical plan back.
  const saved = await save(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Reset board' }).click();
  await page.getByTestId('open-plan-input').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await expect(page.getByTestId('notice')).toContainText('Opened “plan.json”');
  expect(await save(page)).toBe(saved);

  // 2. Import the sample Jira export: map columns, give components areas and versions quarters.
  await page.getByTestId('import-csv-input').setInputFiles(SAMPLE.pathname);
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog.getByLabel('Import Component/s as')).toHaveValue('components');
  await expect(dialog.getByTestId('import-summary')).toContainText('Imports 53 cards, including 9 groups with cards inside, and 12 dependencies');
  await dialog.getByRole('button', { name: 'Next: values →' }).click();
  for (const component of ['Admin Console', 'Notifications', 'Checkout']) {
    await dialog.getByLabel(`Area for ${component}`).fill('Customer Experience');
  }
  const quarters: string[] = [];
  for (const [i, version] of ['2027.1', '2027.2', '2027.3', '2027.4'].entries()) {
    const select = dialog.getByLabel(`Quarter for ${version}`);
    const label = (await select.locator('option').nth(i + 1).textContent())!;
    await select.selectOption({ label });
    quarters.push(label);
  }
  await dialog.getByRole('button', { name: 'Import 53 cards' }).click();
  await expect(page.locator('.band-y .band-head')).toHaveText([/Identity Platform/, /Customer Experience/, /Payments/, /Data Platform/]);
  // Epics are groups, story points are sizes, and cards carry their Jira keys.
  const epic = titled(page, 'Enterprise SSO self-service').first();
  await expect(epic.locator('.child-count')).toHaveText('4');
  await expect(epic.locator('.attr.key')).toHaveText('IDN-1');
  await expect(epic.locator('.attr[data-property="size"]')).toHaveText('XL');

  // 3. Pivot Team × Time, and drag a card to another team.
  await page.getByTestId('axis-y').selectOption({ label: 'Team' });
  await expect(page.locator('.row-header')).toHaveText(['Platform', 'Growth', 'Core Payments', 'Data Infra']);
  const q4 = await laneKey(page, 'column', quarters[3]!);
  const growth = await laneKey(page, 'row', 'Growth');
  const platform = await laneKey(page, 'row', 'Platform');
  const customRoles = titled(page.locator(`.cell[data-row="${growth}"][data-column="${q4}"]`), 'Custom roles');
  await expect(customRoles).toBeVisible();
  await dragTo(page, customRoles, page.locator(`.cell[data-row="${platform}"][data-column="${q4}"]`));
  await expect(titled(page.locator(`.cell[data-row="${platform}"][data-column="${q4}"]`), 'Custom roles')).toBeVisible();

  // 4. Rename a component, move it to another area, add a release, and delete one. Undo each.
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'Time', false);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const system = section(page, 'System');
  await system.locator('summary').click();
  await system.getByRole('button', { name: 'Rename Roles' }).click();
  await system.getByRole('textbox', { name: 'Rename Roles' }).fill('Roles & Permissions');
  await system.getByRole('textbox', { name: 'Rename Roles' }).press('Enter');
  await system.getByRole('combobox', { name: 'Move Roles & Permissions to' }).selectOption({ label: 'Customer Experience' });
  await expect(page.getByTestId('notice')).toContainText('Moved “Roles & Permissions” to Customer Experience');

  const time = section(page, 'Time');
  await time.locator('summary').click();
  await time.getByLabel(`Add release to ${quarters[0]!}`).fill('2027.1 hotfix');
  await time.getByLabel(`Add release to ${quarters[0]!}`).press('Enter');
  await expect(page.locator('.column-header', { hasText: '2027.1 hotfix' })).toHaveCount(1);
  await time.getByRole('button', { name: 'Delete 2027.1', exact: true }).click();
  await expect(page.getByTestId('notice')).toContainText(`cards moved to ${quarters[0]!}`);
  await expect(page.locator('.column-header:not(.lane-parent)')).toHaveText(['2027.1 hotfix', '2027.2', '2027.3', '2027.4']);

  for (let i = 0; i < 4; i++) await undo(page);
  await expect(page.locator('.column-header:not(.lane-parent)')).toHaveText(['2027.1', '2027.2', '2027.3', '2027.4']);
  await expect(system.locator('li[data-value] .value-label', { hasText: /^Roles$/ })).toHaveCount(1);
  await expect(system.locator('li[data-value] .value-label', { hasText: 'Roles & Permissions' })).toHaveCount(0);

  // 5. Create a custom property from scratch, and fill it in by dragging.
  const form = panel(page).getByTestId('new-property');
  await form.getByLabel('New property name').fill('Customer');
  await form.getByRole('button', { name: 'Add property' }).click();
  const customer = section(page, 'Customer');
  for (const value of ['Acme Bank', 'Globex']) {
    await customer.getByLabel('Add customer').fill(value);
    await customer.getByLabel('Add customer').press('Enter');
  }
  await customer.getByRole('button', { name: 'Show as rows' }).click();
  await expect(page.locator('.holding-row-header')).toHaveText('No customer');
  const acme = await laneKey(page, 'row', 'Acme Bank');
  const waiting = page.locator('.holding-cell:not([data-row])[data-column] .card:not(.via-children)').first();
  const column = (await waiting.locator('xpath=ancestor::*[contains(@class, "holding-cell")]').getAttribute('data-column'))!;
  const id = (await waiting.getAttribute('data-item'))!;
  await dragTo(page, waiting, page.locator(`.cell[data-row="${acme}"][data-column="${column}"]`));
  const placed = page.locator(`.cell[data-row="${acme}"][data-column="${column}"] .card[data-item="${id}"]`);
  await expect(placed).toBeVisible();

  // 6. Reload without losing anything.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.row-header')).toHaveText(['Acme Bank', 'Globex']);
  await expect(placed).toBeVisible();
  await expect(titled(page, 'Custom roles').first()).toBeVisible();
});
