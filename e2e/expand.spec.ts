import { expect, test, type Page } from '@playwright/test';
import { card, dragTo, openApp } from './app.ts';

// Seeing inside groups and changing what's in them (requirements 11 and 12), by expanding in place:
// there's no zoom (Q42, ADR 0013). These replace the zoom tests, gesture for gesture.

const EU = 'eu-data-residency';
const chip = (page: Page, id: string) => card(page, id).first().locator('.parent-chip');

async function select(page: Page, id: string) {
  await card(page, id).first().locator('.card-title').click();
}

test("a selected group's count expands it in place; the inspector shows the group's own values (Q19)", async ({ page }) => {
  await openApp(page);
  await select(page, EU);
  await page.keyboard.press('i');
  // The group's own values, which the zoom bar used to show.
  await expect(page.getByTestId('inspector').getByRole('combobox', { name: 'Size' })).toHaveValue('xl');

  await card(page, EU).locator('.zoom-into').click();
  // Its four children take its place, each marked with it; a grandchild stays inside its own group.
  for (const id of ['regional-pipeline-shards', 'eu-invoice-storage', 'region-pinned-directory-sync', 'residency-setting-in-console']) {
    await expect(chip(page, id)).toHaveText('EU data residency');
  }
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
  // Everything else stays on the board.
  await expect(card(page, 'custom-roles')).toHaveCount(1);
  await expect(page.getByTestId('zoom-bar')).toHaveCount(0);

  // Expanding survives a reload; ⇧E collapses it.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await select(page, 'eu-invoice-storage');
  await page.keyboard.press('Shift+E');
  await expect(card(page, EU)).toHaveClass(/selected/);
});

test('a card moved out of a group with the strip leaves it; undo puts it back', async ({ page }) => {
  await openApp(page);
  await select(page, EU);
  await page.keyboard.press('e');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');
  await dragTo(page, card(page, 'eu-invoice-storage').first(), page.getByTestId('move-out'));
  await expect(chip(page, 'eu-invoice-storage')).toHaveCount(0);
  await expect(card(page, EU).first()).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');
});

test('double-clicking a group renames it (Q36)', async ({ page }) => {
  await openApp(page);
  await card(page, EU).dblclick();
  const field = card(page, EU).getByRole('textbox', { name: 'Card title' });
  await field.fill('EU residency program');
  await field.press('Enter');
  await expect(card(page, EU).locator('.card-title')).toHaveText('EU residency program');
});

test("a click on an unselected group's count selects it rather than expanding it", async ({ page }) => {
  await openApp(page);
  const group = card(page, EU);
  await group.locator('.zoom-into').click();
  await expect(page.locator('.parent-chip')).toHaveCount(0);
  await expect(group).toHaveClass(/selected/);
  // Selected, the count expands it in place (Q42).
  await group.locator('.zoom-into').click();
  await expect(group).toHaveCount(0);
  await expect(page.locator('.parent-chip', { hasText: 'EU data residency' }).first()).toBeVisible();
});

test('any card can get a first child, which makes it a group (Q20)', async ({ page }) => {
  await openApp(page);
  const plain = card(page, 'idp-initiated-login');
  await expect(plain.locator('.child-count')).toHaveCount(0);
  await plain.locator('.card-title').click();
  await page.keyboard.press('i');
  await page.getByTestId('inspector').getByRole('button', { name: 'Add a card inside' }).click();
  const field = page.getByRole('textbox', { name: 'Card title' }).first();
  await field.fill('SP metadata upload');
  await field.press('Enter');
  const created = page.locator('.card', { hasText: 'SP metadata upload' }).first();
  // The new card takes its parent's place, marked with it, so it's where you were looking.
  await expect(created.locator('.parent-chip')).toHaveText(/IdP-initiated login/i);
  await created.locator('.card-title').click();
  await page.keyboard.press('Shift+E');
  await expect(card(page, 'idp-initiated-login').locator('.child-count')).toHaveText('1');
});
