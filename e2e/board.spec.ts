import { expect, test } from '@playwright/test';
import { cell, openApp, pickAxes } from './app.ts';

test('shows the sample plan as sequence × system with unlabeled sequence columns', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('axis-x')).toHaveValue('sequence');
  await expect(page.getByTestId('axis-y')).toHaveValue('system');
  await expect(page.locator('.row-header')).toHaveText([
    'Identity & Access',
    'Billing',
    'Data Platform',
    'Customer Experience',
  ]);
  const headers = page.locator('.column-header');
  expect(await headers.count()).toBeGreaterThan(5);
  for (const text of await headers.allTextContents()) expect(text).toBe('');
  await expect(page.getByTestId('holding').locator('.card').first()).toBeVisible();
});

test('renders a group as one card with its child count, and hides the children', async ({ page }) => {
  await openApp(page);
  const group = page.locator('.card[data-item="eu-data-residency"]');
  await expect(group).toHaveCount(1);
  await expect(group.locator('.child-count')).toHaveText('4');
  await expect(page.locator('.card[data-item="eu-kafka-cluster"]')).toHaveCount(0);
});

test('shows a multi-component card once per matching area lane', async ({ page }) => {
  await openApp(page);
  // Touches Data Platform (4 components, one lane) and Billing and Identity.
  const copies = page.locator('.card[data-item="tenant-data-deletion-gdpr"]');
  await expect(copies).toHaveCount(3);
});

test('pivots to time × system and places cards by quarter', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await expect(page.locator('.column-header')).toHaveText(['Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027']);
  await expect(cell(page, 'identity', 'q1').locator('.card[data-item="passwordless-login"]')).toBeVisible();
  // Only about half the items have a quarter, so the holding area is busy here.
  expect(Number(await page.getByTestId('holding').locator('.count').textContent())).toBeGreaterThan(40);
});

test('picking the other axis swaps them, and the swap button flips the view', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('axis-x').selectOption('system');
  await expect(page.getByTestId('axis-y')).toHaveValue('sequence');
  await page.getByRole('button', { name: 'Swap rows and columns' }).click();
  await expect(page.getByTestId('axis-x')).toHaveValue('sequence');
  await expect(page.getByTestId('axis-y')).toHaveValue('system');
});

test('remembers the chosen view across a reload', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'size', 'time');
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.getByTestId('axis-x')).toHaveValue('size');
  await expect(page.getByTestId('axis-y')).toHaveValue('time');
});
