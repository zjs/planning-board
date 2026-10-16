import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { MOVE_NEW, MOVE_OLD, RELAY_PORT } from '../../playwright.config.ts';

// Moving the public build to a domain of its own (Q80 d, ADR 0025), with two
// addresses on this computer standing in for the old and the new: each serves
// the build in dist/, as GitHub Pages would. Plans made and shared at the old
// address arrive at the new one, with their sharing, and keep syncing; the
// stub sends share links on with the key still after the #.

function serve(address: string): Promise<Server> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', address).pathname;
    const file = join('dist', path === '/' ? 'index.html' : path.slice(1));
    if (!/^[\w.-]+$/.test(path.slice(1) || 'index.html') || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(file).pipe(res);
  });
  const url = new URL(address);
  return new Promise((resolve) => server.listen(Number(url.port), url.hostname, () => resolve(server)));
}

let servers: Server[] = [];
test.beforeAll(async () => {
  servers = await Promise.all([serve(MOVE_OLD), serve(MOVE_NEW)]);
});
test.afterAll(() => {
  for (const s of servers) s.close();
});

test('plans shared at the old address move to the new one, and keep syncing; the stub sends links on', async ({ browser }) => {
  const context = await browser.newContext();
  // Point the move at this computer's two addresses. Each side reads only its own key.
  await context.addInitScript(
    ([from, to]) => {
      localStorage.setItem('planning-board:move-from', from!);
      localStorage.setItem('planning-board:move-to', to!);
    },
    [`${MOVE_OLD}/move.html`, `${MOVE_NEW}/`],
  );

  // At the old address: the sample plan, shared through the relay.
  const old = await context.newPage();
  await old.goto(`${MOVE_OLD}/`);
  await old.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await old.getByTestId('board').waitFor();
  await old.getByTestId('share-button').click();
  await old.getByTestId('share-name').fill('Ada');
  await old.getByRole('button', { name: 'Continue' }).click();
  await old.getByTestId('share-relay').fill(`http://127.0.0.1:${RELAY_PORT}`);
  await old.getByTestId('share-start').click();
  const link = await old.getByTestId('edit-link').inputValue();
  await old.getByRole('button', { name: 'Done' }).click();
  await expect(old.getByTestId('connection-state')).toHaveText('Live');
  const room = new URLSearchParams(new URL(link).hash.slice(1)).get('room')!;

  // At the new address, opened to bring plans: a tab at the old address hands them over, and nothing is added
  // until the plans are confirmed by name.
  const fresh = await context.newPage();
  await fresh.goto(`${MOVE_NEW}/#moved`);
  const dialog = fresh.getByTestId('move-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('move-open').click();
  await expect(dialog.getByTestId('move-plans')).toContainText('Sample plan');
  await dialog.getByTestId('move-add').click();

  // The page opens again on the moved plan: its cards, its name, and its sharing, live on the same relay and room.
  await expect(fresh.getByTestId('plan-name')).toHaveText('Sample plan');
  await expect(fresh.getByText('SSO enforcement per workspace').first()).toBeVisible();
  await expect(fresh.getByTestId('connection-state')).toHaveText('Live');
  await fresh.getByTestId('share-button').click();
  const moved = await fresh.getByTestId('edit-link').inputValue();
  expect(new URLSearchParams(new URL(moved).hash.slice(1)).get('room')).toBe(room);
  await fresh.getByRole('button', { name: 'Done' }).click();

  // A change at the new address reaches the old one, through the relay.
  await fresh.getByTestId('plan-name').dblclick();
  await fresh.keyboard.press('ControlOrMeta+a');
  await fresh.keyboard.type('Moved roadmap');
  await fresh.keyboard.press('Enter');
  await expect(old.getByTestId('plan-name')).toHaveText('Moved roadmap');

  // After the switch, the old address's stub sends a share link on, key and all, saying plans are kept there.
  const visitor = await context.newPage();
  await visitor.goto(`${MOVE_OLD}/stub.html${new URL(link).hash}`);
  await visitor.waitForURL((url) => url.origin === MOVE_NEW);
  expect(new URL(visitor.url()).hash).toBe(`${new URL(link).hash}&moved=1`);
  // Without a link, it offers to move the plans it still keeps.
  await visitor.goto(`${MOVE_OLD}/stub.html`);
  await expect(visitor.getByTestId('stub-move')).toHaveAttribute('href', `${MOVE_NEW}/#moved`);
  await context.close();
});
