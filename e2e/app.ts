import { pathToFileURL } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

export const APP_URL = pathToFileURL(new URL('../dist/index.html', import.meta.url).pathname).href;

/**
 * Open the app, loading the sample plan if the board is empty (every test
 * starts with fresh storage). Help no longer opens by itself (Q53); the
 * check stays so an older habit can't leave it covering cards.
 */
export async function openApp(page: Page, { keepHelp = false } = {}) {
  await page.goto(APP_URL);
  const loadButton = page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' });
  await page.getByTestId('board').or(loadButton).waitFor();
  if (await loadButton.isVisible()) {
    await loadButton.click();
    // The sample opens on Roadmap (Q52); most tests start from the Sequence view.
    await page.getByTestId('preset-sequence').click();
  }
  await page.getByTestId('board').waitFor();
  if (!keepHelp && (await page.getByTestId('legend').isVisible())) {
    await page.getByRole('button', { name: 'Close help' }).click();
  }
}

/**
 * Make this browser look like one an earlier build used, then reload: `board` (a Yjs update) in the
 * version 1 database where builds before sprint 10 kept it, `storage` as its localStorage, and none
 * of this build's plans.
 */
export async function asEarlierBrowser(page: Page, board: readonly number[], storage: Record<string, string> = {}) {
  await page.goto(APP_URL);
  await page.getByTestId('board').or(page.locator('.empty-state')).waitFor();
  await page.evaluate(
    async ({ bytes, entries }) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('planning-board:v1:default');
        open.onupgradeneeded = () => {
          open.result.createObjectStore('updates', { autoIncrement: true });
          open.result.createObjectStore('custom');
        };
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const tx = open.result.transaction('updates', 'readwrite');
          tx.objectStore('updates').add(new Uint8Array(bytes));
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      });
      // The page still has its plan open, so a delete waits for the reload to let go of it.
      for (const db of await indexedDB.databases()) {
        if (!db.name?.startsWith('planning-board:v2:')) continue;
        await new Promise<void>((resolve) => {
          const del = indexedDB.deleteDatabase(db.name!);
          del.onsuccess = del.onerror = del.onblocked = () => resolve();
        });
      }
    },
    { bytes: [...board], entries: storage },
  );
  await page.reload();
}

/** Switch to another of the browser's plans from the File menu (ADR 0021). */
export async function switchPlan(page: Page, name: string) {
  await page.getByTestId('file-menu').click();
  await page.getByRole('menu').getByRole('menuitem', { name, exact: true }).click();
  await expect(page.getByTestId('plan-name')).toHaveText(name);
}

/** The plans the File menu lists, in its order: last opened first. */
export async function planList(page: Page): Promise<string[]> {
  await page.getByTestId('file-menu').click();
  const items = page.getByRole('menu').locator('.menu-heading ~ [role="menuitem"]');
  const names = await items.allTextContents();
  await page.keyboard.press('Escape');
  return names.map((n) => n.replace(/^✓ /, ''));
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

/**
 * A card's own copies. A group's faded "via children" copies, and copies
 * framed by a collapsed group (Q33), are left out; ask for those explicitly.
 * Cards in an expanded group's frame (Q57) are on the board, so they count.
 */
export function card(scope: Page | Locator, itemId: string) {
  return scope.locator(`.card[data-item="${itemId}"]:not(.via-children):not(.frame-via .card)`);
}

/**
 * The name on the expanded group's frame a card sits in (Q57), which is
 * what its group chip used to say; nothing if it isn't in one. Pass the
 * card's id when it may itself head a frame, so its own frame is skipped.
 */
export function frameName(cardLocator: Locator, id?: string) {
  const notOwn = id === undefined ? '' : `[not(div[contains(@class, "frame-head")]/*[@data-item="${id}"])]`;
  return cardLocator
    .locator(`xpath=ancestor::div[contains(concat(" ", @class, " "), " frame-open ")]${notOwn}[1]/div[contains(@class, "frame-head")]`)
    .locator('.frame-title, .card-title');
}

/** A card shown in an expanded group's frame (Q57), directly rather than in a frame inside it. */
export function inFrame(scope: Page | Locator, group: string, itemId: string) {
  return scope.locator(`.frame-open[data-frame="${group}"] > .card[data-item="${itemId}"]`);
}

/**
 * Scroll an element to the middle of the board. Just scrolling it into view
 * can leave it under the pinned headers or holding lanes.
 */
export async function reveal(locator: Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
}

/**
 * Double-click empty space in a cell: just below its last card (inside the
 * cell's padding at worst), scrolled to the middle of the board so the
 * pinned headers and holding lanes can't be in the way.
 */
export async function doubleClickEmpty(page: Page, target: Locator) {
  await reveal(target);
  const spot = () =>
    target.evaluate((el) => {
      const cards = el.querySelectorAll('.card');
      const box = el.getBoundingClientRect();
      const last = cards[cards.length - 1]?.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: last ? last.bottom + 4 : box.top + 20 };
    });
  const first = await spot();
  await page.locator('.board-scroll').evaluate((scroller, y) => {
    const r = scroller.getBoundingClientRect();
    scroller.scrollTop += y - (r.top + r.height / 2);
  }, first.y);
  const { x, y } = await spot();
  await page.mouse.dblclick(x, y);
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
  // A cell taller than the board is centered with its top under the pinned headers: aim below them.
  const headers = await page.evaluate(() => {
    const bottom = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0;
    return Math.max(bottom('.column-header'), bottom('.corner'));
  });
  const y = Math.min(b.y + b.height - 4, Math.max(b.y + Math.min(b.height / 2, 30), headers + 12));
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(b.x + b.width / 2, y, { steps: 8 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
}

/** Expand a group in place (ADR 0013): select it, then E. Its children take its place, marked with it. */
export async function expandGroup(group: Locator) {
  await reveal(group);
  await group.locator('.card-title').click();
  await group.page().keyboard.press('e');
}

/**
 * Start dragging `from` and rest it over `to` long enough to nest (hold to
 * nest, about half a second). Leaves the mouse down: the caller drops.
 */
export async function holdOver(page: Page, from: Locator, to: Locator, ms = 800) {
  await reveal(from);
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await reveal(to);
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.waitForTimeout(ms);
}

/** Unfold, or fold, every band of an axis's property, such as System (ADR 0013). */
export async function foldAll(page: Page, property: string, folded: boolean) {
  await page
    .getByRole('group', { name: `Fold ${property}` })
    .getByRole('button', { name: folded ? 'Fold all' : 'Unfold all', exact: true })
    .click();
}

/**
 * Wait until the board's edits so far are in browser storage, before a reload. The storage provider starts a
 * write as each edit happens, and IndexedDB doesn't start a later read of the same store until earlier writes
 * finish, so one read is enough. (Reloading right after an edit can otherwise beat the write on a slow runner.)
 */
export async function storageSettled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        // The open plan's own database (ADR 0021).
        const name = document.querySelector<HTMLElement>('.app')?.dataset.planDb ?? 'planning-board:v2:default';
        const open = indexedDB.open(name);
        open.onerror = () => reject(new Error(`Couldn't open storage: ${String(open.error)}`));
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('updates', 'readonly');
          tx.objectStore('updates').count();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(new Error(`Couldn't read storage: ${String(tx.error)}`));
        };
      }),
  );
}
