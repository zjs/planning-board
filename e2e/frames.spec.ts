import { expect, test, type Page } from '@playwright/test';
import { card, holding, openApp, reveal } from './app.ts';

// One look for a group's cards (Q57): an expanded group frames its cards wherever they land, holding lanes
// included, nests three deep, and collapses from the board.

const frame = (page: Page, group: string) => page.locator(`.frame-open[data-frame="${group}"]`);

async function select(page: Page, id: string) {
  const c = card(page, id).first();
  await reveal(c);
  await c.locator('.card-title').click();
}

async function addInside(page: Page, parent: string, title: string) {
  await select(page, parent);
  if (!(await page.getByTestId('inspector').isVisible())) await page.keyboard.press('i');
  await page.getByTestId('inspector').getByRole('button', { name: 'Add a card inside' }).click();
  const field = page.getByRole('textbox', { name: 'Card title' }).first();
  await field.fill(title);
  await field.press('Enter');
}

test('an expanded group heads its own frame, frames its cards elsewhere, and collapses from either', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  await select(page, 'passwordless-login');
  await page.keyboard.press('e');

  // In its own quarter, the group's own card heads the frame, with its badges and its count turned to ▾.
  const own = frame(page, 'passwordless-login').filter({ has: page.locator('.frame-head > .card[data-item="passwordless-login"]') });
  await expect(own.locator('.frame-head .attr[data-property="level"]')).toHaveText('Epic');
  await expect(own.locator('.frame-head .zoom-chevron')).toHaveText('▾');
  // A card with no quarter is framed in "No quarter", under a one-line title.
  const waiting = holding(page, { row: 'identity' }).locator('.frame-open[data-frame="passwordless-login"]');
  await expect(waiting.locator('.frame-title')).toHaveText('Passwordless login');
  await expect(waiting.locator(':scope > .card[data-item="webauthn-enrollment"]')).toBeVisible();
  await expect(page.locator('.parent-chip')).toHaveCount(0);

  // The title's ▾ collapses the group, and so does the count on its own card.
  await reveal(waiting);
  await waiting.getByRole('button', { name: 'Collapse Passwordless login' }).click();
  await expect(frame(page, 'passwordless-login')).toHaveCount(0);
  await select(page, 'passwordless-login');
  await page.keyboard.press('e');
  await reveal(own);
  await own.locator('.frame-head .zoom-into').click();
  await expect(frame(page, 'passwordless-login')).toHaveCount(0);
});

test('frames nest three deep; a fourth level sits in the third, under a breadcrumb', async ({ page }) => {
  await openApp(page);
  // EU data residency (initiative) › Regional pipeline shards (epic) › EU Kafka cluster (story).
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('e');
  await addInside(page, 'eu-kafka-cluster', 'Broker sizing');
  const third = page.locator(
    '.frame-open[data-frame="eu-data-residency"] .frame-open[data-frame="regional-pipeline-shards"] .frame-open[data-frame="eu-kafka-cluster"]',
  );
  await expect(third.locator('.card', { hasText: 'Broker sizing' })).toBeVisible();

  // A card inside Broker sizing is a fourth level: its frame sits beside the third, not inside it.
  const broker = page.locator('.card', { hasText: 'Broker sizing' }).first();
  const brokerId = (await broker.getAttribute('data-item'))!;
  await addInside(page, brokerId, 'Partition plan');
  const fourth = page.locator(`.frame-open[data-frame="regional-pipeline-shards"] > .frame-open[data-frame="${brokerId}"]`);
  await expect(fourth.locator('.frame-trail')).toHaveText('EU Kafka cluster ›');
  await expect(fourth.locator('.card', { hasText: 'Partition plan' })).toBeVisible();
  await expect(page.locator('.frame-open .frame-open .frame-open .frame-open')).toHaveCount(0);
});
