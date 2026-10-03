import { expect, test, type Page } from '@playwright/test';
import { card, openApp, expandGroup, reveal } from './app.ts';

// Drawing and showing dependency links (requirement 15, Q24, Q38, Q39).

const line = (page: Page, from: string, to: string) => page.locator(`.dep-line[data-from="${from}"][data-to="${to}"]`);
const notice = (page: Page) => page.getByTestId('notice');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

test('select two cards and press L: the first comes before the second; L again removes it; undo works', async ({ page }) => {
  await openApp(page);
  await select(page, 'credit-notes', 'vat-oss-reporting');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Credit notes” → “VAT OSS reporting”');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(1);

  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Removed the link “Credit notes” → “VAT OSS reporting”');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(0);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(1);

  // The Link button does the same as L.
  await page.locator('.toolbar').getByRole('button', { name: 'Link' }).click();
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(0);
});

test('focus: hovering shows direct links, selecting shows the whole chain, and nothing shows otherwise', async ({ page }) => {
  await openApp(page);
  // Only flagged links are drawn with nothing in focus (slice 3).
  await expect(page.locator('.dep-line.focus')).toHaveCount(0);

  // scim-2-0-group-push → seat-sync-from-directory → seat-based-add-ons, all at the top level.
  const middle = card(page, 'seat-sync-from-directory').first();
  await reveal(middle);
  await middle.hover();
  await expect(line(page, 'scim-2-0-group-push', 'seat-sync-from-directory')).toHaveCount(1);
  await expect(line(page, 'seat-sync-from-directory', 'seat-based-add-ons')).toHaveCount(1);

  const first = card(page, 'scim-2-0-group-push').first();
  await reveal(first);
  await first.hover();
  // Hover is direct links only: not the next step down the chain.
  await expect(line(page, 'scim-2-0-group-push', 'seat-sync-from-directory')).toHaveCount(1);
  await expect(line(page, 'seat-sync-from-directory', 'seat-based-add-ons')).toHaveCount(0);

  // Selected: the whole chain.
  await first.locator('.card-title').click();
  await page.mouse.move(2, 2);
  await expect(line(page, 'scim-2-0-group-push', 'seat-sync-from-directory')).toHaveCount(1);
  await expect(line(page, 'seat-sync-from-directory', 'seat-based-add-ons')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.dep-line.focus')).toHaveCount(0);
});

test('a pending link survives expanding, so a card can be linked to one inside a group (Q38)', async ({ page }) => {
  await openApp(page);
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await expect(page.getByTestId('link-bar')).toContainText('Linking from “Custom roles”');

  await expandGroup(card(page, 'eu-data-residency').first());
  await select(page, 'region-pinned-directory-sync');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Custom roles” → “Region-pinned directory sync”');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);

  // Collapsed again, the link is drawn to the group the card is in.
  await page.keyboard.press('Shift+E');
  await select(page, 'custom-roles');
  await expect(line(page, 'custom-roles', 'eu-data-residency')).toHaveCount(1);
});

test('Esc cancels a pending link; L explains itself with the wrong number of cards selected (Q39)', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Select the card that comes first');

  await select(page, 'credit-notes', 'vat-oss-reporting', 'custom-roles');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Select just two cards');

  await select(page, 'credit-notes');
  await page.keyboard.press('l');
  await expect(page.getByTestId('link-bar')).toBeVisible();
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Select one other card');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  // The first Esc only cancelled the link; the card is still selected.
  await expect(card(page, 'credit-notes').first()).toHaveClass(/selected/);
});
