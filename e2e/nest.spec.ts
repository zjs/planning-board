import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, holdOver, openApp, pickAxes } from './app.ts';

const notice = (page: Page) => page.getByTestId('notice');
const chip = (page: Page, id: string) => card(page, id).first().locator('.parent-chip');

async function select(page: Page, ...ids: string[]) {
  await card(page, ids[0]!).first().locator('.card-title').click();
  for (const id of ids.slice(1)) await card(page, id).first().locator('.card-title').click({ modifiers: ['Shift'] });
}

test('hold a card over another to put it inside, without changing its values; a quick drop still lands in the cell', async ({ page }) => {
  await openApp(page);
  const roles = card(page, 'custom-roles');
  const size = await roles.locator('.attr[data-property="size"]').textContent();
  await holdOver(page, roles, card(page, 'passwordless-login'));
  await expect(card(page, 'passwordless-login')).toHaveClass(/nest-target/);
  await expect(page.locator('.drag-ghost')).toContainText('Put inside “Passwordless login”');
  await page.mouse.up();

  await expect(notice(page)).toContainText('Put “Custom roles” inside “Passwordless login”');
  // It's inside a folded group now, so it's off the board, and its group is selected instead.
  await expect(roles).toHaveCount(0);
  await expect(card(page, 'passwordless-login')).toHaveClass(/selected/);
  await page.keyboard.press('e');
  await expect(chip(page, 'custom-roles')).toHaveText('Passwordless login');
  await expect(card(page, 'custom-roles').locator('.attr[data-property="size"]')).toHaveText(size!);

  // Undo puts it back at the top level.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(page, 'custom-roles')).toHaveCount(1);
  await expect(chip(page, 'custom-roles')).toHaveCount(0);

  // A quick drop on a card goes into the cell under it, as before.
  await dragTo(page, card(page, 'custom-roles'), card(page, 'saml-metadata-auto-refresh'));
  await expect(card(page, 'custom-roles')).toHaveCount(1);
  await expect(chip(page, 'custom-roles')).toHaveCount(0);
});

test('a card can never go inside itself, its own group, or anything inside it', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const frame = cell(page, 'identity', 'q3').locator('.frame[data-frame="eu-data-residency"]');
  const child = frame.locator('.card[data-item="region-pinned-directory-sync"]');
  await expect(child).toBeVisible();

  // The group held over a card inside it: no highlight, so no loop.
  await holdOver(page, card(page, 'eu-data-residency').first(), child);
  await expect(page.locator('.nest-target')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  // The child held over its own group's frame: it's already inside.
  await holdOver(page, child, frame.locator('.card.via-children'));
  await expect(page.locator('.nest-target')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  // Held over another group, it can go in.
  await holdOver(page, child, card(page, 'passwordless-login').first());
  await expect(card(page, 'passwordless-login').first()).toHaveClass(/nest-target/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('dragging a card in a group shows a strip that moves it out one level', async ({ page }) => {
  await openApp(page);
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');

  const strip = page.getByTestId('move-out');
  await expect(strip).toHaveCount(0);
  // E selected all of the group's cards; select just this one, so only it moves (Q48 drags a whole selection).
  await select(page, 'eu-invoice-storage');
  await dragTo(page, card(page, 'eu-invoice-storage').first(), strip);
  await expect(notice(page)).toContainText('Moved “EU invoice storage” out of “EU data residency”');
  await expect(card(page, 'eu-invoice-storage').first()).toBeVisible();
  await expect(chip(page, 'eu-invoice-storage')).toHaveCount(0);
  await expect(strip).toHaveCount(0);
});

test('the inspector moves cards between groups, and adds a card inside one', async ({ page }) => {
  await openApp(page);
  await select(page, 'custom-roles');
  await page.keyboard.press('i');
  const inspector = page.getByTestId('inspector');
  await expect(inspector.locator('.group-current')).toHaveText('Top level');
  await inspector.getByRole('searchbox', { name: 'Move into a group' }).fill('passwordless');
  await inspector.getByRole('list', { name: 'Groups to move into' }).getByRole('button', { name: /Passwordless login/ }).click();
  await expect(notice(page)).toContainText('Moved “Custom roles” into “Passwordless login”');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(page, 'custom-roles')).toHaveCount(1);

  // A plain card gets its first child, expanded in place and ready to name.
  await select(page, 'custom-roles');
  await inspector.getByRole('button', { name: 'Add a card inside' }).click();
  const field = page.getByRole('textbox', { name: 'Card title' }).first();
  await field.fill('Role templates');
  await field.press('Enter');
  const created = page.locator('.card', { hasText: 'Role templates' });
  await expect(created.locator('.parent-chip')).toHaveText('Custom roles');
  await expect(inspector.locator('.group-current')).toHaveText('Custom roles');
});

test('⇧-click a badge selects every match in any pivot; ⇧-click a header selects its lane; ⌘A selects all', async ({ page }) => {
  await openApp(page);
  // Sequence × System: Level isn't an axis, so it's a badge.
  await card(page, 'eu-data-residency').locator('.attr[data-property="level"]').click({ modifiers: ['Shift'] });
  await expect(notice(page)).toContainText('Selected 3 cards with Initiative');
  await expect(page.locator('.card.selected:not(.via-children)')).toHaveCount(3);
  await page.keyboard.press('e');
  for (const id of ['eu-data-residency', 'usage-based-pricing', 'public-api-v2']) await expect(card(page, id)).toHaveCount(0);

  await page.locator('.row-header[data-row="identity"]').click({ modifiers: ['Shift'] });
  await expect(notice(page)).toContainText(/Selected \d+ cards in Identity/);

  await page.locator('.board-scroll').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+a');
  await expect(notice(page)).toContainText(/Selected \d+ cards on the board/);
  const total = await page.locator('.card:not(.via-children)').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-item'))).size);
  const selected = await page.locator('.card.selected:not(.via-children)').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-item'))).size);
  expect(selected).toBe(total);
});
