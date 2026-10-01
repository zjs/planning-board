import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, openApp, openGroup, pickAxes, reveal } from './app.ts';

// Sprint 4's exit criteria (docs/sprint-4.md) 1–10, end to end, on the sample plan. If this passes, the
// walkthrough in docs/demos/sprint-4.md works. An import replaces the board, so criterion 4 runs last.

const SAMPLE = new URL('../docs/samples/jira-export.csv', import.meta.url);
const inspector = (page: Page) => page.getByTestId('inspector');
const notice = (page: Page) => page.getByTestId('notice');
const rowOf = (page: Page, id: string) => card(page, id).first().locator('xpath=ancestor::*[contains(@class, "cell")][1]');
const toPlan = (page: Page) => page.getByTestId('zoom-bar').getByRole('button', { name: 'Plan', exact: true }).click();

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

test('sprint 4 exit criteria', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  // 1. The inspector: a size and a component without pivoting, then a quarter on three cards at once.
  await select(page, 'least-privilege-default-role');
  await page.keyboard.press('i');
  await inspector(page).getByLabel('Size', { exact: true }).selectOption('l');
  await expect(card(page, 'least-privilege-default-role').first().locator('.attr[data-property="size"]')).toHaveText('L');
  await inspector(page).getByLabel('Add System').selectOption('billing/invoicing');
  await expect(card(page, 'least-privilege-default-role')).toHaveCount(2);
  await select(page, 'credit-notes', 'vat-oss-reporting', 'least-privilege-default-role');
  const time = inspector(page).getByLabel('Time', { exact: true });
  await expect(time.locator('option:checked')).toHaveText('Mixed');
  await time.selectOption('q3');
  await expect(notice(page)).toContainText('Changed Time on 3 cards');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(time.locator('option:checked')).toHaveText('Mixed');

  // 2. A description, and a link removed from the inspector.
  await select(page, 'credit-notes', 'vat-oss-reporting');
  await page.keyboard.press('l');
  await select(page, 'credit-notes');
  await inspector(page).getByLabel('Description').fill('Needed before the Q2 audit.');
  const links = inspector(page).getByRole('region', { name: 'Dependencies' });
  await expect(links).toContainText('VAT OSS reporting');
  await links.getByRole('button', { name: 'Remove the link Credit notes → VAT OSS reporting' }).click();
  await expect(notice(page)).toContainText('Removed the link');
  await expect(links).not.toContainText('VAT OSS reporting');

  // 3. Levels: badges and heavier borders; a story containing an epic is flagged.
  const eu = card(page, 'eu-data-residency').first();
  await expect(eu.locator('.attr[data-property="level"]')).toHaveText('Initiative');
  await expect(eu).toHaveAttribute('data-weight', '2');
  await select(page, 'passwordless-login');
  await inspector(page).getByLabel('Level', { exact: true }).selectOption('story');
  await openGroup(card(page, 'passwordless-login').first());
  await select(page, 'webauthn-enrollment');
  await inspector(page).getByLabel('Level', { exact: true }).selectOption('epic');
  await expect(card(page, 'webauthn-enrollment').locator('.mismatch')).toHaveAttribute('title', /Epic, at or above its group's Story/);
  await toPlan(page);
  await page.keyboard.press('i');

  // 5. Components as rows: area bands, Identity's own lane, and the bottom lane only for cards with no system.
  await pickAxes(page, 'sequence', 'system:1');
  await expect(page.locator('.band-y[data-band="identity"]')).toBeVisible();
  await expect(rowOf(page, 'contractor-and-guest-identities')).toHaveAttribute('data-row', 'identity');
  const column = (await rowOf(page, 'custom-roles').getAttribute('data-column'))!;
  await dragTo(page, card(page, 'custom-roles'), page.locator(`.cell[data-row="identity"][data-column="${column}"]`));
  await expect(rowOf(page, 'custom-roles')).toHaveAttribute('data-row', 'identity');
  await expect(page.locator('.holding-bottom .card[data-item="contractor-and-guest-identities"]')).toHaveCount(0);

  // 6. Collapse and expand a band, and zoom from one; then quarters over releases.
  await page.getByRole('button', { name: 'Collapse Identity & Access' }).click();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveText('4 components');
  await page.getByRole('button', { name: 'Expand Identity & Access' }).click();
  const billing = page.locator('.band-y[data-band="billing"]');
  await reveal(billing);
  await billing.locator('.lane-zoom').click();
  await expect(page.locator('.row-header').first()).toHaveText('Invoicing');
  await page.keyboard.press('Escape');
  await expect(page.locator('.band-y')).toHaveCount(4);
  await pickAxes(page, 'time:1', 'system');
  await page.getByRole('button', { name: 'Collapse Q1 2027' }).click();
  await expect(page.locator('.column-header.lane-collapsed')).toHaveText('2 releases');

  // 7. Expand two groups in place, then fold one back.
  await pickAxes(page, 'sequence', 'system');
  await select(page, 'eu-data-residency', 'usage-based-pricing');
  await page.keyboard.press('e');
  await expect(card(page, 'eu-invoice-storage').locator('.parent-chip')).toHaveText('EU data residency');
  await expect(card(page, 'usage-dashboard').locator('.parent-chip')).toHaveText('Usage-based pricing');
  await select(page, 'usage-dashboard');
  await page.keyboard.press('e');
  await expect(card(page, 'usage-based-pricing').first()).toBeVisible();

  // 8. Zoom into two groups at once.
  await select(page, 'usage-based-pricing', 'public-api-v2');
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await expect(page.getByTestId('zoom-bar').locator('.crumb-current')).toHaveText('Usage-based pricing + 1');
  await expect(card(page, 'usage-dashboard').locator('.parent-chip')).toHaveText('Usage-based pricing');
  await expect(card(page, 'rate-limiting-v2').locator('.parent-chip')).toHaveText('Public API v2');
  await toPlan(page);
  // Fold EU back, so its frames show.
  await select(page, 'eu-invoice-storage');
  await page.keyboard.press('e');

  // 9. A faded copy is a frame around the cards that put it there; dragging one changes that card.
  await pickAxes(page, 'time', 'system');
  const child = cell(page, 'identity', 'q3').locator('.frame[data-frame="eu-data-residency"] .card[data-item="region-pinned-directory-sync"]');
  await expect(child).toBeVisible();
  await dragTo(page, child, cell(page, 'billing', 'q3'));
  await expect(cell(page, 'billing', 'q3').locator('.frame[data-frame="eu-data-residency"] .card[data-item="region-pinned-directory-sync"]')).toBeVisible();

  // 10. Reload without losing anything: the plan, collapsed bands, and expanded groups.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(cell(page, 'billing', 'q3').locator('.frame[data-frame="eu-data-residency"] .card[data-item="region-pinned-directory-sync"]')).toBeVisible();
  await pickAxes(page, 'time:1', 'system');
  await expect(page.locator('.column-header.lane-collapsed')).toHaveText('2 releases');
  await select(page, 'credit-notes');
  await page.keyboard.press('i');
  await expect(inspector(page).getByLabel('Description')).toHaveValue('Needed before the Q2 audit.');

  // 4. Import the sample Jira export: epics arrive as Epic, stories as Story, with their Jira keys.
  await page.getByTestId('import-csv-input').setInputFiles(SAMPLE.pathname);
  const dialog = page.getByTestId('import-dialog');
  await dialog.getByRole('button', { name: 'Next: values →' }).click();
  await dialog.getByRole('button', { name: 'Import 53 cards' }).click();
  const epic = page.locator('.card:not(.via-children):not(.frame .card)', { hasText: 'Enterprise SSO self-service' }).first();
  await expect(epic.locator('.attr[data-property="level"]')).toHaveText('Epic');
  await reveal(epic);
  await epic.locator('.card-title').click();
  await expect(inspector(page).locator('.inspector-meta .attr.key')).toHaveText('IDN-1');
  const story = page.locator('.card:not(.via-children):not(.frame .card)', { hasText: 'Zero-downtime index rebuild' }).first();
  await expect(story.locator('.attr[data-property="level"]')).toHaveText('Story');
});
