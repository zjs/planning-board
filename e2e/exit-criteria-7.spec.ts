import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_URL, cell, dragTo, holdOver, reveal } from './app.ts';

// Sprint 7's exit criteria (docs/sprint-7.md) 1–8, end to end, in order. If this passes, the walkthrough in
// docs/demos/sprint-7.md works.

const guide = (page: Page) => page.getByTestId('guide');
const step = (page: Page) => guide(page).locator('li[aria-current="step"] .guide-title');
const notice = (page: Page) => page.getByTestId('notice');
const cardTitled = (page: Page, title: string) => page.locator('.card', { hasText: title });

async function type(page: Page, ...lines: string[]) {
  for (const line of lines) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
}

/** Draw a box from empty space just above `first` to just inside `last`, in the same lane. */
async function boxOver(page: Page, lane: Locator, first: Locator, last: Locator) {
  await reveal(first);
  const l = (await lane.boundingBox())!;
  const a = (await first.boundingBox())!;
  const b = (await last.boundingBox())!;
  await page.mouse.move(l.x + 3, a.y - 3);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(l.x + l.width - 3, b.y + 6, { steps: 4 });
  await page.mouse.up();
}

test('sprint 7 exit criteria', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(APP_URL);

  // 1. Start a blank plan comes first, and the guide runs to the end without opening help.
  await expect(page.locator('.empty-state button.primary')).toHaveText('Start a blank plan');
  await page.locator('.empty-state button.primary').click();
  await expect(step(page)).toHaveText('Get your ideas down');
  // 2. (along the way) Ideas typed into one column stay in typing order.
  await type(page, 'Zebra crossing', 'Apple pie', 'Mango smoothie', 'Passwordless login', 'Audit log export');
  await expect(page.locator('.card-title')).toHaveText(['Zebra crossing', 'Apple pie', 'Mango smoothie', 'Passwordless login', 'Audit log export']);
  await expect(step(page)).toHaveText('Make a place for them');
  await page.getByTestId('add-y').click();
  await type(page, 'Identity');
  await expect(step(page)).toHaveText('Sort them');
  const identity = (await page.locator('.band-y', { hasText: 'Identity' }).getAttribute('data-band'))!;
  await dragTo(page, cardTitled(page, 'Passwordless login'), page.locator(`.cell:not(.gap)[data-row="${identity}"]`).first());
  await expect(step(page)).toHaveText('See them another way');
  await page.getByTestId('preset-sizing').click();
  await dragTo(page, cardTitled(page, 'Audit log export'), page.locator('.holding-cell[data-column="m"]:not([data-row])'));
  await expect(step(page)).toHaveText('Group them');
  await page.getByTestId('preset-sequence').click();
  await holdOver(page, cardTitled(page, 'Mango smoothie'), cardTitled(page, 'Audit log export'));
  await page.mouse.up();
  await expect(guide(page).getByRole('heading')).toHaveText('That’s the board');
  await expect(page.getByTestId('legend')).toHaveCount(0);
  await guide(page).getByRole('button', { name: 'Done' }).click();

  // 3. The sample opens on Roadmap, and a view is one click away.
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Load sample plan' }).click();
  await expect(page.getByTestId('preset-roadmap')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('preset-sequence').click();
  await expect(page.getByTestId('axis-x')).toHaveValue('sequence');
  await page.getByTestId('preset-roadmap').click();

  // 4. Box-select three cards in "No quarter" and drag them onto Q1. All three land; one undo puts them back.
  const lane = page.locator('.holding-cell[data-row="identity"]:not([data-column])');
  const waiting = lane.locator('.card[data-item]');
  const three = await waiting.evaluateAll((els) => els.slice(0, 3).map((el) => (el as HTMLElement).dataset.item!));
  await boxOver(page, lane, waiting.nth(0), waiting.nth(2));
  await dragTo(page, waiting.nth(0), cell(page, 'identity', 'q1'));
  await expect(notice(page)).toContainText('Moved 3 cards to Q1 2027 · Identity & Access');
  for (const id of three) await expect(cell(page, 'identity', 'q1').locator(`.card[data-item="${id}"]`)).toHaveCount(1);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  for (const id of three) await expect(lane.locator(`.card[data-item="${id}"]`)).toHaveCount(1);

  // 5. Rename a quarter from its header, and add one.
  await page.locator('.band-x', { hasText: 'Q1 2027' }).locator('.band-toggle').dblclick();
  await page.getByRole('textbox', { name: 'Rename Q1 2027' }).fill('Q1 FY27');
  await page.keyboard.press('Enter');
  await expect(page.locator('.band-x', { hasText: 'Q1 FY27' })).toHaveCount(1);
  await page.getByTestId('add-x').click();
  await type(page, 'Q1 2028');
  await expect(page.locator('.band-x', { hasText: 'Q1 2028' })).toHaveCount(1);

  // 6. A dragged card says where it would land; right-click shows every action with its key.
  const oidc = page.locator('.card[data-item="oidc-provider-support"]').first();
  await reveal(oidc);
  const o = (await oidc.boundingBox())!;
  await page.mouse.move(o.x + o.width / 2, o.y + 10);
  await page.mouse.down();
  await page.mouse.move(o.x + o.width / 2 + 20, o.y + 40, { steps: 4 });
  const target = cell(page, 'billing', 'q3');
  await reveal(target);
  const t = (await target.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + 30, { steps: 6 });
  await expect(page.getByTestId('drop-where')).toContainText('→ Q3 2027 · Billing');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await oidc.locator('.card-title').click({ button: 'right' });
  await expect(page.getByTestId('card-menu').getByRole('menuitem', { name: /^Inspect/ }).locator('.menu-key')).toHaveText('I');
  await page.keyboard.press('Escape');

  // 7. Groups expand and collapse; only bands fold.
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Collapse' })).toBeVisible();
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Fold', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('view-bar').getByRole('button', { name: 'Expand' })).toHaveCount(0);

  // 8. At 1280×720, the toolbar fits on one row.
  await page.setViewportSize({ width: 1280, height: 720 });
  expect((await page.locator('.toolbar').boundingBox())!.height).toBeLessThan(60);
});
