import { expect, test } from '@playwright/test';
import { card, cell, holding, openApp, pickAxes } from './app.ts';

test('shows the sample plan as sequence × system with unlabeled sequence columns', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('axis-x')).toHaveValue('sequence');
  await expect(page.getByTestId('axis-y')).toHaveValue('system');
  // System is one choice, folded by default: one lane per area, like the area view before (ADR 0013).
  await expect(page.locator('.band-y .band-head')).toHaveText([
    /Identity & Access/,
    /Billing/,
    /Data Platform/,
    /Customer Experience/,
  ]);
  await expect(page.locator('.row-header')).toHaveCount(4);
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(4);
  await expect(page.locator('.row-header').first()).toHaveText(/\d+ components ▸/);
  const headers = page.locator('.column-header');
  expect(await headers.count()).toBeGreaterThan(5);
  for (const text of await headers.allTextContents()) expect(text).toBe('');
  // Holding lanes along the right and bottom edges, and the corner.
  await expect(page.locator('.holding-head')).toContainText('No position');
  await expect(page.locator('.holding-row-header > span').first()).toHaveText('No area');
  await expect(holding(page, { row: 'identity' }).locator('.card').first()).toBeVisible();
  await expect(page.locator('.holding-bottom[data-column] .card').first()).toBeVisible();
  await expect(holding(page).locator('.card').first()).toBeVisible();
});

test('renders a group as one card with its child count, and hides the children', async ({ page }) => {
  await openApp(page);
  const group = card(page, 'eu-data-residency');
  await expect(group).toHaveCount(1);
  await expect(group.locator('.child-count')).toHaveText('4');
  // Cards inside it show only in its frames, where it reaches a cell through them (Q33).
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
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
  await expect(page.locator('.band-x .band-head')).toHaveText([/Q1 2027/, /Q2 2027/, /Q3 2027/, /Q4 2027/]);
  await expect(page.locator('.column-header.lane-collapsed')).toHaveCount(4);
  await expect(cell(page, 'identity', 'q1').locator('.card[data-item="passwordless-login"]')).toBeVisible();
  // Only about half the items have a quarter, so the "No quarter" lanes are busy here.
  expect(await page.locator('.holding-right .card').count()).toBeGreaterThan(40);
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

test('holding lanes switch between cards and chips, and remember the choice', async ({ page }) => {
  await openApp(page);
  const lane = holding(page, { row: 'identity' });
  await expect(lane.locator('.card.chip')).toHaveCount(0);
  await expect(lane.locator('.attr').first()).toBeVisible();

  await page.getByRole('button', { name: 'Chips' }).click();
  await expect(lane.locator('.card').first()).toHaveClass(/chip/);
  await expect(lane.locator('.attr')).toHaveCount(0);
  // Only holding lanes turn into chips.
  await expect(page.locator('.cell:not(.holding-cell) .card.chip')).toHaveCount(0);

  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.getByRole('button', { name: 'Chips' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lane.locator('.card').first()).toHaveClass(/chip/);
});
