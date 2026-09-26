import { expect, test, type Page } from '@playwright/test';
import { card, cell, doubleClickEmpty, dragTo, holding, openApp, pickAxes } from './app.ts';

const zoomBar = (page: Page) => page.getByTestId('zoom-bar');

test('the axis picker offers components and releases', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'release', 'component');
  await expect(page.locator('.column-header').first()).toHaveText('27.1');
  await expect(page.locator('.row-header').first()).toHaveText('SSO');
  await expect(page.locator('.holding-head')).toContainText('No release');
  await expect(page.locator('.holding-row-header')).toHaveText('No component');
  await expect(cell(page, 'identity/mfa', 'q1/r1').locator('.card[data-item="passwordless-login"]')).toBeVisible();
});

test('clicking a lane header zooms into it; a coarse card waits in "No component" and a drop refines it', async ({
  page,
}) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');

  // A card tagged only "Identity & Access": made in the Identity row, Q2 column.
  await doubleClickEmpty(page, cell(page, 'identity', 'q2'));
  await page.keyboard.type('Session policy overhaul');
  await page.keyboard.press('Enter');
  const coarse = page.locator('.card', { hasText: 'Session policy overhaul' });
  await expect(coarse).toBeVisible();

  await page.locator('.row-header[data-row="identity"]').getByRole('button').click();
  await expect(zoomBar(page)).toContainText('System: Identity & Access');
  await expect(page.locator('.row-header')).toHaveText(['SSO', 'MFA', 'Directory Sync', 'Roles & Permissions']);
  // Other areas are hidden (Q18); a card in both Identity and Billing still shows.
  await expect(card(page, 'credit-notes')).toHaveCount(0);
  await expect(card(page, 'role-based-invoice-access')).toBeVisible();
  // Identity, but no component yet: it waits under its quarter.
  await expect(holding(page, { column: 'q2' }).locator('.card', { hasText: 'Session policy overhaul' })).toBeVisible();

  await dragTo(page, coarse, cell(page, 'identity/sso', 'q2'));
  await expect(cell(page, 'identity/sso', 'q2').locator('.card', { hasText: 'Session policy overhaul' })).toBeVisible();

  // Zoom back out with the chip: it's still in Identity, now badged SSO instead of carrying both.
  await zoomBar(page).getByRole('button', { name: /Zoom out of/ }).click();
  await expect(zoomBar(page)).toHaveCount(0);
  const refined = cell(page, 'identity', 'q2').locator('.card', { hasText: 'Session policy overhaul' });
  await expect(refined.locator('.attr[data-property="system"]')).toHaveText('SSO');
});

test('the lane zoom survives a reload, and Esc clears it', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await page.locator('.column-header[data-column="q2"]').getByRole('button').click();
  await expect(page.locator('.column-header')).toHaveText(['27.3', '27.4']);
  await expect(zoomBar(page)).toContainText('Time: Q2 2027');

  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.column-header')).toHaveText(['27.3', '27.4']);

  await page.keyboard.press('Escape');
  await expect(page.locator('.column-header')).toHaveText(['Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027']);
});
