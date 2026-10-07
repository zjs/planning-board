import { expect, test } from '@playwright/test';
import { APP_URL, openApp } from './app.ts';

// The cheat sheet (Q53): it opens from "?" only, grouped by what you want to do.

test('help stays closed until asked for, and opens from the toolbar as a cheat sheet', async ({ page }) => {
  await openApp(page, { keepHelp: true });
  const legend = page.getByTestId('legend');
  await expect(legend).toHaveCount(0);

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('heading', { level: 3 })).toHaveText([
    'Add and arrange cards',
    'Change the view',
    'Groups',
    'Select and find',
    'Dependencies',
    'Plans and properties',
    'What the board tells you',
  ]);
  await expect(legend).toContainText(/Hold (Alt|⌥ Option) while dropping/);
  await expect(legend).toContainText('File › Import CSV');
  await expect(legend).toContainText('Frames');
  await expect(legend).toContainText(/Inspect, I/);
  await expect(legend.getByRole('link', { name: 'Feedback and bug reports' })).toHaveAttribute(
    'href',
    'https://github.com/zjs/planning-board/issues/new/choose',
  );
  await expect(legend).toContainText(/Build (local|[0-9a-f]{7})/);

  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(legend).toHaveCount(0);
});

test('the empty board leads with a blank plan, and help doesn’t cover it', async ({ page }) => {
  await page.goto(APP_URL);
  const empty = page.locator('.empty-state');
  await expect(empty.locator('button.primary')).toHaveText('Start a blank plan');
  await expect(empty.getByRole('button', { name: 'Load sample plan' })).toBeVisible();
  await expect(page.getByTestId('legend')).toHaveCount(0);
});
