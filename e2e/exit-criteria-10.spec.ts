import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { asEarlierBrowser, card, cell, dragTo, holding, pickAxes, planList, storageSettled, switchPlan } from './app.ts';

// Sprint 10's exit criteria (docs/sprint-10.md), in order.

const fixture = (name: string) => new URL(`../src/domain/__fixtures__/compat/${name}`, import.meta.url);

test('sprint 10 exit criteria', async ({ context }) => {
  test.setTimeout(90_000);
  const page = await context.newPage();
  const undo = page.locator('.toolbar').getByRole('button', { name: 'Undo' });
  const redo = page.locator('.toolbar').getByRole('button', { name: 'Redo' });

  // 1. A browser that used an earlier build finds its board as it was, now called "My plan".
  await asEarlierBrowser(page, [...readFileSync(fixture('sprint-8.board.yjs'))]);
  await expect(page.getByTestId('plan-name')).toHaveText('My plan');
  await expect(card(page, 'passwordless-login').first()).toBeVisible();
  const cards = await page.locator('.card[data-item]').count();

  // 2. Delete a group with stories inside, undo, redo, undo again, and reload: it's exactly as it was.
  await card(page, 'passwordless-login').first().locator('.card-title').click();
  await page.keyboard.press('Delete');
  await expect(card(page, 'passwordless-login')).toHaveCount(0);
  await undo.click();
  await expect(card(page, 'passwordless-login').first()).toBeVisible();
  await redo.click();
  await expect(card(page, 'passwordless-login')).toHaveCount(0);
  await undo.click();
  await storageSettled(page);
  await page.reload();
  await expect(page.locator('.card[data-item]')).toHaveCount(cards);
  await card(page, 'passwordless-login').first().locator('.card-title').click();
  await page.keyboard.press('e');
  await expect(card(page, 'webauthn-enrollment').first()).toBeVisible();

  // ...and a plan file from sprint 8 opens as a plan of its own, with everything in it.
  await page.getByTestId('open-plan-input').setInputFiles(fixture('sprint-8.plan.json').pathname);
  await expect(page.getByTestId('plan-name')).toHaveText('sprint-8.plan');
  await expect(card(page, 'passwordless-login').first()).toBeVisible();

  // 3. Load the sample: a new plan, with "My plan" still in the File menu. Switch between them.
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Load sample plan' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Sample plan');
  expect(await planList(page)).toEqual(['Sample plan', 'sprint-8.plan', 'My plan']);
  await switchPlan(page, 'My plan');
  await switchPlan(page, 'Sample plan');

  // 4. Rename the sample from the toolbar, reload, and see the new name.
  await page.getByTestId('plan-name').dblclick();
  await page.getByLabel('Plan name').fill('Q3 roadmap');
  await page.keyboard.press('Enter');
  await storageSettled(page);
  await page.reload();
  await expect(page.getByTestId('plan-name')).toHaveText('Q3 roadmap');

  // 5. New blank plan, a few ideas, Delete plan, and Undo.
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(page.getByTestId('draft-card').locator('textarea')).toBeFocused();
  for (const idea of ['Usage alerts', 'Invoice preview']) {
    await page.keyboard.type(idea);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Delete plan' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Q3 roadmap');
  await page.getByTestId('plan-notice').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('plan-name')).toHaveText('Untitled plan');
  await expect(page.locator('.card', { hasText: 'Invoice preview' })).toHaveCount(1);

  // 6. The sample in two tabs: a drag in one moves the card in the other, and undo there does nothing to it.
  await switchPlan(page, 'Q3 roadmap');
  await pickAxes(page, 'time', 'system');
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByTestId('board').waitFor();
  await pickAxes(other, 'time', 'system');
  const id = 'sso-enforcement-per-workspace';
  await dragTo(page, card(holding(page, { row: 'identity' }), id), cell(page, 'billing', 'q3'));
  await expect(card(cell(other, 'billing', 'q3'), id)).toBeVisible();
  await expect(other.locator('.toolbar').getByRole('button', { name: 'Undo' })).toBeDisabled();
});
