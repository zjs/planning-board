import { expect, test } from '@playwright/test';
import { card, cell, dragTo, holding, openApp, pickAxes } from './app.ts';

// Two tabs of one plan stay in sync (sprint 10, slice 3), over a BroadcastChannel, with no server.

test('a drag in one tab moves the card in the other, and undo there leaves it alone', async ({ context }) => {
  const a = await context.newPage();
  await openApp(a);
  await pickAxes(a, 'time', 'system');
  const b = await context.newPage();
  await b.goto(a.url());
  await b.getByTestId('board').waitFor();
  await expect(b.getByTestId('plan-name')).toHaveText('Sample plan');
  await pickAxes(b, 'time', 'system');

  const id = 'sso-enforcement-per-workspace';
  await dragTo(a, card(holding(a, { row: 'identity' }), id), cell(a, 'billing', 'q3'));
  await expect(card(cell(b, 'billing', 'q3'), id)).toBeVisible();

  // Undo is per tab: the other tab has nothing of its own to undo.
  const undoB = b.locator('.toolbar').getByRole('button', { name: 'Undo' });
  await expect(undoB).toBeDisabled();
  // An edit in the second tab comes back to the first, and undoing it there undoes only that.
  await dragTo(b, card(cell(b, 'billing', 'q3'), id), cell(b, 'billing', 'q4'));
  await expect(card(cell(a, 'billing', 'q4'), id)).toBeVisible();
  await b.keyboard.press('ControlOrMeta+z');
  await expect(card(cell(a, 'billing', 'q3'), id)).toBeVisible();
  await expect(undoB).toBeDisabled();
});

test('renaming or deleting a plan shows in the other tab', async ({ context }) => {
  const a = await context.newPage();
  await openApp(a);
  await a.getByTestId('file-menu').click();
  await a.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(a.getByTestId('draft-card').locator('textarea')).toBeFocused();
  await a.keyboard.type('Scratch idea');
  await a.keyboard.press('Enter');
  await a.keyboard.press('Escape');

  const b = await context.newPage();
  await b.goto(a.url());
  await expect(b.locator('.card', { hasText: 'Scratch idea' })).toHaveCount(1);

  await a.getByTestId('plan-name').dblclick();
  await a.getByLabel('Plan name').fill('Q3 ideas');
  await a.keyboard.press('Enter');
  await expect(b.getByTestId('plan-name')).toHaveText('Q3 ideas');

  await a.getByTestId('file-menu').click();
  await a.getByRole('menuitem', { name: 'Delete plan' }).click();
  await expect(b.getByTestId('plan-name')).toHaveText('Sample plan');
  // Undo in the first tab brings it back to both lists.
  await a.getByTestId('plan-notice').getByRole('button', { name: 'Undo' }).click();
  await b.getByTestId('file-menu').click();
  await expect(b.getByRole('menu').getByRole('menuitem', { name: 'Q3 ideas', exact: true })).toBeVisible();
});
