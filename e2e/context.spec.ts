import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, openApp, pickAxes, reveal } from './app.ts';

// Children in context (Q33): frames around faded copies, expanding groups in place, and zooming into several at once.

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

const chip = (page: Page, id: string) => card(page, id).first().locator('.parent-chip');

test('a faded group frames the cards that put it there, and dragging one changes that card', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  // EU data residency is a Data Platform group; Region-pinned directory sync puts it in Identity, Q3.
  const frame = cell(page, 'identity', 'q3').locator('.frame[data-frame="eu-data-residency"]');
  await expect(frame.locator('.card.via-children[data-item="eu-data-residency"]')).toBeVisible();
  const child = frame.locator('.card[data-item="region-pinned-directory-sync"]');
  await expect(child).toBeVisible();

  await dragTo(page, child, cell(page, 'billing', 'q3'));
  await expect(cell(page, 'billing', 'q3').locator('.frame[data-frame="eu-data-residency"] .card[data-item="region-pinned-directory-sync"]')).toBeVisible();
  await expect(cell(page, 'identity', 'q3').locator('.frame[data-frame="eu-data-residency"]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(child).toBeVisible();
});

test('E expands groups in place, each child marked with its group; ⇧E on a child folds its group back', async ({ page }) => {
  await openApp(page);
  await select(page, 'eu-data-residency', 'passwordless-login');
  await page.keyboard.press('e');
  await expect(card(page, 'eu-data-residency')).toHaveCount(0);
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');
  await expect(chip(page, 'webauthn-enrollment')).toHaveText('Passwordless login');
  // The two groups get different tones.
  const tone = (id: string) => card(page, id).first().getAttribute('data-tone');
  expect(await tone('eu-invoice-storage')).not.toBe(await tone('webauthn-enrollment'));

  // E on a child that isn't a group changes nothing.
  await select(page, 'eu-invoice-storage');
  await page.keyboard.press('e');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');

  await page.keyboard.press('Shift+E');
  await expect(card(page, 'eu-data-residency').first()).toBeVisible();
  // Folded back, the child shows only in the group's frame again, with no chip.
  await expect(page.locator('.parent-chip', { hasText: 'EU data residency' })).toHaveCount(0);
  await expect(page.locator('.frame[data-frame="eu-data-residency"] .card[data-item="eu-invoice-storage"]').first()).toBeAttached();

  // Expanded groups are remembered, like the view.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(chip(page, 'webauthn-enrollment')).toHaveText('Passwordless login');
});

test('an epic inside an expanded initiative expands too, and ⇧E folds one level at a time', async ({ page }) => {
  await openApp(page);
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await expect(chip(page, 'regional-pipeline-shards')).toHaveText('EU data residency');

  // The bug this replaces: E on the expanded epic folded the initiative.
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('e');
  await expect(card(page, 'regional-pipeline-shards')).toHaveCount(0);
  await expect(chip(page, 'eu-kafka-cluster')).toHaveText('Regional pipeline shards');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');

  // ⇧E on a story folds only its epic.
  await select(page, 'eu-kafka-cluster');
  await page.keyboard.press('Shift+E');
  await expect(chip(page, 'regional-pipeline-shards')).toHaveText('EU data residency');
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');
});

