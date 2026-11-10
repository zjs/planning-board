import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// Share offers the hosted demo relay where no relay was used before (Q64 a), once its address is set. Until it's
// deployed it's null (DEMO_RELAY in src/commands/sharing.ts), so this stands one in, which the app reads only on this
// computer's own addresses: here, the app served at 127.0.0.1, as the public build would be.

const ADDRESS = 'http://127.0.0.1:18790';
let server: Server;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const file = join('dist', 'index.html');
    if (new URL(req.url ?? '/', ADDRESS).pathname !== '/' || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(18790, '127.0.0.1', resolve));
});
test.afterAll(() => {
  server.close();
});

test('Share offers the demo relay where no relay was used before, and says what it keeps', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('planning-board:demo-relay', 'https://demo.example.com'));
  await page.goto(`${ADDRESS}/`);
  await page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await page.getByTestId('share-button').click();
  await page.getByTestId('share-name').fill('Ada');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('share-relay')).toHaveValue('https://demo.example.com');
  const note = page.getByTestId('share-demo');
  await expect(note).toContainText('Plans nobody opens for 30 days are deleted');
  await expect(note.getByRole('link', { name: 'What it keeps' })).toHaveAttribute('href', 'https://demo.example.com/privacy');
  // Another relay typed in: the note goes.
  await page.getByTestId('share-relay').fill('https://plans.example.com');
  await expect(note).toHaveCount(0);
});
