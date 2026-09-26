import { expect, test } from '@playwright/test';
import { openApp } from './app.ts';

test('help opens on first visit, stays closed once dismissed, and reopens from the toolbar', async ({ page }) => {
  await openApp(page, { keepHelp: true });
  const legend = page.getByTestId('legend');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText(/Hold (Alt|⌥ Option) while dropping/);

  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(legend).toHaveCount(0);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(legend).toHaveCount(0);

  await page.getByRole('button', { name: '? Help' }).click();
  await expect(legend).toBeVisible();
});
