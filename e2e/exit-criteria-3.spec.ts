import { expect, test, type Locator, type Page } from '@playwright/test';
import { card, doubleClickEmpty, dragTo, expandGroup, foldAll, frameName, openApp, pickAxes, reveal } from './app.ts';

// Sprint 3's exit criteria (docs/sprint-3.md) 1–10, end to end, on the
// sample plan. An import replaces the board, so criterion 8 runs last. Zoom
// is gone since sprint 5 (ADR 0013): groups expand and fold, and time folds
// from releases to quarters.

const SAMPLE = new URL('../docs/samples/jira-export.csv', import.meta.url);
const line = (page: Page, from: string, to: string) => page.locator(`.dep-line[data-from="${from}"][data-to="${to}"]`);
const notice = (page: Page) => page.getByTestId('notice');
const cellOf = (c: Locator) => c.locator('xpath=ancestor::*[contains(@class, "cell")][1]');
/** Fold EU data residency back, from one of its cards. */
async function foldEU(page: Page) {
  await card(page, 'region-pinned-directory-sync').first().locator('.card-title').click();
  await page.keyboard.press('Shift+E');
}

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

/** Nothing selected or hovered: only flagged links stay drawn. */
async function unfocus(page: Page) {
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
}

test('sprint 3 exit criteria', async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  const groupMarker = card(page, 'eu-data-residency').first().locator('.mismatch');
  const markedBefore = Number((await groupMarker.textContent())!.replace(/\D/g, ''));

  // 1. Select two cards and press L. The link shows for the selected card, and undo removes it.
  await select(page, 'credit-notes', 'vat-oss-reporting');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Credit notes” → “VAT OSS reporting”');
  await select(page, 'credit-notes');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveClass(/focus/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(line(page, 'credit-notes', 'vat-oss-reporting')).toHaveCount(0);

  // 2. Link a card to one inside a group, with a pending link that survives expanding.
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await expect(page.getByTestId('link-bar')).toContainText('Linking from “Custom roles”');
  await expandGroup(card(page, 'eu-data-residency').first());
  await select(page, 'region-pinned-directory-sync');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Custom roles” → “Region-pinned directory sync”');
  await foldEU(page);
  await select(page, 'custom-roles');
  // Drawn to the group the card is in (Q38).
  await expect(line(page, 'custom-roles', 'eu-data-residency')).toHaveClass(/focus/);
  await unfocus(page);

  // 3. In a sequence view, drag a prerequisite to the right of its dependent: red, and stays drawn. Back: clear.
  await select(page, 'custom-roles', 'least-privilege-default-role');
  await page.keyboard.press('l');
  await unfocus(page);
  const home = (await cellOf(card(page, 'custom-roles')).getAttribute('data-column'))!;
  await dragTo(page, card(page, 'custom-roles'), cellOf(card(page, 'resource-level-permissions')));
  await page.mouse.move(2, 2);
  await expect(line(page, 'custom-roles', 'least-privilege-default-role')).toHaveClass(/problem/);
  await dragTo(page, card(page, 'custom-roles'), page.locator(`.cell[data-row="identity"][data-column="${home}"]`));
  await page.mouse.move(2, 2);
  await expect(line(page, 'custom-roles', 'least-privilege-default-role')).toHaveCount(0);

  // 4. In a time view, highlights follow the level shown: 27.4 is after 27.3, but both are in Q2.
  await pickAxes(page, 'time', 'system');
  await foldAll(page, 'Time', false);
  await select(page, 'sso-session-timeout-policy', 'totp-enrollment-rework');
  await page.keyboard.press('l');
  await unfocus(page);
  await expect(line(page, 'sso-session-timeout-policy', 'totp-enrollment-rework')).toHaveClass(/problem/);
  await foldAll(page, 'Time', true);
  await expect(page.locator('.band-x', { hasText: 'Q2 2027' })).toHaveCount(1);
  await expect(line(page, 'sso-session-timeout-policy', 'totp-enrollment-rework')).toHaveCount(0);
  await pickAxes(page, 'sequence', 'system');

  // 5 and 6. Close a loop through the group: both links are flagged, and the collapsed group counts them.
  await expandGroup(card(page, 'eu-data-residency').first());
  await select(page, 'region-pinned-directory-sync');
  await page.keyboard.press('l');
  await page.keyboard.press('Shift+E');
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Region-pinned directory sync” → “Custom roles”');
  await unfocus(page);
  await expect(line(page, 'custom-roles', 'eu-data-residency')).toHaveClass(/problem/);
  await expect(line(page, 'eu-data-residency', 'custom-roles')).toHaveClass(/problem/);
  await expect(groupMarker).toHaveText(`⚠ ${markedBefore + 2}`);
  await expect(groupMarker).toHaveAttribute('title', /“Region-pinned directory sync” → “Custom roles” is part of a loop/);
  // Expand it to find it.
  await expandGroup(card(page, 'eu-data-residency').first());
  await expect(card(page, 'region-pinned-directory-sync')).toBeVisible();
  await foldEU(page);
  await unfocus(page);

  // 7. Click a line and press Delete to remove it; undo brings it back.
  await page.locator('.dep-hit[data-from="eu-data-residency"][data-to="custom-roles"]').dispatchEvent('click');
  await expect(line(page, 'eu-data-residency', 'custom-roles')).toHaveClass(/selected/);
  await page.keyboard.press('Delete');
  await expect(notice(page)).toContainText('Removed the link “Region-pinned directory sync” → “Custom roles”');
  await expect(line(page, 'eu-data-residency', 'custom-roles')).toHaveCount(0);
  await expect(groupMarker).toHaveText(`⚠ ${markedBefore}`);
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(line(page, 'eu-data-residency', 'custom-roles')).toHaveClass(/problem/);

  // 9. Double-click renames a group, its count expands it, a gap makes a new column, and Rows is on the left.
  const group = card(page, 'eu-data-residency').first();
  await reveal(group);
  await group.locator('.card-title').dblclick();
  await group.getByRole('textbox', { name: 'Card title' }).fill('EU data residency (GA)');
  await page.keyboard.press('Enter');
  await expect(group.locator('.card-title')).toHaveText('EU data residency (GA)');
  await group.locator('.zoom-into').click();
  await expect(frameName(card(page, 'region-pinned-directory-sync'))).toHaveText('EU data residency (GA)');
  await foldEU(page);
  const columns = await page.locator('.column-header:not(.gap)').count();
  await doubleClickEmpty(page, page.locator('.cell.gap[data-row="identity"]').nth(2));
  await page.keyboard.type('Brand-new step');
  await page.keyboard.press('Enter');
  await expect(page.locator('.card', { hasText: 'Brand-new step' })).toBeVisible();
  await expect(page.locator('.column-header:not(.gap)')).toHaveCount(columns + 1);
  const pickers = await page
    .locator('[data-testid="axis-x"], [data-testid="axis-y"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.testid));
  expect(pickers).toEqual(['axis-y', 'axis-x']);

  // 10. Reload without losing anything.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await page.mouse.move(2, 2);
  await expect(line(page, 'custom-roles', 'eu-data-residency')).toHaveClass(/problem/);
  await expect(line(page, 'eu-data-residency', 'custom-roles')).toHaveClass(/problem/);
  await expect(card(page, 'eu-data-residency').first().locator('.card-title')).toHaveText('EU data residency (GA)');
  await expect(page.locator('.card', { hasText: 'Brand-new step' })).toBeVisible();

  // 8. Import the sample Jira export, and see its Blocks links on hover.
  await page.getByTestId('import-csv-input').setInputFiles(SAMPLE.pathname);
  const dialog = page.getByTestId('import-dialog');
  await dialog.getByRole('button', { name: 'Next: values →' }).click();
  await dialog.getByRole('button', { name: 'Import 53 cards' }).click();
  // “Zero-downtime index rebuild” blocks “Typo-tolerant search”.
  const rebuild = page.locator('.card:not(.via-children)', { hasText: 'Zero-downtime index rebuild' }).first();
  await reveal(rebuild);
  await rebuild.hover();
  const rebuildId = (await rebuild.getAttribute('data-item'))!;
  await expect(page.locator(`.dep-line.focus[data-from="${rebuildId}"]`)).toHaveCount(1);
});
