import { expect, test, type Locator, type Page } from '@playwright/test';
import { card, dragTo, openApp, openGroup, reveal } from './app.ts';

// Order highlights, loops, removing a line, and group counts (requirements 16 and 18, Q37).

const line = (page: Page, from: string, to: string) => page.locator(`.dep-line[data-from="${from}"][data-to="${to}"]`);
const notice = (page: Page) => page.getByTestId('notice');
const cellOf = (c: Locator) => c.locator('xpath=ancestor::*[contains(@class, "cell")][1]');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

async function link(page: Page, from: string, to: string) {
  await select(page, from, to);
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked');
}

test('a prerequisite dragged to the right of its dependent turns red and stays drawn; dragging back clears it', async ({ page }) => {
  await openApp(page);
  // Both in Identity's first column, so in order.
  await link(page, 'custom-roles', 'least-privilege-default-role');
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await expect(line(page, 'custom-roles', 'least-privilege-default-role')).toHaveCount(0);

  const home = cellOf(card(page, 'custom-roles'));
  const homeKey = (await home.getAttribute('data-column'))!;
  await dragTo(page, card(page, 'custom-roles'), cellOf(card(page, 'resource-level-permissions')));
  await page.mouse.move(2, 2);
  const flagged = line(page, 'custom-roles', 'least-privilege-default-role');
  await expect(flagged).toHaveClass(/problem/);
  await expect(page.locator('.dep-hit[data-from="custom-roles"] title')).toHaveText(
    '“Custom roles” must come before “Least-privilege default role”, but it\'s to its right in the sequence.',
  );

  await dragTo(page, card(page, 'custom-roles'), page.locator(`.cell[data-row="identity"][data-column="${homeKey}"]`));
  await page.mouse.move(2, 2);
  await expect(flagged).toHaveCount(0);
});

test('a loop is flagged in every view (Q37)', async ({ page }) => {
  await openApp(page);
  await link(page, 'credit-notes', 'vat-oss-reporting');
  await link(page, 'vat-oss-reporting', 'credit-notes');
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveClass(/problem/);
  await expect(line(page, 'vat-oss-reporting', 'credit-notes')).toHaveClass(/problem/);

  await page.getByTestId('axis-y').selectOption('size');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveClass(/problem/);
});

test('click a line and press Delete to remove it; undo brings it back', async ({ page }) => {
  await openApp(page);
  await link(page, 'credit-notes', 'vat-oss-reporting');
  await link(page, 'vat-oss-reporting', 'credit-notes');
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);

  const hit = page.locator('.dep-hit[data-from="credit-notes"][data-to="vat-oss-reporting"]');
  await hit.dispatchEvent('click');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(notice(page)).toContainText('Removed the link “Credit notes” → “VAT OSS reporting”');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(0);
  // The other half is no longer part of a loop.
  await expect(page.locator('.dep-hit title', { hasText: 'part of a loop' })).toHaveCount(0);

  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveClass(/problem/);
});

test('a collapsed group counts the flagged links inside it (requirement 18)', async ({ page }) => {
  await openApp(page);
  const marker = card(page, 'eu-data-residency').first().locator('.mismatch');
  const before = Number((await marker.textContent())!.replace(/\D/g, ''));

  // Custom roles → Region-pinned directory sync (inside EU data residency), and back: a loop.
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await openGroup(card(page, 'eu-data-residency').first());
  await select(page, 'region-pinned-directory-sync');
  await page.keyboard.press('l');
  // L again starts a link from it; zoom back out to finish it at the top level.
  await page.keyboard.press('l');
  await page.getByTestId('zoom-bar').getByRole('button', { name: 'Plan', exact: true }).click();
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Region-pinned directory sync” → “Custom roles”');

  await expect(marker).toHaveText(`⚠ ${before + 2}`);
  await expect(marker).toHaveAttribute('title', /“Custom roles” → “Region-pinned directory sync” is part of a loop/);
  // The loop is drawn to the group.
  await expect(line(page, 'custom-roles', 'eu-data-residency')).toHaveClass(/problem/);
});
