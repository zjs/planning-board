import { expect, test, type Page } from '@playwright/test';
import { JIRA_EXPORT } from '../src/domain/__fixtures__/jira-export.ts';
import { foldAll, openApp, switchPlan } from './app.ts';

// CSV import (requirement 28): map the columns, check the preview, import.

const dialog = (page: Page) => page.getByTestId('import-dialog');

async function chooseCsv(page: Page, name: string, text: string) {
  await page.getByTestId('import-csv-input').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('Jira columns are recognized, the preview shows the first rows, and the import is a plan of its own', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Import CSV (Jira export)…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await chooseCsv(page, 'jira.csv', JIRA_EXPORT);

  const mapping = dialog(page).getByTestId('column-mapping');
  await expect(mapping.getByLabel('Import Summary as')).toHaveValue('title');
  await expect(mapping.getByLabel('Import Component/s as')).toHaveValue('components');
  await expect(mapping.locator('tr[data-column="Component/s"] .column-name')).toContainText('×2');
  await expect(mapping.getByLabel('Import Status as')).toHaveValue('ignore');
  await expect(mapping.getByLabel('Import Custom field (Team) as')).toHaveValue('property');

  const preview = dialog(page).getByTestId('import-preview');
  await expect(preview.locator('tbody tr')).toHaveCount(5);
  await expect(preview.locator('tbody tr').first()).toContainText('Self-serve SSO setup');
  await expect(preview.locator('tbody tr').first()).toContainText('XL (13)');
  await expect(dialog(page).getByTestId('import-summary')).toContainText('Imports 5 cards, including 1 group with cards inside, and 1 dependency.');
  await expect(dialog(page).getByTestId('import-summary')).toContainText('1 row has no title and was skipped (row 6).');

  // Turn Status into a custom property, then import.
  await mapping.getByLabel('Import Status as').selectOption('property');
  await expect(preview.locator('thead')).toContainText('Status');
  await dialog(page).getByRole('button', { name: 'Next: values →' }).click();
  await dialog(page).getByRole('button', { name: 'Import 5 cards' }).click();

  await expect(page.getByTestId('notice')).toContainText('Imported 5 cards from “jira.csv”');
  await expect(page.getByTestId('axis-x')).toHaveValue('time');
  await expect(page.getByTestId('axis-y')).toHaveValue('system');
  await expect(page.locator('.card:not(.via-children)')).toHaveCount(3); // the epic (a group) and two top-level cards
  await expect(page.locator('.card.group .attr.key')).toHaveText('PAY-1');
  await expect(page.getByTestId('axis-y').locator('option', { hasText: 'Status' })).toHaveCount(1);

  await expect(page.getByTestId('plan-name')).toHaveText('jira');
  await switchPlan(page, 'Sample plan');
  await expect(page.locator('.card[data-item="tenant-data-deletion-gdpr"]').first()).toBeVisible();
});

test('without a title column there is nothing to import', async ({ page }) => {
  await openApp(page);
  await chooseCsv(page, 'odd.csv', 'Name,Owner\nThing,Sam');
  await expect(dialog(page).getByTestId('import-summary')).toContainText('Choose which column holds the card titles');
  await expect(dialog(page).getByRole('button', { name: /^Import/ })).toBeDisabled();
  await dialog(page).getByLabel('Import Name as').selectOption('title');
  await expect(dialog(page).getByRole('button', { name: 'Import 1 card' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('an empty CSV is explained', async ({ page }) => {
  await openApp(page);
  await chooseCsv(page, 'empty.csv', 'Summary,Issue key\n');
  await expect(page.getByTestId('file-problem')).toContainText('This file has column headers but no rows to import.');
});

test('the value table puts components in areas, versions in quarters, and points in sizes (Q27, Q28)', async ({ page }) => {
  await openApp(page);
  await chooseCsv(page, 'jira.csv', JIRA_EXPORT);
  await dialog(page).getByRole('button', { name: 'Next: values →' }).click();
  const values = dialog(page).getByTestId('value-table');

  // Defaults: the project's name as the area, no quarters, the usual buckets.
  await expect(values.getByLabel('Area for SSO')).toHaveValue('Payments');
  await expect(values.getByLabel('Quarter for 2027.1')).toHaveValue('');
  await expect(values.getByLabel('Size for 13 points')).toHaveValue('xl');

  await values.getByLabel('Area for SSO').fill('Identity');
  await values.getByLabel('Area for Admin Console').fill('Customer Experience');
  const quarter = await values.getByLabel('Quarter for 2027.1').locator('option').nth(2).textContent();
  await values.getByLabel('Quarter for 2027.1').selectOption({ label: quarter! });
  await values.getByLabel('Size for 13 points').selectOption('l');
  await expect(dialog(page).getByTestId('import-summary')).toContainText('One version wasn’t given a quarter');

  // Going back to the columns keeps the choices.
  await dialog(page).getByRole('button', { name: '← Columns' }).click();
  await dialog(page).getByRole('button', { name: 'Next: values →' }).click();
  await expect(values.getByLabel('Area for SSO')).toHaveValue('Identity');
  await dialog(page).getByRole('button', { name: 'Import 5 cards' }).click();

  await expect(page.locator('.band-y .band-head')).toHaveText([/Identity/, /Customer Experience/, /Payments/]);
  const epic = page.locator('.card.group:not(.via-children)');
  await expect(epic.locator('.attr[data-property="size"]')).toHaveText('L');
  await expect(epic.locator('.attr[data-property="time"]')).toHaveText('2027.1');
  await expect(epic.locator('.attr[data-property="time"]')).toHaveAttribute('title', `Time: ${quarter!} › 2027.1`);

  await foldAll(page, 'Time', false);
  await expect(page.locator('.column-header:not(.lane-parent)')).toHaveText(['2027.1']);
});

test('a CSV with only titles imports straight from the columns step', async ({ page }) => {
  await openApp(page);
  await chooseCsv(page, 'titles.csv', 'Summary\nOne\nTwo');
  await dialog(page).getByRole('button', { name: 'Import 2 cards' }).click();
  await expect(page.locator('.card')).toHaveCount(2);
});
