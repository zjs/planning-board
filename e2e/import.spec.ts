import { expect, test, type Page } from '@playwright/test';
import { JIRA_EXPORT } from '../src/domain/__fixtures__/jira-export.ts';
import { openApp } from './app.ts';

// CSV import (requirement 28): map the columns, check the preview, import.

const dialog = (page: Page) => page.getByTestId('import-dialog');

async function chooseCsv(page: Page, name: string, text: string) {
  await page.getByTestId('import-csv-input').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('Jira columns are recognized, the preview shows the first rows, and the import replaces the board', async ({ page }) => {
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
  await expect(dialog(page).getByTestId('import-summary')).toContainText('Imports 5 cards, including 1 group with cards inside, and 1 dependency (kept, not drawn yet).');
  await expect(dialog(page).getByTestId('import-summary')).toContainText('1 row has no title and was skipped (row 6).');

  // Turn Status into a custom property, then import.
  await mapping.getByLabel('Import Status as').selectOption('property');
  await expect(preview.locator('thead')).toContainText('Status');
  await dialog(page).getByRole('button', { name: 'Import 5 cards' }).click();

  await expect(page.getByTestId('notice')).toContainText('Imported 5 cards from “jira.csv”');
  await expect(page.locator('.card:not(.via-children)')).toHaveCount(3); // the epic (a group) and two top-level cards
  await expect(page.locator('.card.group .attr.key')).toHaveText('PAY-1');
  await expect(page.getByTestId('axis-y').locator('option', { hasText: 'Status' })).toHaveCount(1);

  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
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
