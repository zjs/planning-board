import { expect, test } from '@playwright/test';
import { card, openApp, reveal } from './app.ts';

// History on a plan that isn't shared (sprint 13; requirement 36): your own changes, grouped when close together (Q74).

test('Activity on a plan only on this computer: your changes, a burst grouped into one row that opens', async ({ page }) => {
  await openApp(page);
  for (const [id, title] of [
    ['sso-enforcement-per-workspace', 'SSO enforcement, per workspace'],
    ['passwordless-login', 'Passwordless sign-in'],
  ] as const) {
    await reveal(card(page, id).first());
    await card(page, id).first().dblclick();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
  }
  await page.getByTestId('activity-button').click();
  const rows = page.getByTestId('activity').getByTestId('activity-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('You made 2 changes');
  await rows.first().locator('summary').click();
  await expect(rows.first()).toContainText('renamed “Passwordless login” to “Passwordless sign-in”');
  // A change shows its card on the board.
  await rows.first().getByRole('button', { name: /SSO enforcement, per workspace/ }).click();
  await expect(card(page, 'sso-enforcement-per-workspace').first()).toHaveClass(/selected/);
});
