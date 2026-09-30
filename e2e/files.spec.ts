import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { card, openApp } from './app.ts';

// Plan files (requirement 29, ADR 0005): save, open, and bad files.

async function save(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^planning-board-\d{4}-\d{2}-\d{2}\.json$/);
  return readFile(await file.path(), 'utf8');
}

async function open(page: Page, name: string, text: string) {
  await page.getByTestId('open-plan-input').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

const tiny = (extra: object = {}) =>
  JSON.stringify({
    format: 'planning-board',
    version: 1,
    properties: [{ id: 'size', name: 'Size', levels: ['Size'], values: [{ id: 'm', label: 'M' }] }],
    items: [{ id: 'imported', title: 'Imported card', externalKey: 'PAY-42', values: { size: 'm' } }],
    ...extra,
  });

test('save, reset, and open give back the identical plan', async ({ page }) => {
  await openApp(page);
  const saved = await save(page);
  expect(JSON.parse(saved)).toMatchObject({ format: 'planning-board', version: 1 });

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Reset board' }).click();
  await expect(page.locator('.empty-state')).toBeVisible();

  // The empty board has its own Open button; the File menu's opens the same picker.
  await open(page, 'my-plan.json', saved);
  await expect(page.getByTestId('notice')).toContainText('Opened “my-plan.json”');
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
  expect(await save(page)).toBe(saved);
});

test('opening a file replaces the board in one undo step, and shows Jira keys', async ({ page }) => {
  await openApp(page);
  page.once('dialog', (d) => void d.accept());
  await open(page, 'tiny.json', tiny());
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(card(page, 'imported').locator('.attr.key')).toHaveText('PAY-42');

  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
});

test('declining the replace prompt leaves the board alone', async ({ page }) => {
  await openApp(page);
  page.once('dialog', (d) => void d.dismiss());
  await open(page, 'tiny.json', tiny());
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
  await expect(card(page, 'imported')).toHaveCount(0);
});

test('a bad file is explained, and the board is unchanged', async ({ page }) => {
  await openApp(page);
  await open(page, 'broken.json', tiny({ dependencies: [['imported', 'ghost']] }));
  const dialog = page.getByTestId('file-problem');
  await expect(dialog).toContainText("Couldn't open “broken.json”");
  await expect(dialog).toContainText('This plan file has a problem, so it wasn\'t opened. The board is unchanged.');
  await dialog.getByText('Details, for fixing the file by hand').click();
  await expect(dialog.locator('li')).toHaveText(['dependencies[0]: unknown item in ["imported", "ghost"]']);
  // Board shortcuts don't reach through the dialog.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);

  await open(page, 'notes.txt', 'just some notes');
  await expect(page.getByTestId('file-problem')).toContainText("This isn't a plan file: its text isn't valid JSON.");
});
