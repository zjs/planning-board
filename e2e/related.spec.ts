import { expect, test, type Page } from '@playwright/test';
import { card, openApp, reveal } from './app.ts';

// "Related to" links (Q44): ⌥L relates two cards with no order between them. Dotted, with no arrow, never red.

const notice = (page: Page) => page.getByTestId('notice');
const inspector = (page: Page) => page.getByTestId('inspector');
const relatedLines = (page: Page) => page.locator('.dep-line.related');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

test('the sample shows its related links on hover, dotted and without an arrow', async ({ page }) => {
  await openApp(page);
  await expect(relatedLines(page)).toHaveCount(0);
  const audit = card(page, 'audit-log-export-api').first();
  await reveal(audit);
  await audit.hover();
  await expect(relatedLines(page)).toHaveCount(1);
  await expect(relatedLines(page).first()).not.toHaveAttribute('marker-end', /.*/);
});

test('⌥L relates two cards, the inspector lists it, nothing turns red, and ⌥L again removes it', async ({ page }) => {
  await openApp(page);
  const red = await page.locator('.dep-line.problem').count();
  await select(page, 'oidc-provider-support', 'login-anomaly-alerts');
  await page.keyboard.press('Alt+KeyL');
  await expect(notice(page)).toContainText('Related “OIDC provider support” and “Login anomaly alerts”');
  // Selected, both cards show the link: one dotted line between them.
  await expect(relatedLines(page)).toHaveCount(1);
  await expect(page.locator('.dep-line.problem')).toHaveCount(red);

  await select(page, 'oidc-provider-support');
  await page.keyboard.press('i');
  await expect(inspector(page).getByRole('list', { name: 'Related' })).toContainText('Login anomaly alerts');

  await select(page, 'oidc-provider-support', 'login-anomaly-alerts');
  await page.keyboard.press('Alt+KeyL');
  await expect(notice(page)).toContainText('are no longer related');
  await expect(relatedLines(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(relatedLines(page)).toHaveCount(1);
});

test('with one card selected, ⌥L starts a related link finished on another', async ({ page }) => {
  await openApp(page);
  await select(page, 'oidc-provider-support');
  await page.keyboard.press('Alt+KeyL');
  await expect(page.getByTestId('link-bar')).toContainText('Relating “OIDC provider support”');
  await select(page, 'login-anomaly-alerts');
  await page.keyboard.press('Alt+KeyL');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  await expect(notice(page)).toContainText('Related “OIDC provider support” and “Login anomaly alerts”');
});
