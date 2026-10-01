import { expect, test } from '@playwright/test';
import { APP_URL, openApp } from './app.ts';

test('help opens on first visit, stays closed once dismissed, and reopens from the toolbar', async ({ page }) => {
  await openApp(page, { keepHelp: true });
  const legend = page.getByTestId('legend');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText(/Hold (Alt|⌥ Option) while dropping/);
  await expect(legend).toContainText('File › Import CSV');
  await expect(legend).toContainText('Properties');
  await expect(legend).toContainText('Dependencies');
  await expect(legend.getByRole('link', { name: 'Feedback and bug reports' })).toHaveAttribute(
    'href',
    'https://github.com/zjs/planning-board/issues/new/choose',
  );
  await expect(legend).toContainText(/Build (local|[0-9a-f]{7})/);

  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(legend).toHaveCount(0);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(legend).toHaveCount(0);

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(legend).toBeVisible();
});

test('first-visit help waits until there is a board, so it never covers the empty board’s buttons', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.getByTestId('legend')).toHaveCount(0);
  await page.locator('.empty-state button.primary').click();
  await expect(page.getByTestId('legend')).toBeVisible();
});
