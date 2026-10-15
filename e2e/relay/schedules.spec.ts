import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { dragTo, pickAxes } from '../app.ts';

// Random schedules through the real app and the real relay (ADR 0024): the slow companion to
// src/commands/schedules.test.ts, which runs hundreds of schedules in memory. Here two people in their own browsers
// drag cards, go offline and reload, on a seeded schedule, through the Go relay and IndexedDB. Afterwards, with both
// online, they must have one plan. A failing seed is in the test's name.

const SEEDS = [1, 2, 3];
const STEPS = 14;

function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]! };
}

async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

/** Which cell each card is in, on this board: the same on two boards in the same view means the same placements. */
function placements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.cell .card[data-item], .holding-cell .card[data-item]')]
      .filter((c) => !c.classList.contains('via-children'))
      .map((c) => {
        const lane = c.closest<HTMLElement>('.cell, .holding-cell')!;
        return `${c.dataset.item}@${lane.dataset.row ?? '-'}/${lane.dataset.column ?? '-'}`;
      })
      .sort(),
  );
}

async function save(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  const plan = JSON.parse(await readFile(await (await download).path(), 'utf8')) as { items: { id: string }[] };
  return [...plan.items].sort((a, b) => a.id.localeCompare(b.id));
}

for (const seed of SEEDS) {
  test(`seed ${seed}: two people drag, go offline and reload, and end with one plan`, async ({ browser }) => {
    test.setTimeout(180_000);
    const rng = random(seed);
    const log: string[] = [];
    const ada = await person(browser, 'Ada');
    await ada.goto('/');
    await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
    await ada.getByTestId('share-button').click();
    await ada.getByTestId('share-start').click();
    const link = await ada.getByTestId('edit-link').inputValue();
    await ada.getByRole('button', { name: 'Done' }).click();
    const bo = await person(browser, 'Bo');
    await bo.goto(link);
    await expect(bo.getByTestId('connection-state')).toHaveText('Live');
    const people = [
      { name: 'Ada', page: ada, online: true },
      { name: 'Bo', page: bo, online: true },
    ];
    for (const p of people) await pickAxes(p.page, 'time', 'system');

    for (let i = 0; i < STEPS; i++) {
      const p = rng.pick(people);
      const roll = rng.next();
      if (roll < 0.6) {
        // Drag a card into a cell.
        const cards = await p.page.locator('.cell .card[data-item]:not(.via-children)').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.item!));
        const cells = await p.page.locator('.cell[data-row][data-column]').evaluateAll((cs) => cs.map((c) => `${(c as HTMLElement).dataset.row}|${(c as HTMLElement).dataset.column}`));
        const id = rng.pick(cards);
        const [row, column] = rng.pick(cells).split('|');
        await dragTo(p.page, p.page.locator(`.card[data-item="${id}"]:not(.via-children)`).first(), p.page.locator(`.cell[data-row="${row}"][data-column="${column}"]`));
        log.push(`${p.name} drags ${id} to ${row}/${column}`);
      } else if (roll < 0.85) {
        p.online = !p.online;
        await p.page.context().setOffline(!p.online);
        log.push(`${p.name} goes ${p.online ? 'online' : 'offline'}`);
      } else if (p.online) {
        // A reload starts again from what the browser saved. The page comes from the relay, so it can't reload offline.
        await p.page.reload();
        await p.page.getByTestId('board').waitFor();
        await pickAxes(p.page, 'time', 'system');
        log.push(`${p.name} reloads`);
      }
    }

    for (const p of people) {
      await p.page.context().setOffline(false);
      await expect(p.page.getByTestId('connection-state'), log.join('\n')).toHaveText('Live', { timeout: 30_000 });
    }
    await expect.poll(async () => JSON.stringify(await placements(ada)) === JSON.stringify(await placements(bo)), { message: log.join('\n'), timeout: 30_000 }).toBe(true);
    expect(await save(bo), log.join('\n')).toEqual(await save(ada));
  });
}
