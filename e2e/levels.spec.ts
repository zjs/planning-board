import { expect, test, type Page } from '@playwright/test';
import { card, openApp, expandGroup, pickAxes, reveal } from './app.ts';

// Card levels (Q32): a built-in Level property, shown as a badge and a heavier border, with a
// marker for a child at or above its group's level, and Jira's Issue Type on import.

const SAMPLE = new URL('../docs/samples/jira-export.csv', import.meta.url);
const inspector = (page: Page) => page.getByTestId('inspector');

test('the sample plan shows levels: badges, and heavier borders for initiatives and epics', async ({ page }) => {
  await openApp(page);
  const initiative = card(page, 'eu-data-residency').first();
  await expect(initiative.locator('.attr[data-property="level"]')).toHaveText('Initiative');
  await expect(initiative).toHaveAttribute('data-weight', '2');
  const epic = card(page, 'tenant-data-deletion-gdpr').first();
  await expect(epic.locator('.attr[data-property="level"]')).toHaveText('Epic');
  await expect(epic).toHaveAttribute('data-weight', '1');
  // Most cards have no level yet: no badge, and the usual border.
  const plain = card(page, 'custom-roles');
  await expect(plain.locator('.attr[data-property="level"]')).toHaveCount(0);
  await expect(plain).not.toHaveAttribute('data-weight', /.*/);

  // Level is an axis like any other.
  await pickAxes(page, 'sequence', 'level');
  await expect(page.locator('.row-header')).toHaveText(['Initiative', 'Epic', 'Story']);
});

test('a child at or above its group’s level is flagged, and the group counts it', async ({ page }) => {
  await openApp(page);
  const group = card(page, 'passwordless-login').first();
  const marker = group.locator('.mismatch');
  const before = Number((await marker.textContent())!.replace(/\D/g, ''));

  await expandGroup(group);
  const child = card(page, 'webauthn-enrollment').first();
  await reveal(child);
  await child.locator('.card-title').click();
  await page.keyboard.press('i');
  await inspector(page).getByLabel('Level', { exact: true }).selectOption('epic');
  await expect(child.locator('.mismatch')).toHaveAttribute('title', /Epic, at or above its group's Epic/);

  // Collapsed, the group counts it.
  await page.keyboard.press('Shift+E');
  await expect(marker).toHaveText(`⚠ ${before + 1}`);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(marker).toHaveText(`⚠ ${before}`);
});

test('import reads Jira’s Issue Type as the level', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('import-csv-input').setInputFiles(SAMPLE.pathname);
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog.getByLabel('Import Issue Type as')).toHaveValue('issueType');
  await dialog.getByRole('button', { name: 'Next: values →' }).click();
  await expect(dialog.getByLabel('Level for Epic')).toHaveValue('epic');
  await expect(dialog.getByLabel('Level for Story')).toHaveValue('story');
  await dialog.getByRole('button', { name: /^Import \d+ cards$/ }).click();
  const epic = page.locator('.card:not(.via-children)', { hasText: 'Enterprise SSO self-service' }).first();
  await expect(epic.locator('.attr[data-property="level"]')).toHaveText('Epic');
  await expect(epic).toHaveAttribute('data-weight', '1');
});

test('a plan file saved before levels existed opens with the Level property', async ({ page }) => {
  await openApp(page);
  const old = {
    format: 'planning-board',
    version: 1,
    properties: [{ id: 'size', name: 'Size', levels: ['Size'], values: [{ id: 'm', label: 'M' }] }],
    items: [{ id: 'a', title: 'An old card', values: { size: 'm' } }],
  };
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('open-plan-input').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await expect(card(page, 'a')).toBeVisible();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.getByTestId('properties-panel').locator('.property-name', { hasText: /^Level$/ })).toHaveCount(1);
});
