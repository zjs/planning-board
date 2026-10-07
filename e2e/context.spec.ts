import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, inFrame, openApp, pickAxes, reveal } from './app.ts';

// Children in context (Q33, Q57): frames around faded copies, and expanding groups in place, each in its own frame.

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

/** A card shown in an expanded group's frame. */
const framed = (page: Page, group: string, id: string) => inFrame(page, group, id).first();
const header = (page: Page, group: string) => page.locator(`.frame-open[data-frame="${group}"]`).first();

test('a faded group frames the cards that put it there, and dragging one changes that card', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  // EU data residency is a Data Platform group; Region-pinned directory sync puts it in Identity, Q3.
  const frame = cell(page, 'identity', 'q3').locator('.frame-via[data-frame="eu-data-residency"]');
  await expect(frame.locator('.card.via-children[data-item="eu-data-residency"]')).toBeVisible();
  const child = frame.locator('.card[data-item="region-pinned-directory-sync"]');
  await expect(child).toBeVisible();

  await dragTo(page, child, cell(page, 'billing', 'q3'));
  await expect(cell(page, 'billing', 'q3').locator('.frame-via[data-frame="eu-data-residency"] .card[data-item="region-pinned-directory-sync"]')).toBeVisible();
  await expect(cell(page, 'identity', 'q3').locator('.frame-via[data-frame="eu-data-residency"]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(child).toBeVisible();
});

test('E expands groups in place, each in its own frame; ⇧E on a child collapses its group back', async ({ page }) => {
  await openApp(page);
  await select(page, 'eu-data-residency', 'passwordless-login');
  await page.keyboard.press('e');
  // Each group frames its own cards, with no chips (Q57).
  await expect(header(page, 'eu-data-residency')).toBeAttached();
  await expect(framed(page, 'eu-data-residency', 'eu-invoice-storage')).toBeAttached();
  await expect(framed(page, 'passwordless-login', 'webauthn-enrollment')).toBeAttached();
  await expect(page.locator('.parent-chip')).toHaveCount(0);

  // E on a child that isn't a group changes nothing.
  await select(page, 'eu-invoice-storage');
  await page.keyboard.press('e');
  await expect(framed(page, 'eu-data-residency', 'eu-invoice-storage')).toBeAttached();

  await page.keyboard.press('Shift+E');
  await expect(card(page, 'eu-data-residency').first()).toBeVisible();
  // Collapsed, the child shows only in the group's faded frame again.
  await expect(page.locator('.frame-open[data-frame="eu-data-residency"]')).toHaveCount(0);
  await expect(page.locator('.frame-via[data-frame="eu-data-residency"] .card[data-item="eu-invoice-storage"]').first()).toBeAttached();

  // Expanded groups are remembered, like the view.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(framed(page, 'passwordless-login', 'webauthn-enrollment')).toBeAttached();
});

test('an epic inside an expanded initiative expands too, and ⇧E folds one level at a time', async ({ page }) => {
  await openApp(page);
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await expect(framed(page, 'eu-data-residency', 'regional-pipeline-shards')).toBeAttached();

  // The bug this replaces: E on the expanded epic folded the initiative. Now the epic's frame nests in the initiative's.
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('e');
  await expect(page.locator('.frame-open[data-frame="eu-data-residency"] .frame-open[data-frame="regional-pipeline-shards"]').first()).toBeAttached();
  await expect(framed(page, 'regional-pipeline-shards', 'eu-kafka-cluster')).toBeAttached();
  await expect(framed(page, 'eu-data-residency', 'eu-invoice-storage')).toBeAttached();

  // ⇧E on a story collapses only its epic.
  await select(page, 'eu-kafka-cluster');
  await page.keyboard.press('Shift+E');
  await expect(framed(page, 'eu-data-residency', 'regional-pipeline-shards')).toBeAttached();
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
  await expect(framed(page, 'eu-data-residency', 'eu-invoice-storage')).toBeAttached();
});

