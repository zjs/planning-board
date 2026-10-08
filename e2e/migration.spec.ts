import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { APP_URL, card, storageSettled } from './app.ts';

// Schema 2 (ADR 0016): a browser that used a build from before sprint 10 has
// its board in the version 1 database. The first time this build opens, it
// copies that board into schema 2, with nothing lost, and leaves the old
// database as it was.

const sprint8Board = [...readFileSync(new URL('../src/domain/__fixtures__/compat/sprint-8.board.yjs', import.meta.url))];

test('a board saved by an earlier build opens after the upgrade, and stays after a reload', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByTestId('board').or(page.locator('.empty-state')).waitFor();
  // Put a sprint 8 board where sprint 8 kept it, the way y-indexeddb stores updates, then forget the new database.
  await page.evaluate(async (bytes) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('planning-board:v1:default');
      open.onupgradeneeded = () => {
        open.result.createObjectStore('updates', { autoIncrement: true });
        open.result.createObjectStore('custom');
      };
      open.onerror = () => reject(new Error(String(open.error)));
      open.onsuccess = () => {
        const tx = open.result.transaction('updates', 'readwrite');
        tx.objectStore('updates').add(new Uint8Array(bytes));
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
    });
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase('planning-board:v2:default');
      del.onsuccess = del.onerror = del.onblocked = () => resolve();
    });
  }, sprint8Board);
  await page.reload();

  // The sample plan sprint 8 kept, with a group and its stories.
  await expect(card(page, 'passwordless-login').first()).toBeVisible();
  const count = await page.locator('.card[data-item]').count();
  expect(count).toBeGreaterThan(20);

  // Edits go to the new database, and survive a reload.
  await card(page, 'passwordless-login').first().dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Passwordless login (migrated)');
  await page.keyboard.press('Enter');
  await storageSettled(page);
  await page.reload();
  await expect(card(page, 'passwordless-login').first().locator('.card-title')).toHaveText('Passwordless login (migrated)');
});
