import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_URL, cell, dragTo, openApp, reveal, storageSettled } from './app.ts';

// Sprint 7, slice 5: from a sequence to a timeline. Cards keep the order they were made in (Q46's MVP), a box
// selects a run of them, and dragging one moves them all (Q48).

const solid = (scope: Locator) => scope.locator('.card[data-item]:not(.via-children)');

/** How many cards are selected: each once, however many copies it has on the board. */
async function selectedCards(page: Page): Promise<number> {
  const ids = await page.locator('.card.selected[data-item]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.item));
  return new Set(ids).size;
}

/** Drag a box from one corner of `scope` to the other, starting on its empty edge. */
async function boxSelect(page: Page, scope: Locator, opts: { shift?: boolean } = {}) {
  await reveal(scope);
  const b = (await scope.boundingBox())!;
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(b.x + 3, b.y + b.height - 3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width - 3, b.y + 3, { steps: 4 });
  await expect(page.getByTestId('select-box')).toBeVisible();
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
  await expect(page.getByTestId('select-box')).toHaveCount(0);
}

test('ideas typed into one column stay in the order they were typed', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Start a blank plan' }).click();
  for (const title of ['Zebra crossing', 'Apple pie', 'Mango smoothie']) {
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.card-title')).toHaveText(['Zebra crossing', 'Apple pie', 'Mango smoothie']);
  // Still in that order after a reload.
  await storageSettled(page);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.card-title')).toHaveText(['Zebra crossing', 'Apple pie', 'Mango smoothie']);
});

test('a box selects the cards it touches, and dragging one moves them all in one undo step', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  const q1 = cell(page, 'identity', 'q1');
  const before = await solid(q1).count();
  expect(before).toBeGreaterThan(2);
  await boxSelect(page, q1);
  await expect.poll(() => selectedCards(page)).toBe(before);

  const moved = await solid(q1).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.item!));
  const ids = (scope: Locator) => solid(scope).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.item!));
  const q3 = cell(page, 'identity', 'q3');
  await dragTo(page, solid(q1).first(), q3);
  await expect(page.getByTestId('notice')).toContainText(`Moved ${before} cards to Q3 2027 · Identity & Access`);
  // Every selected card left Q1 for Q3. (A group's child that stays in Q1 shows there in its group's frame.)
  await expect.poll(async () => (await ids(q1)).filter((id) => moved.includes(id))).toEqual([]);
  await expect.poll(async () => {
    const there = await ids(q3);
    return moved.filter((id) => !there.includes(id));
  }).toEqual([]);
  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await ids(q1)).filter((id) => moved.includes(id)).sort()).toEqual([...moved].sort());
});

test('⇧ adds a box to the selection; a click on empty space still clears it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  const q1 = cell(page, 'identity', 'q1');
  const q2 = cell(page, 'identity', 'q2');
  await boxSelect(page, q1);
  const n1 = await selectedCards(page);
  await boxSelect(page, q2, { shift: true });
  const both = await selectedCards(page);
  expect(both).toBeGreaterThan(n1);
  const b = (await q2.boundingBox())!;
  await page.mouse.click(b.x + 3, b.y + b.height - 3);
  await expect(page.locator('.card.selected')).toHaveCount(0);
});

test('a dragged selection says how many cards are moving', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  const q1 = cell(page, 'identity', 'q1');
  await boxSelect(page, q1);
  const n = await selectedCards(page);
  const first = solid(q1).first();
  await reveal(first);
  const a = (await first.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 30, a.y + 40, { steps: 5 });
  await expect(page.locator('.drag-ghost .ghost-count')).toHaveText(`+${n - 1} more`);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});
