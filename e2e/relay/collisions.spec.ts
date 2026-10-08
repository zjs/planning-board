import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { card, cell, holding, pickAxes, reveal } from '../app.ts';

// Two people reaching for one card (sprint 12, slice 2; Q60): drags show on everyone's board, a second drag is
// warned, and when both drop, the later drop wins and both are told, each with a way back.

async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

async function sharedSample(ada: Page): Promise<string> {
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-start').click();
  const edit = await ada.getByTestId('edit-link').inputValue();
  await ada.getByRole('button', { name: 'Done' }).click();
  return edit;
}

/** Pick a card up and hold it over empty space in a cell, without dropping: resting on a card would nest it. */
async function hold(page: Page, from: Locator, to: Locator) {
  await reveal(from);
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await reveal(to);
  const b = (await to.boundingBox())!;
  // Just below the cell's last card: empty, and clear of the holding lanes pinned to the board's edges.
  const cards = await to.locator('.card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  const y = cards.length > 0 ? Math.max(...cards) + 6 : b.y + 20;
  await page.mouse.move(b.x + b.width / 2, y, { steps: 8 });
}

const id = 'sso-enforcement-per-workspace';
const title = 'SSO enforcement per workspace';

test('a drag shows on everyone’s board; when two drop the same card, both are told, each with a way back', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  const link = await sharedSample(ada);
  const bo = await person(browser, 'Bo');
  await bo.goto(link);
  await expect(bo.getByTestId('connection-state')).toHaveText('Live');
  await pickAxes(ada, 'time', 'system');
  await pickAxes(bo, 'time', 'system');

  // Ada picks the card up and holds it over Billing, Q3: Bo sees who's moving it, and where.
  await hold(ada, card(holding(ada, { row: 'identity' }), id), cell(ada, 'billing', 'q3'));
  await expect(bo.locator('.presence-tag.moving[data-person="Ada"]')).toContainText(/Ada is moving this → .*Billing/);
  // Bo reaches for the same card: his drag says Ada has it.
  await hold(bo, card(holding(bo, { row: 'identity' }), id), cell(bo, 'billing', 'q4'));
  await expect(bo.getByTestId('drag-warning')).toHaveText('Ada is moving this too');

  // Ada drops first; then Bo, whose later drop wins.
  await ada.mouse.up();
  await expect(card(cell(ada, 'billing', 'q3'), id)).toBeVisible();
  await bo.waitForTimeout(500); // Ada's drop reaches Bo, still holding the card
  await bo.mouse.up();
  await expect(card(cell(ada, 'billing', 'q4'), id)).toBeVisible();
  await expect(bo.getByTestId('notice')).toContainText(`Ada moved “${title}” just before you. Yours stuck.`);
  await expect(ada.getByTestId('notice')).toContainText(`Bo moved “${title}” after you`);

  // Ada's way back is a fresh drop of her own, which then shows on Bo's board too.
  await ada.getByTestId('notice').getByRole('button', { name: 'Put it back' }).click();
  await expect(card(cell(ada, 'billing', 'q3'), id)).toBeVisible();
  await expect(card(cell(bo, 'billing', 'q3'), id)).toBeVisible();
});
