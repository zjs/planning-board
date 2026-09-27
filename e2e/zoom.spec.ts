import { expect, test, type Page } from '@playwright/test';
import { card, doubleClickEmpty, dragTo, openApp } from './app.ts';

const EU = 'eu-data-residency';
const zoomBar = (page: Page) => page.getByTestId('zoom-bar');
const crumb = (page: Page, label: string) => zoomBar(page).getByRole('button', { name: label, exact: true });


test('double-clicking a group zooms in to its children, with its own values; Esc zooms back out', async ({ page }) => {
  await openApp(page);
  await expect(zoomBar(page)).toHaveCount(0);
  await card(page, EU).dblclick();

  await expect(zoomBar(page)).toContainText('EU data residency');
  await expect(crumb(page, 'Plan')).toBeVisible();
  // The group's own values (Q19), in full.
  await expect(zoomBar(page).locator('.zoom-values')).toContainText('Size: XL');
  await expect(zoomBar(page).locator('.zoom-values')).toContainText('Time: Q2 2027 › 27.3');
  // Only its four children are on the board; a grandchild stays inside its own group.
  for (const id of ['regional-pipeline-shards', 'eu-invoice-storage', 'region-pinned-directory-sync', 'residency-setting-in-console']) {
    await expect(card(page, id).first()).toBeVisible();
  }
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
  await expect(card(page, 'custom-roles')).toHaveCount(0);

  // The zoom level survives a reload.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(zoomBar(page)).toContainText('EU data residency');

  await page.keyboard.press('Escape');
  await expect(zoomBar(page)).toHaveCount(0);
  await expect(card(page, EU)).toHaveClass(/selected/);
});

test('nested zoom shows the path, and a breadcrumb segment zooms out to that level', async ({ page }) => {
  await openApp(page);
  await card(page, EU).dblclick();
  await card(page, 'regional-pipeline-shards').first().dblclick();
  await expect(zoomBar(page).locator('.crumbs')).toHaveText(/Plan.*EU data residency.*Regional pipeline shards/);
  await expect(card(page, 'eu-kafka-cluster')).toBeVisible();

  await crumb(page, 'EU data residency').click();
  await expect(card(page, 'regional-pipeline-shards').first()).toBeVisible();
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0);
  await crumb(page, 'Plan').click();
  await expect(zoomBar(page)).toHaveCount(0);
});

test('cards made inside a group become its children; dragging one to the breadcrumb moves it out', async ({ page }) => {
  await openApp(page);
  await card(page, EU).dblclick();
  const target = page.locator('.cell:not(.gap):not(.holding-cell)').first();
  await doubleClickEmpty(page, target);
  await page.keyboard.type('Residency audit trail');
  await page.keyboard.press('Enter');
  const created = page.locator('.card', { hasText: 'Residency audit trail' });
  await expect(created).toBeVisible();
  // With something selected, the first Esc only clears the selection.
  await expect(created).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(created).not.toHaveClass(/selected/);
  await expect(zoomBar(page)).toBeVisible();

  await card(page, 'eu-invoice-storage').first().click();
  await dragTo(page, card(page, 'eu-invoice-storage').first(), crumb(page, 'Plan'));
  await expect(card(page, 'eu-invoice-storage')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toContainText('Moved “EU invoice storage” out to the plan');
  // It left the view, so it's no longer selected: Delete can't reach it.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('notice')).toContainText('Moved');

  // Nothing is selected any more, so Esc zooms straight out.
  await page.keyboard.press('Escape');
  // 4 children, plus the new one, minus the one moved out.
  await expect(card(page, EU).locator('.child-count')).toHaveText('4');
  await expect(card(page, 'eu-invoice-storage').first()).toBeVisible();

  // Undo puts it back inside.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(page, EU).locator('.child-count')).toHaveText('5');
});

test('any card can be zoomed into, and its first child makes it a group (Q20)', async ({ page }) => {
  await openApp(page);
  const plain = card(page, 'idp-initiated-login');
  await expect(plain.locator('.child-count')).toHaveCount(0);
  await plain.click();
  // The toolbar button works too, and Esc still zooms out with the button focused.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomBar(page)).toContainText('Nothing inside yet');
  await page.keyboard.press('Escape');
  await expect(zoomBar(page)).toHaveCount(0);
  await plain.click();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await expect(zoomBar(page)).toContainText('Nothing inside yet');

  await doubleClickEmpty(page, page.locator('.cell:not(.gap):not(.holding-cell)').first());
  await page.keyboard.type('SP metadata upload');
  await page.keyboard.press('Enter');
  await expect(zoomBar(page)).not.toContainText('Nothing inside yet');

  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(plain.locator('.child-count')).toHaveText('1');
});
