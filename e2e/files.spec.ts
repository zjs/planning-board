import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { card, openApp, planList, switchPlan } from './app.ts';

// Plan files (requirement 29, ADR 0005): save, open, and bad files.

async function save(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  const file = await download;
  // Named for the plan (ADR 0021).
  expect(file.suggestedFilename()).toMatch(/^sample-plan-\d{4}-\d{2}-\d{2}\.json$/);
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

test('save and open give back the identical plan, with its name, as a plan of its own', async ({ page }) => {
  await openApp(page);
  const saved = await save(page);
  expect(JSON.parse(saved)).toMatchObject({ format: 'planning-board', version: 1, name: 'Sample plan' });

  await open(page, 'sample-plan-2026-10-08.json', saved);
  await expect(page.getByTestId('notice')).toContainText('Opened “sample-plan-2026-10-08.json”');
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
  // A new plan named as the file says, beside the one it was saved from (Q66).
  await expect(page.getByTestId('plan-name')).toHaveText('Sample plan');
  expect(await planList(page)).toEqual(['Sample plan', 'Sample plan']);
  expect(await save(page)).toBe(saved);
});

test("opening a file never touches the board you're on, and shows Jira keys", async ({ page }) => {
  await openApp(page);
  await open(page, 'tiny.json', tiny());
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(card(page, 'imported').locator('.attr.key')).toHaveText('PAY-42');
  // A file without a name is named for the file.
  await expect(page.getByTestId('plan-name')).toHaveText('tiny');

  await switchPlan(page, 'Sample plan');
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
});

test('a bad file is explained, and no plan is made', async ({ page }) => {
  await openApp(page);
  await open(page, 'broken.json', tiny({ dependencies: [['imported', 'ghost']] }));
  const dialog = page.getByTestId('file-problem');
  await expect(dialog).toContainText("Couldn't open “broken.json”");
  await expect(dialog).toContainText('This plan file has a problem, so it wasn\'t opened.');
  await dialog.getByText('Details, for fixing the file by hand').click();
  await expect(dialog.locator('li')).toHaveText(['dependencies[0]: unknown item in ["imported", "ghost"]']);
  // Board shortcuts don't reach through the dialog.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);

  expect(await planList(page)).toEqual(['Sample plan']);

  await open(page, 'notes.txt', 'just some notes');
  await expect(page.getByTestId('file-problem')).toContainText("This isn't a plan file: its text isn't valid JSON.");
});
