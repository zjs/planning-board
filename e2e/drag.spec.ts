import { expect, test } from '@playwright/test';
import { card, cell, dragTo, holding, openApp, pickAxes, reveal } from './app.ts';

// The sprint 0 exit criterion, end to end: drag, pivot, see the card where
// it should be, reload, and nothing is lost.
test('a drop writes both values, survives a pivot and a reload, and undoes', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const noQuarter = holding(page, { row: 'identity' });
  const id = 'sso-enforcement-per-workspace'; // Identity/SSO, sequenced, no quarter yet
  await expect(card(noQuarter, id)).toBeVisible();

  await dragTo(page, card(noQuarter, id), cell(page, 'billing', 'q3'));
  await expect(card(cell(page, 'billing', 'q3'), id)).toBeVisible();
  // It came from Identity's lane, so like any drop it moves out of Identity (Q10).
  await expect(card(page, id)).toHaveCount(1);

  await pickAxes(page, 'sequence', 'system');
  await expect(page.locator(`.cell[data-row="billing"] .card[data-item="${id}"]`)).toHaveCount(1);

  await page.reload();
  await page.getByTestId('board').waitFor();
  await pickAxes(page, 'time', 'system');
  await expect(card(cell(page, 'billing', 'q3'), id)).toBeVisible();

  // The undo stack doesn't survive a reload, so make a fresh change to undo.
  await dragTo(page, card(cell(page, 'billing', 'q3'), id), cell(page, 'billing', 'q4'));
  await expect(card(cell(page, 'billing', 'q4'), id)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(cell(page, 'billing', 'q3'), id)).toBeVisible();
  await expect(card(cell(page, 'billing', 'q4'), id)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(card(cell(page, 'billing', 'q4'), id)).toBeVisible();
});

test('dragging one copy of a multi-lane card moves only that lane', async ({ page }) => {
  await openApp(page);
  const id = 'tenant-data-deletion-gdpr'; // Identity, Billing, Data Platform
  await expect(card(page, id)).toHaveCount(3);
  const billingCopy = page.locator(`.cell[data-row="billing"] .card[data-item="${id}"]`);
  const column = await billingCopy.evaluate((el) => el.closest<HTMLElement>('.cell')!.dataset.column!);

  await dragTo(page, billingCopy, cell(page, 'cx', column));
  await expect(card(cell(page, 'cx', column), id)).toBeVisible();
  await expect(page.locator(`.cell[data-row="billing"] .card[data-item="${id}"]`)).toHaveCount(0);
  await expect(card(page, id)).toHaveCount(3);
});

test("an Alt-drop adds a lane, and a column's holding lane removes one", async ({ page }) => {
  await openApp(page);
  const id = 'tenant-data-deletion-gdpr';
  const dataCopy = page.locator(`.cell[data-row="data"] .card[data-item="${id}"]`);
  const column = await dataCopy.evaluate((el) => el.closest<HTMLElement>('.cell')!.dataset.column!);

  await dragTo(page, dataCopy, cell(page, 'cx', column), { alt: true });
  await expect(card(page, id)).toHaveCount(4);
  await expect(page.locator(`.cell[data-row="data"] .card[data-item="${id}"]`)).toHaveCount(1);

  const cxCopy = card(cell(page, 'cx', column), id);
  const scroller = page.locator('.board-scroll');
  await reveal(cxCopy);
  const before = await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  const from = (await cxCopy.boundingBox())!;
  const to = (await holding(page, { column }).boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 8 });
  // Hovering a pinned holding lane, well past the edge-scroll dwell, must not scroll the board under the pointer.
  await page.waitForTimeout(500);
  expect(await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(before);
  await page.mouse.up();
  // It still has its other areas, so it stays in their rows rather than landing in "No area".
  await expect(card(page, id)).toHaveCount(3);
  await expect(card(cell(page, 'cx', column), id)).toHaveCount(0);
  await expect(card(holding(page, { column }), id)).toHaveCount(0);
});

test("dropping a card in a row's holding lane clears only its column", async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const id = 'passwordless-login'; // Identity, Q1
  await dragTo(page, card(cell(page, 'identity', 'q1'), id), holding(page, { row: 'identity' }));
  await expect(card(holding(page, { row: 'identity' }), id)).toBeVisible();
  await expect(card(page, id)).toHaveCount(1);

  // From there, another row's lane changes the area and still sets no quarter.
  await dragTo(page, card(holding(page, { row: 'identity' }), id), holding(page, { row: 'billing' }));
  await expect(card(holding(page, { row: 'billing' }), id)).toBeVisible();
  await expect(card(page, id)).toHaveCount(1);

  // The corner clears the area too.
  await dragTo(page, card(holding(page, { row: 'billing' }), id), holding(page));
  await expect(card(holding(page), id)).toBeVisible();
});

test('Escape cancels a drag without changing anything', async ({ page }) => {
  await openApp(page);
  const id = 'tenant-data-deletion-gdpr';
  const from = page.locator(`.cell[data-row="billing"] .card[data-item="${id}"]`);
  await reveal(from);
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
  await expect(page.locator('.drag-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(from).toHaveCount(1);
  // The only undo step is loading the sample plan.
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
});

test('holding a dragged card near the board edge scrolls the board', async ({ page }) => {
  await openApp(page);
  const scroller = page.locator('.board-scroll');
  const box = (await scroller.boundingBox())!;
  // The scrolling area ends where the pinned "No area" lanes begin.
  const bottom = (await page.locator('.holding-row-header').boundingBox())!.y;
  const from = card(page, 'tenant-data-deletion-gdpr').first();
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + 10, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 40, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2, bottom - 8, { steps: 5 });
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('Reset clears the board and can be undone', async ({ page }) => {
  await openApp(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Reset board' }).click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
});

test('a drag released outside the window is cancelled, not left stuck', async ({ page }) => {
  await openApp(page);
  const from = card(page, 'tenant-data-deletion-gdpr').first();
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + 10, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 60, { steps: 4 });
  await expect(page.locator('.drag-ghost')).toBeVisible();
  // The pointerup happened outside the window; the next move arrives with no buttons held.
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, buttons: 0 })),
  );
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await page.mouse.up();
  await expect(card(page, 'tenant-data-deletion-gdpr')).toHaveCount(3);
});
