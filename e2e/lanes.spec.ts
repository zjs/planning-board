import { expect, test } from '@playwright/test';
import { card, cell, doubleClickEmpty, dragTo, foldAll, openApp, pickAxes } from './app.ts';

// Lanes at every level (requirement 7). Lane zoom is gone: unfolding a band shows the level below,
// with the rest of the board still in view (Q43, ADR 0013).

test('unfolded, the axes show components and releases', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'Time', false);
  await foldAll(page, 'System', false);
  await expect(page.locator('.column-header').first()).toHaveText('27.1');
  await expect(page.locator('.row-header').first()).toHaveText('SSO');
  // The edges hold only cards with no value at any level.
  await expect(page.locator('.holding-head')).toContainText('No quarter');
  await expect(page.locator('.holding-row-header')).toHaveText('No area');
  await expect(cell(page, 'identity/mfa', 'q1/r1').locator('.card[data-item="passwordless-login"]')).toBeVisible();
});

test('a coarse card waits in its area\'s "No component" lane, and a drop refines it', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');

  // A card tagged only "Identity & Access": made in the folded Identity row, Q2 column.
  await doubleClickEmpty(page, cell(page, 'identity', 'q2'));
  await page.keyboard.type('Session policy overhaul');
  await page.keyboard.press('Enter');
  const coarse = page.locator('.card', { hasText: 'Session policy overhaul' });
  await expect(coarse).toBeVisible();

  // Unfold Identity by clicking its folded lane: other areas stay on the board.
  await page.locator('.row-header[data-row="identity"]').getByRole('button').click();
  await expect(page.locator('.row-header[data-row^="identity/"]')).toHaveText(['SSO', 'MFA', 'Directory Sync', 'Roles & Permissions']);
  await expect(card(page, 'credit-notes')).toHaveCount(1);
  // Identity, but no component yet: it waits in Identity's own lane.
  await expect(cell(page, 'identity', 'q2').locator('.card', { hasText: 'Session policy overhaul' })).toBeVisible();

  await dragTo(page, coarse, cell(page, 'identity/sso', 'q2'));
  await expect(cell(page, 'identity/sso', 'q2').locator('.card', { hasText: 'Session policy overhaul' })).toBeVisible();

  // Fold it again: it's still in Identity, now badged SSO instead of carrying both.
  await page.getByRole('button', { name: 'Fold Identity & Access' }).click();
  const refined = cell(page, 'identity', 'q2').locator('.card', { hasText: 'Session policy overhaul' });
  await expect(refined.locator('.attr[data-property="system"]')).toHaveText('SSO');
});

test("a card made in an area's own lane gets the plain area, and stays in view", async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'System', false);
  await doubleClickEmpty(page, cell(page, 'identity', 'q3'));
  await page.keyboard.type('Admin audit export');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'identity', 'q3').locator('.card', { hasText: 'Admin audit export' })).toBeVisible();
});

test('folding survives a reload', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  await page.locator('.column-header[data-column="q2"]').getByRole('button').click();
  await expect(page.locator('.column-header[data-column^="q2"]')).toHaveText(['27.3', '27.4', 'No release']);

  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.column-header[data-column^="q2"]')).toHaveText(['27.3', '27.4', 'No release']);
  await expect(page.locator('.column-header.lane-collapsed')).toHaveCount(3);
});
