import { expect, test } from '@playwright/test';
import { card, cell, openApp, openGroup, pickAxes, reveal } from './app.ts';

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

  // Double-clicking it zooms into the group.
  await faded.dblclick();
  await expect(page.getByTestId('zoom-bar')).toContainText('EU data residency');
});

test('mismatch markers: a count on the collapsed group, and the reason on the card inside (req. 13, 18)', async ({
  page,
}) => {
  await openApp(page);
  const marker = card(page, EU).first().locator('.mismatch');
  await expect(marker).toHaveText('⚠ 4');
  await expect(marker).toHaveAttribute('title', /Region-pinned directory sync: Dated Q3 2027 › 27\.6, outside its group's Q2 2027 › 27\.3/);

  await openGroup(card(page, EU).first());
  const child = card(page, 'region-pinned-directory-sync').first().locator('.mismatch');
  await expect(child).toHaveText('⚠');
  await expect(child).toHaveAttribute('title', /Dated Q3 2027 › 27\.6, outside its group's Q2 2027 › 27\.3/);
  await expect(child).toHaveAttribute('title', /In Identity & Access › Directory Sync, outside its group's Data Platform/);
});

test('Enter on a group seen only as a faded copy does nothing, and shortcuts keep working', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  // Zoomed into Identity, EU data residency (Data Platform) shows only through a card inside it.
  await page.locator('.row-header[data-row="identity"]').getByRole('button').click();
  const faded = page.locator(`.card.via-children[data-item="${EU}"]`).first();
  await expect(faded).toBeVisible();
  await expect(card(page, EU)).toHaveCount(0);

  await faded.click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(0);
});
