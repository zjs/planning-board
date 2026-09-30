import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, holding, openApp, pickAxes } from './app.ts';

// Custom properties (requirements 1 and 26): made in the Properties panel,
// shown as an axis straight away, and filled in by dragging.

const panel = (page: Page) => page.getByTestId('properties-panel');
const section = (page: Page, name: string) => panel(page).locator('details.property', { hasText: name });

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(panel(page)).toBeVisible();
}

/** The row key of a lane, found by its label (custom values have random IDs). */
async function rowKey(page: Page, label: string) {
  return (await page.locator('.row-header', { hasText: label }).getAttribute('data-row'))!;
}

async function addTeam(page: Page, values: string[]) {
  const form = panel(page).getByTestId('new-property');
  await form.getByLabel('New property name').fill('Team');
  await form.getByRole('button', { name: 'Add property' }).click();
  const team = section(page, 'Team');
  await expect(team).toHaveAttribute('open', '');
  for (const value of values) {
    await team.getByLabel('Add team').fill(value);
    await team.getByLabel('Add team').press('Enter');
  }
  await expect(team.locator('.value-label')).toHaveText(values);
}

test('a new property is an axis straight away, and dragging fills it in', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await openPanel(page);
  await addTeam(page, ['Platform', 'Growth']);
  await expect(page.getByTestId('axis-y').locator('option', { hasText: 'Team' })).toHaveCount(1);

  await section(page, 'Team').getByRole('button', { name: 'Show as rows' }).click();
  await expect(page.getByTestId('axis-y')).toHaveValue(/^p[0-9a-f]+$/);
  await expect(page.locator('.row-header')).toHaveText(['Platform', 'Growth']);
  await expect(page.locator('.holding-row-header')).toHaveText('No team');

  // Every card starts in "No team"; drag one to Platform, Q2.
  const moving = holding(page, { column: 'q2' }).locator('.card').first();
  const id = (await moving.getAttribute('data-item'))!;
  const platform = await rowKey(page, 'Platform');
  await dragTo(page, moving, cell(page, platform, 'q2'));
  await expect(card(cell(page, platform, 'q2'), id)).toBeVisible();

  // Pivot away, and the card shows its team as a badge.
  await pickAxes(page, 'time', 'system');
  await expect(card(page, id).first().locator('.attr', { hasText: 'Platform' })).toBeVisible();
});

test('rename and delete a property; undo brings it back', async ({ page }) => {
  await openApp(page);
  await openPanel(page);
  await addTeam(page, ['Platform']);
  const team = section(page, 'Team');

  await team.getByRole('button', { name: 'Rename Team' }).click();
  await team.getByRole('textbox', { name: 'Rename Team' }).fill('System');
  await team.getByRole('textbox', { name: 'Rename Team' }).press('Enter');
  await expect(team.getByRole('alert')).toHaveText('There\'s already a property called “System”.');
  await team.getByRole('textbox', { name: 'Rename Team' }).fill('Squad');
  await team.getByRole('textbox', { name: 'Rename Team' }).press('Enter');
  const squad = section(page, 'Squad');
  await expect(squad.locator('.property-name')).toHaveText('Squad');

  await squad.getByRole('button', { name: 'Show as rows' }).click();
  await expect(page.locator('.row-header')).toHaveText(['Platform']);
  page.once('dialog', (d) => void d.accept());
  await squad.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('notice')).toContainText('Deleted property “Squad”');
  // The rows fall back to a property that still exists.
  await expect(page.getByTestId('axis-y')).toHaveValue('system');

  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.row-header')).toHaveText(['Platform']);
});

test('built-in properties can be renamed but not deleted', async ({ page }) => {
  await openApp(page);
  await openPanel(page);
  const system = section(page, 'System');
  await system.locator('summary').click();
  await expect(system.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(system.locator('.property-kind')).toHaveText('Built-in · 19 values');
  // Components are added under their area.
  const identity = system.locator('li[data-value="identity"]');
  await identity.getByLabel('Add component to Identity & Access').fill('Passkeys');
  await identity.getByLabel('Add component to Identity & Access').press('Enter');
  await expect(identity.locator('.value-label')).toContainText(['Passkeys']);
  await pickAxes(page, 'time', 'system:1');
  await expect(page.locator('.row-header', { hasText: 'Passkeys' })).toBeVisible();
});
