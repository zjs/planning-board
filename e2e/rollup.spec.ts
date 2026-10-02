import { expect, test } from '@playwright/test';
import { card, cell, openApp, expandGroup, pickAxes, reveal } from './app.ts';

const EU = 'eu-data-residency'; // Data Platform, Q2; one card inside is in Billing, Q2

test('a group shows faded copies where only its cards reach; they select but never drag (Q16)', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const faded = cell(page, 'billing', 'q2').locator(`.card.via-children[data-item="${EU}"]`);
  await expect(faded).toBeVisible();
  await expect(cell(page, 'data', 'q2').locator(`.card[data-item="${EU}"]:not(.via-children)`)).toBeVisible();

  // A click selects the group: every copy, solid and faded, highlights.
  await faded.click();
  await expect(page.locator(`.card.selected[data-item="${EU}"]`)).not.toHaveCount(1);

  // Dragging it does nothing: no ghost, and it stays put.
  await reveal(faded);
  const box = (await faded.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 6 });
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await page.mouse.up();
  await expect(faded).toBeVisible();

  // Double-clicking it expands the group in place (Q42): its cards take its place, marked with it.
  await faded.dblclick();
  await expect(page.locator(`.card[data-item="${EU}"]`)).toHaveCount(0);
  await expect(page.locator('.parent-chip', { hasText: 'EU data residency' }).first()).toBeVisible();
});

test('mismatch markers: a count on the collapsed group, and the reason on the card inside (req. 13, 18)', async ({
  page,
}) => {
  await openApp(page);
  const marker = card(page, EU).first().locator('.mismatch');
  await expect(marker).toHaveText('⚠ 4');
  await expect(marker).toHaveAttribute('title', /Region-pinned directory sync: Dated Q3 2027 › 27\.6, outside its group's Q2 2027 › 27\.3/);

  await expandGroup(card(page, EU).first());
  const child = card(page, 'region-pinned-directory-sync').first().locator('.mismatch');
  await expect(child).toHaveText('⚠');
  await expect(child).toHaveAttribute('title', /Dated Q3 2027 › 27\.6, outside its group's Q2 2027 › 27\.3/);
  await expect(child).toHaveAttribute('title', /In Identity & Access › Directory Sync, outside its group's Data Platform/);
});

test('Enter on a faded copy renames the group where its own copy is; Esc cancels, and shortcuts keep working', async ({
  page,
}) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  // In the Identity row, EU data residency (Data Platform) shows only through a card inside it. With no
  // zoom, the group always has its own copy somewhere on the board.
  const faded = page.locator(`.cell[data-row="identity"] .card.via-children[data-item="${EU}"]`).first();
  await reveal(faded);
  await expect(faded).toBeVisible();

  await faded.click();
  await page.keyboard.press('Enter');
  await expect(card(page, EU).getByRole('textbox', { name: 'Card title' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(0);
});
