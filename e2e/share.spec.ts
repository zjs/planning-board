import { expect, test } from '@playwright/test';
import { openApp } from './app.ts';

// A build no relay serves (the public site, or the file from disk) asks for a relay's address (Q70).

test('Share asks for your name once, then for a relay, and says why one can’t be reached', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('share-button').click();
  await page.getByTestId('share-name').fill('Ada');
  await page.getByRole('button', { name: 'Continue' }).click();
  const relay = page.getByTestId('share-relay');
  await expect(relay).toBeVisible();

  await relay.fill('');
  await page.getByTestId('share-start').click();
  await expect(page.getByTestId('share-dialog')).toContainText('Type the address your relay printed');
  // Port 9 (discard) has no relay on it.
  await relay.fill('127.0.0.1:9');
  await page.getByTestId('share-start').click();
  await expect(page.getByTestId('share-dialog')).toContainText('There’s no relay answering at http://127.0.0.1:9');
  // Nothing was shared, and the name is remembered.
  await page.getByTestId('share-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('connection-pill')).toHaveCount(0);
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-relay')).toHaveValue('');
  await expect(page.getByTestId('share-name')).toHaveCount(0);
});
