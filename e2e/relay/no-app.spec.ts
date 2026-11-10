import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_URL, card } from '../app.ts';

// A relay that serves no app (Q80), used from the app's HTML file opened from disk, as a release download is
// (sprint 14's exit criterion 4). Links through it never name the relay as the app, and a second person opens one
// in their own copy of the file with File › Open a share link… (Q81).

const PORT = 18791;
const RELAY = `http://127.0.0.1:${PORT}`;
const PUBLIC_APP = 'https://zjs.github.io/planning-board/';
let relay: ChildProcess;

test.beforeAll(async () => {
  const data = join(mkdtempSync(join(tmpdir(), 'relay-no-app-')), 'data');
  const args = ['run', '.', '-addr', `127.0.0.1:${PORT}`, '-public-url', RELAY, '-serve-app=false', '-data', data, '-announce=false'];
  // In its own process group, so stopping it also stops the program `go run` starts.
  relay = spawn('go', args, { cwd: 'relay', stdio: 'ignore', detached: true });
  for (let tries = 0; ; tries++) {
    try {
      if ((await fetch(`${RELAY}/config`)).ok) break;
    } catch {
      if (tries > 900) throw new Error('the relay never started');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
});
test.afterAll(() => {
  if (relay.pid !== undefined) process.kill(-relay.pid);
});

test('a relay that serves no app, used from the HTML file on two computers', async ({ browser }) => {
  // Its own address says where to open the app instead, and /config says it serves none.
  const home = await (await fetch(`${RELAY}/`)).text();
  expect(home).toContain(PUBLIC_APP);
  expect(home).toContain('Open a share link');
  expect(home).not.toContain('<script');
  expect(((await (await fetch(`${RELAY}/config`)).json()) as { app: boolean }).app).toBe(false);

  // Ada shares the sample from the file.
  const ada = await (await browser.newContext()).newPage();
  await ada.goto(APP_URL);
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('board').waitFor();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-name').fill('Ada');
  await ada.getByRole('button', { name: 'Continue' }).click();
  await ada.getByTestId('share-relay').fill(RELAY);
  await ada.getByTestId('share-start').click();
  const link = await ada.getByTestId('edit-link').inputValue();
  expect(link.startsWith(PUBLIC_APP)).toBe(true);
  await expect(ada.getByTestId('links-trust')).toHaveCount(0);
  await expect(ada.getByTestId('links-no-app')).toContainText('Open a share link');
  await ada.getByRole('button', { name: 'Done' }).click();
  await expect(ada.getByTestId('connection-state')).toHaveText('Live');

  // Bo opens the link in their own copy of the file.
  const bo = await (await browser.newContext()).newPage();
  await bo.goto(APP_URL);
  await bo.getByTestId('file-menu').click();
  await bo.getByRole('menuitem', { name: 'Open a share link…' }).click();
  const dialog = bo.getByTestId('open-link');
  const input = bo.getByTestId('open-link-input');
  await input.fill(PUBLIC_APP);
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('isn’t a share link');
  await input.fill(link);
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  const name = bo.getByTestId('name-dialog');
  await name.getByTestId('share-name').fill('Bo');
  await name.getByRole('button', { name: 'Continue' }).click();
  await expect(bo.getByTestId('connection-state')).toHaveText('Live');
  await expect(card(bo, 'sso-enforcement-per-workspace').first()).toBeVisible();
});
