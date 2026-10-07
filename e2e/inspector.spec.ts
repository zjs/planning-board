import { expect, test, type Page } from '@playwright/test';
import { card, openApp, expandGroup, reveal } from './app.ts';

// The card inspector (Q35): edit a card where it is, without pivoting.

const inspector = (page: Page) => page.getByTestId('inspector');
const notice = (page: Page) => page.getByTestId('notice');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

test('I opens the inspector for the selected card; a size and a component are set without pivoting', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('i');
  await expect(inspector(page)).toContainText('Select a card to see and edit it');

  await select(page, 'custom-roles');
  await expect(inspector(page).getByLabel('Card title')).toHaveValue('Custom roles');
  await inspector(page).getByLabel('Size', { exact: true }).selectOption('l');
  await expect(card(page, 'custom-roles').locator('.attr[data-property="size"]')).toHaveText('L');

  // Components: add one, and remove it again.
  await inspector(page).getByLabel('Add System').selectOption('billing/invoicing');
  await expect(card(page, 'custom-roles')).toHaveCount(2);
  await inspector(page).getByRole('button', { name: 'Remove Billing › Invoicing' }).click();
  await expect(card(page, 'custom-roles')).toHaveCount(1);

  // Each change is one undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(page, 'custom-roles')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card(page, 'custom-roles').locator('.attr[data-property="size"]')).toHaveText('S');

  await page.keyboard.press('i');
  await expect(inspector(page)).toHaveCount(0);
});

test('several cards: shared values or Mixed, and one change sets all of them', async ({ page }) => {
  await openApp(page);
  await page.locator('.toolbar').getByRole('button', { name: 'Inspect' }).click();
  await select(page, 'credit-notes', 'vat-oss-reporting', 'custom-roles');
  await expect(inspector(page).locator('h2')).toHaveText('3 cards');
  const time = inspector(page).getByLabel('Time', { exact: true });
  await expect(time.locator('option:checked')).toHaveText('Mixed');
  await time.selectOption('q3');
  await expect(notice(page)).toContainText('Changed Time on 3 cards');
  await expect(time.locator('option:checked')).toHaveText('Q3 2027');
  // Mixed components show how many cards have each.
  await expect(inspector(page).locator('.inspector-chips li.partial').first()).toContainText('1 of 3');

  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(time.locator('option:checked')).toHaveText('Mixed');
});

test('a description is saved, and survives a reload', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('i');
  await select(page, 'credit-notes');
  const field = inspector(page).getByLabel('Description');
  await field.fill('Needed before the Q2 audit.\nAsk finance about rounding.');
  // Clicking another card leaves the field: the text is kept.
  await select(page, 'vat-oss-reporting');
  await select(page, 'credit-notes');
  await expect(field).toHaveValue('Needed before the Q2 audit.\nAsk finance about rounding.');
  await page.reload();
  await page.getByTestId('board').waitFor();
  await page.keyboard.press('i');
  await select(page, 'credit-notes');
  await expect(inspector(page).getByLabel('Description')).toHaveValue('Needed before the Q2 audit.\nAsk finance about rounding.');
});

test("a card's links are listed; ✕ removes one, and clicking one shows that card, even inside a group", async ({ page }) => {
  await openApp(page);
  // Custom roles → Region-pinned directory sync, which is inside EU data residency.
  await select(page, 'custom-roles');
  await page.keyboard.press('l');
  await expandGroup(card(page, 'eu-data-residency').first());
  await select(page, 'region-pinned-directory-sync');
  await page.keyboard.press('l');
  await expect(notice(page)).toContainText('Linked “Custom roles” → “Region-pinned directory sync”');

  await page.keyboard.press('i');
  const after = inspector(page).getByRole('region', { name: 'Links' });
  await expect(after).toContainText('Custom roles');
  await expect(inspector(page)).toContainText('In EU data residency');
  // Clicking it shows Custom roles on the board and selects it.
  await after.getByRole('button', { name: 'Custom roles', exact: true }).click();
  await expect(card(page, 'custom-roles').first()).toHaveClass(/selected/);
  await expect(inspector(page).getByLabel('Card title')).toHaveValue('Custom roles');

  await inspector(page).getByRole('button', { name: 'Remove the link Custom roles → Region-pinned directory sync' }).click();
  await expect(notice(page)).toContainText('Removed the link');
  await expect(inspector(page).getByRole('region', { name: 'Links' })).not.toContainText('Region-pinned');
  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect(inspector(page).getByRole('region', { name: 'Links' })).toContainText('Region-pinned');
});
