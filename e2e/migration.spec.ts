import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { asEarlierBrowser, card, planList, storageSettled } from './app.ts';

// Schema 2 (ADR 0016): a browser that used a build from before sprint 10 has
// its board in the version 1 database. The first time this build opens, it
// copies that board into schema 2, with nothing lost, and leaves the old
// database as it was.

const sprint8Board = [...readFileSync(new URL('../src/domain/__fixtures__/compat/sprint-8.board.yjs', import.meta.url))];

test('a board saved by an earlier build opens after the upgrade, and stays after a reload', async ({ page }) => {
  await asEarlierBrowser(page, sprint8Board);

  // The sample plan sprint 8 kept, with a group and its stories.
  await expect(card(page, 'passwordless-login').first()).toBeVisible();
  const count = await page.locator('.card[data-item]').count();
  expect(count).toBeGreaterThan(20);
  // It's the browser's first plan (ADR 0021).
  await expect(page.getByTestId('plan-name')).toHaveText('My plan');
  expect(await planList(page)).toEqual(['My plan']);

  // Edits go to the new database, and survive a reload.
  await card(page, 'passwordless-login').first().dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Passwordless login (migrated)');
  await page.keyboard.press('Enter');
  await storageSettled(page);
  await page.reload();
  await expect(card(page, 'passwordless-login').first().locator('.card-title')).toHaveText('Passwordless login (migrated)');
});
