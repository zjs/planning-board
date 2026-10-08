import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { card, dragTo, holding, openApp, reveal, storageSettled } from './app.ts';

// Sprint 8's exit criteria (docs/sprint-8.md) 1–7, end to end, in order. If this passes, the walkthrough in
// docs/demos/sprint-8.md works.

const OLD_PLAN = new URL('../src/domain/__fixtures__/compat/sprint-7.plan.json', import.meta.url);
const SAMPLE_CSV = new URL('../docs/samples/jira-export.csv', import.meta.url);
const notice = (page: Page) => page.getByTestId('notice');
const inspector = (page: Page) => page.getByTestId('inspector');
const frame = (page: Page, group: string) => page.locator(`.frame-open[data-frame="${group}"]`);
const related = (page: Page) => page.locator('.dep-line.related');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

async function addInside(page: Page, parent: string, title: string) {
  await select(page, parent);
  if (!(await inspector(page).isVisible())) await page.keyboard.press('i');
  await inspector(page).getByRole('button', { name: 'Add a card inside' }).click();
  const field = page.getByRole('textbox', { name: 'Card title' }).first();
  await field.fill(title);
  await field.press('Enter');
}

interface PlanFile {
  items: { id: string; title: string; parent?: string; rank?: string }[];
  dependencies?: unknown[];
}

test('sprint 8 exit criteria', async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();

  // 1. Expand Passwordless login: its cards are framed, its own card heads the frame with its badges, ▾ collapses it.
  await select(page, 'passwordless-login');
  await page.keyboard.press('e');
  const own = frame(page, 'passwordless-login').filter({ has: page.locator('.frame-head > .card[data-item="passwordless-login"]') });
  await expect(own.locator('.frame-head .attr[data-property="level"]')).toHaveText('Epic');
  await expect(holding(page, { row: 'identity' }).locator('.frame-open[data-frame="passwordless-login"] .frame-title')).toHaveText(
    'Passwordless login',
  );
  await expect(page.locator('.parent-chip')).toHaveCount(0);
  await reveal(own);
  await own.locator('.frame-head .zoom-into').click();
  await expect(frame(page, 'passwordless-login')).toHaveCount(0);

  // 2. Frames nest three deep, and a fourth level shows a breadcrumb.
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('e');
  await addInside(page, 'eu-kafka-cluster', 'Broker sizing');
  const broker = (await page.locator('.card', { hasText: 'Broker sizing' }).first().getAttribute('data-item'))!;
  await addInside(page, broker, 'Partition plan');
  await expect(page.locator(`.frame-open[data-frame="regional-pipeline-shards"] > .frame-open[data-frame="${broker}"] .frame-trail`)).toHaveText(
    'EU Kafka cluster ›',
  );
  await page.keyboard.press('i');

  // 3. ⌥L relates two cards: a dotted line, listed in the inspector, nothing red; ⌥L again removes it, ⌘Z restores it.
  const red = await page.locator('.dep-line.problem').count();
  await select(page, 'oidc-provider-support', 'login-anomaly-alerts');
  await page.keyboard.press('Alt+KeyL');
  await expect(related(page)).toHaveCount(1);
  await expect(related(page).first()).not.toHaveAttribute('marker-end', /.*/);
  await expect(page.locator('.dep-line.problem')).toHaveCount(red);
  await select(page, 'oidc-provider-support');
  await page.keyboard.press('i');
  await expect(inspector(page).getByRole('list', { name: 'Related' })).toContainText('Login anomaly alerts');
  await page.keyboard.press('i');
  await select(page, 'oidc-provider-support', 'login-anomaly-alerts');
  await page.keyboard.press('Alt+KeyL');
  await expect(related(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(related(page)).toHaveCount(1);

  // 5. The area color: on the headers in Roadmap, in the view bar's key in Sizing, and in the cheat sheet.
  await page.getByTestId('preset-roadmap').click();
  await expect(page.locator('.band-y[data-band="identity"]')).toHaveAttribute('data-area', '0');
  await page.getByTestId('preset-sizing').click();
  await expect(page.getByTestId('area-key')).toContainText('Identity & Access');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByTestId('legend')).toContainText('The colored edge');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByTestId('legend')).toHaveCount(0);

  // 6. Collapse "No quarter" to a rail, drop a card on it, and reload: still collapsed.
  await page.getByTestId('preset-roadmap').click();
  const lane = holding(page, { row: 'identity' });
  const before = Number(await lane.locator('.holding-count').textContent());
  await page.getByRole('button', { name: 'Collapse the No quarter lane' }).click();
  const scim = card(page, 'scim-2-0-group-push').first();
  await reveal(scim);
  await dragTo(page, scim, lane);
  await expect(lane.locator('.holding-count')).toHaveText(String(before + 1));
  await storageSettled(page);
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.getByRole('button', { name: 'Show the No quarter lane' })).toBeVisible();

  // 4. A Jira CSV's Relates columns import as related links.
  await page.getByTestId('import-csv-input').setInputFiles(SAMPLE_CSV.pathname);
  const dialog = page.getByTestId('import-dialog');
  await dialog.getByRole('button', { name: 'Next: values →' }).click();
  await expect(dialog).toContainText('3 related links');
  await dialog.getByRole('button', { name: 'Import 53 cards' }).click();
  // The import opens as a plan of its own (ADR 0021): wait for it before typing.
  await expect(notice(page)).toContainText('Imported 53 cards');
  // It's a story inside an epic: find it, and Enter expands its group and selects it, which shows its links.
  await page.keyboard.press('/');
  await page.keyboard.type('Tamper-evident');
  await page.keyboard.press('Enter');
  await expect(related(page)).toHaveCount(1);
  await page.keyboard.press('Escape');

  // 7. A plan file from sprint 7 opens, and saves again with nothing lost.
  const old = JSON.parse(await readFile(OLD_PLAN, 'utf8')) as PlanFile;
  await page.getByTestId('open-plan-input').setInputFiles(OLD_PLAN.pathname);
  await expect(notice(page)).toContainText('Opened “sprint-7.plan.json”');
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  const saved = JSON.parse(await readFile(await (await download).path(), 'utf8')) as PlanFile;
  const shape = (f: PlanFile) => f.items.map((i) => [i.id, i.title, i.parent ?? null, i.rank ?? null]).sort();
  expect(shape(saved)).toEqual(shape(old));
  expect(saved.dependencies?.length).toBe(old.dependencies?.length);
});
