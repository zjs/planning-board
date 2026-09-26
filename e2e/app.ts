import { pathToFileURL } from 'node:url';
import type { Locator, Page } from '@playwright/test';

export const APP_URL = pathToFileURL(new URL('../dist/index.html', import.meta.url).pathname).href;

/**
 * Open the app, loading the sample plan if the board is empty (every test
 * starts with fresh storage), and close the first-run help so it doesn't
 * cover cards.
 */
export async function openApp(page: Page, { keepHelp = false } = {}) {
  await page.goto(APP_URL);
  const loadButton = page.locator('.empty-state button');
  await page.getByTestId('board').or(loadButton).waitFor();
  if (await loadButton.isVisible()) await loadButton.click();
  await page.getByTestId('board').waitFor();
  if (!keepHelp && (await page.getByTestId('legend').isVisible())) {
    await page.getByRole('button', { name: 'Close help' }).click();
  }
}

export async function pickAxes(page: Page, x: string, y: string) {
  // Pick Y first when X is currently Y's value, so the swap rule doesn't interfere.
  await page.getByTestId('axis-y').selectOption(y);
  await page.getByTestId('axis-x').selectOption(x);
}

export function cell(page: Page, row: string, column: string) {
  return page.locator(`.cell[data-row="${row}"][data-column="${column}"]`);
}

/**
 * A holding lane: at the end of a row (no column), under a column (no row),
 * or the corner (neither).
 */
export function holding(page: Page, lane: { row?: string; column?: string } = {}) {
  const row = lane.row === undefined ? ':not([data-row])' : `[data-row="${lane.row}"]`;
  const column = lane.column === undefined ? ':not([data-column])' : `[data-column="${lane.column}"]`;
  return page.locator(`.holding-cell${row}${column}`);
}

export function card(scope: Page | Locator, itemId: string) {
  return scope.locator(`.card[data-item="${itemId}"]`);
}

/**
 * Scroll an element to the middle of the board. Just scrolling it into view
 * can leave it under the pinned headers or holding lanes.
 */
export async function reveal(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
}

/** Drag with real pointer events, the way a mouse would. */
export async function dragTo(page: Page, from: Locator, to: Locator, opts: { alt?: boolean } = {}) {
  await reveal(from);
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  // Mid-drag, bring the target on screen (a person would use edge auto-scroll; tested separately).
  await reveal(to);
  const b = (await to.boundingBox())!;
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 30), { steps: 8 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
}
