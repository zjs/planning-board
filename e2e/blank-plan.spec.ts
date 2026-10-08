import { expect, test, type Page } from '@playwright/test';
import { APP_URL, cell, doubleClickEmpty, openApp, pickAxes, planList, switchPlan } from './app.ts';

// Starting from scratch, and typing cards one after another (questions.md Q51).

const IDEAS = ['Pricing page refresh', 'Audit log export', 'Offline mode'];

async function typeIdeas(page: Page, ideas: string[]) {
  for (const idea of ideas) {
    await expect(page.getByTestId('draft-card').locator('textarea')).toBeFocused();
    await page.keyboard.type(idea);
    await page.keyboard.press('Enter');
  }
}

/** The sequence column each titled card is in. */
async function columnsOf(page: Page, titles: string[]) {
  return Promise.all(
    titles.map((title) =>
      page
        .locator('.cell', { has: page.locator('.card', { hasText: title }) })
        .first()
        .getAttribute('data-column'),
    ),
  );
}

test('a blank plan opens ready to type into, and Enter starts the next card', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Start a blank plan' }).click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.locator('.empty-note')).toContainText('No cards yet');
  // First-visit help would cover the card being named.
  await expect(page.getByTestId('legend')).toHaveCount(0);

  await typeIdeas(page, IDEAS);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draft-card')).toHaveCount(0);

  // Three cards, all in the one sequence column the first card started, with no area.
  await expect(page.locator('.card')).toHaveCount(3);
  const columns = await columnsOf(page, IDEAS);
  expect(new Set(columns).size).toBe(1);
  expect(columns[0]).not.toBeNull();
  await expect(page.locator(`.cell[data-row][data-column="${columns[0]}"]`)).toHaveCount(0);
  // Typing never reached the board's shortcuts (E would have said only a group can be expanded).
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // Each card is its own undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.card', { hasText: 'Offline mode' })).toHaveCount(0);

  // The plan survives a reload, with its built-in properties.
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(2);
  await page.getByTestId('axis-y').selectOption('size');
  await expect(page.locator('.row-header')).toContainText(['XS', 'S', 'M', 'L', 'XL']);
});

test('Enter on an empty field, or clicking away, stops adding cards', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Start a blank plan' }).click();
  await typeIdeas(page, ['First idea']);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('draft-card')).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(1);

  const column = (await columnsOf(page, ['First idea']))[0]!;
  await doubleClickEmpty(page, page.locator(`.holding-cell[data-column="${column}"]`));
  await page.keyboard.type('Second idea');
  await page.locator('.toolbar h1').click();
  await expect(page.getByTestId('draft-card')).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(2);
});

test('New blank plan is a plan of its own, beside the sample, and stops finding (Q66)', async ({ page }) => {
  await openApp(page);
  const cards = await page.locator('.card').count();
  await page.keyboard.press('/');
  await page.keyboard.type('sso');
  await page.locator('.toolbar h1').click();
  await expect(page.getByTestId('find-bar')).toBeVisible();
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'New blank plan' }).click();
  await expect(page.getByTestId('draft-card')).toBeVisible();
  await expect(page.getByTestId('plan-name')).toHaveText('Untitled plan');
  await expect(page.getByTestId('find-bar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Undo' })).toBeDisabled();

  expect(await planList(page)).toEqual(['Untitled plan', 'Sample plan']);
  await switchPlan(page, 'Sample plan');
  await expect(page.locator('.card')).toHaveCount(cards);
});

test('on any board, Enter after naming a new card starts the next in the same cell', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const target = cell(page, 'billing', 'q3');
  const before = await target.locator('.card').count();
  await doubleClickEmpty(page, target);
  await typeIdeas(page, ['Usage alerts', 'Invoice preview']);
  await expect(target.getByTestId('draft-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(target.locator('.card')).toHaveCount(before + 2);
});

test('a long brain dump keeps the next card’s field in view', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Start a blank plan' }).click();
  await typeIdeas(page, Array.from({ length: 16 }, (_, i) => `Idea number ${i + 1}`));
  await expect(page.getByTestId('draft-card')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(16);
});
