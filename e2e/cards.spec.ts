import { expect, test, type Page } from '@playwright/test';
import { card, cell, doubleClickEmpty, openApp, pickAxes } from './app.ts';


test('click selects every copy of a card, shift-click adds, Esc and empty space clear', async ({ page }) => {
  await openApp(page);
  const multi = card(page, 'tenant-data-deletion-gdpr'); // three copies, one per area
  await multi.first().click();
  await expect(page.locator('.card.selected[data-item="tenant-data-deletion-gdpr"]')).toHaveCount(3);

  await card(page, 'idp-initiated-login').click({ modifiers: ['Shift'] });
  await expect(page.locator('.card.selected')).toHaveCount(4);
  await card(page, 'idp-initiated-login').click({ modifiers: ['Shift'] });
  await expect(page.locator('.card.selected')).toHaveCount(3);

  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(0);

  await card(page, 'idp-initiated-login').click();
  await expect(page.locator('.card.selected')).toHaveCount(1);
  await doubleClickEmpty(page, cell(page, 'cx', await columnOf(page, 'idp-initiated-login')));
  await page.keyboard.press('Escape'); // close the draft card the double-click opened
  await expect(page.locator('.card.selected')).toHaveCount(0);
});

test('double-clicking empty space creates a card with that cell’s values', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const target = cell(page, 'billing', 'q3');
  const before = await target.locator('.card').count();

  await doubleClickEmpty(page, target);
  const draft = page.getByTestId('draft-card');
  await expect(draft).toBeVisible();
  await page.keyboard.type('Usage alerts for admins');
  await page.keyboard.press('Enter');
  // Enter opens the next card's field (Q51); Esc stops.
  await expect(target.getByTestId('draft-card')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(target.locator('.card')).toHaveCount(before + 1);
  const created = target.locator('.card', { hasText: 'Usage alerts for admins' });
  await expect(created).toHaveClass(/selected/);
  // It carries the cell's values: pivot and it's still in Billing, and badged Q3.
  await pickAxes(page, 'sequence', 'system');
  const moved = page.locator('.holding-cell[data-row="billing"] .card', { hasText: 'Usage alerts for admins' });
  await expect(moved.locator('.attr[data-property="time"]')).toHaveText('Q3 2027');

  // One undo removes it.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.card', { hasText: 'Usage alerts for admins' })).toHaveCount(0);
});

test('a blank or cancelled draft creates nothing', async ({ page }) => {
  await openApp(page);
  await pickAxes(page, 'time', 'system');
  const target = cell(page, 'billing', 'q3');
  const before = await target.locator('.card').count();
  await doubleClickEmpty(page, target);
  await page.keyboard.type('Never mind');
  await page.keyboard.press('Escape');
  await doubleClickEmpty(page, target);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('draft-card')).toHaveCount(0);
  await expect(target.locator('.card')).toHaveCount(before);
  // Nothing to undo: the sample is a plan of its own, not an edit (ADR 0021).
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('Enter and Delete on a focused button act on the button, not the selection', async ({ page }) => {
  await openApp(page);
  await card(page, 'idp-initiated-login').click();
  const chips = page.getByRole('button', { name: 'Chips' });
  await chips.focus();
  await page.keyboard.press('Enter');
  await expect(chips).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Delete');
  await expect(card(page, 'idp-initiated-login')).toHaveCount(1);
  await expect(card(page, 'idp-initiated-login').getByRole('textbox')).toHaveCount(0);
});

test('double-click or Enter renames a card; typing never triggers board shortcuts', async ({ page }) => {
  await openApp(page);
  const c = card(page, 'idp-initiated-login');
  await c.dblclick();
  const field = c.getByRole('textbox', { name: 'Card title' });
  await expect(field).toBeFocused();
  // Backspace edits the title instead of deleting the card.
  await page.keyboard.press('Backspace');
  await page.keyboard.type('IdP-initiated SSO');
  await page.keyboard.press('Enter');
  await expect(c.locator('.card-title')).toHaveText('IdP-initiated SSO');

  await c.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('IdP-initiated login (SAML)');
  await page.keyboard.press('Enter');
  await expect(c.locator('.card-title')).toHaveText('IdP-initiated login (SAML)');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(c.locator('.card-title')).toHaveText('IdP-initiated SSO');
});

test('deleting a group deletes its contents, and one undo brings everything back (Q17)', async ({ page }) => {
  await openApp(page);
  const group = card(page, 'eu-data-residency');
  await expect(group.locator('.child-count')).toHaveText('4');
  const total = await page.locator('.card').count();

  await group.click();
  await page.keyboard.press('Delete');
  await expect(group).toHaveCount(0);
  const notice = page.getByTestId('notice');
  // The group, its 4 children, and the 3 cards inside one of them.
  await expect(notice).toContainText('Deleted 8 cards');

  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
  await expect(group.locator('.child-count')).toHaveText('4');
  await expect(page.locator('.card')).toHaveCount(total);

  // Redo deletes it all again; undo restores it; a reload keeps the restored plan.
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(group).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(group.locator('.child-count')).toHaveText('4');
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(card(page, 'eu-data-residency').locator('.child-count')).toHaveText('4');

  // A notice whose delete was undone doesn't come back when the undo history
  // happens to reach the same length again.
  await card(page, 'eu-data-residency').click();
  await page.keyboard.press('Delete');
  await expect(notice).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notice).toHaveCount(0);
  await card(page, 'idp-initiated-login').dblclick();
  await page.keyboard.type('Renamed');
  await page.keyboard.press('Enter');
  await expect(notice).toHaveCount(0);
});

async function columnOf(page: Page, itemId: string): Promise<string> {
  return card(page, itemId)
    .first()
    .evaluate((el) => el.closest<HTMLElement>('.cell')!.dataset.column!);
}

test('double-clicking a gap between sequence columns makes a card in a new column', async ({ page }) => {
  await openApp(page);
  const columns = await page.locator('.column-header:not(.gap)').count();
  await doubleClickEmpty(page, page.locator('.cell.gap[data-row="identity"]').nth(2));
  await page.keyboard.type('Brand-new step');
  await page.keyboard.press('Enter');
  const created = page.locator('.card', { hasText: 'Brand-new step' });
  await expect(created).toBeVisible();
  await expect(page.locator('.column-header:not(.gap)')).toHaveCount(columns + 1);
  // It's alone in its column, in the row it was made in.
  await expect(created.locator('xpath=ancestor::*[contains(@class, "cell")][1]')).toHaveAttribute('data-row', 'identity');
});

test('the Rows picker comes before Columns, next to the row headers', async ({ page }) => {
  await openApp(page);
  const order = await page.locator('.axis-picker select').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(order).toEqual(['axis-y', 'axis-x']);
});
