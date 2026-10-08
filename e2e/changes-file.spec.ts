import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { APP_URL, card } from './app.ts';

// Changes by file (sprint 12, slice 4; requirement 37, ADR 0022): a shared plan travels as encrypted files, with no
// relay at all. The link, with the key, goes once by another channel.

async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

/** Send changes from the File menu, and return the file's bytes and name. */
async function sendChanges(page: Page): Promise<{ name: string; buffer: Buffer }> {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Send changes' }).click();
  const file = await download;
  return { name: file.suggestedFilename(), buffer: readFileSync(await file.path()) };
}

async function merge(page: Page, file: { name: string; buffer: Buffer }) {
  await page.getByTestId('merge-changes-input').setInputFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer });
}

const id = 'sso-enforcement-per-workspace';

test('share by file: send changes both ways with no relay, and a file without its link can’t be read', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  await ada.goto(APP_URL);
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-by-file-option').locator('summary').click();
  await ada.getByTestId('share-by-file').click();
  const link = await ada.getByTestId('edit-link').inputValue();
  expect(link).toContain('file=1');
  await ada.getByRole('button', { name: 'Done' }).click();
  await expect(ada.getByTestId('connection-state')).toHaveText('Shared by file');
  const first = await sendChanges(ada);
  expect(first.name).toMatch(/-changes-\d{4}-\d{2}-\d{2}\.pbchanges$/);
  expect(first.buffer.toString('latin1')).not.toContain('SSO enforcement');

  // A file on its own, without the link, opens nothing.
  const eve = await person(browser, 'Eve');
  await eve.goto(APP_URL);
  await merge(eve, first);
  await expect(eve.getByTestId('plan-notice')).toContainText('is for a plan this browser doesn’t have');

  // Bo opens the link: an empty plan, waiting for a file. Merging it shows Ada's plan.
  const bo = await person(browser, 'Bo');
  await bo.goto(APP_URL + new URL(link).hash);
  await expect(bo.getByTestId('waiting-for-changes')).toBeVisible();
  await merge(bo, first);
  await expect(bo.getByTestId('plan-notice')).toContainText(/Merged: \d+ cards/);
  await expect(card(bo, id).first()).toBeVisible();
  await expect(bo.getByTestId('plan-name')).toHaveText(await ada.getByTestId('plan-name').innerText());

  // Bo renames a card and sends it back; Ada merges, and then merging the same file again changes nothing.
  await card(bo, id).first().dblclick();
  await bo.keyboard.press('ControlOrMeta+a');
  await bo.keyboard.type('SSO enforcement, per workspace');
  await bo.keyboard.press('Enter');
  const back = await sendChanges(bo);
  await merge(ada, back);
  await expect(ada.getByTestId('plan-notice')).toContainText('Merged: 1 card changed.');
  await expect(card(ada, id).first()).toContainText('SSO enforcement, per workspace');
  await merge(ada, back);
  await expect(ada.getByTestId('plan-notice')).toContainText('Merged: nothing new in that file.');
});
