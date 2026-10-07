import { expect, test, type Page } from '@playwright/test';
import { APP_URL, dragTo, openApp } from './app.ts';

// Sprint 7, slice 2: edit values from the headers (Q55).

async function blankPlan(page: Page) {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Start a blank plan' }).click();
  await page.getByTestId('board').waitFor();
}

async function typeIdeas(page: Page, ...titles: string[]) {
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
}

const band = (page: Page, label: string) => page.locator('.band-y', { hasText: label });

test('a blank plan makes its first areas from the header, and ideas drag into them', async ({ page }) => {
  await blankPlan(page);
  await typeIdeas(page, 'Passwordless login', 'Audit log export');
  await expect(page.locator('.empty-note')).toContainText('No areas yet. Click + Add area');

  await page.getByTestId('add-y').click();
  await page.keyboard.type('Identity');
  await page.keyboard.press('Enter');
  // The field stays open for the next one.
  await page.keyboard.type('Billing');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(band(page, 'Identity')).toHaveCount(1);
  await expect(band(page, 'Billing')).toHaveCount(1);
  await expect(page.getByTestId('add-y')).toBeVisible();

  // An area with nothing inside has its own lane, which takes cards.
  const identity = (await band(page, 'Identity').getAttribute('data-band'))!;
  const lane = page.locator(`.cell:not(.gap)[data-row="${identity}"]`).first();
  await dragTo(page, page.locator('.card', { hasText: 'Passwordless login' }), lane);
  await expect(page.locator(`.cell[data-row="${identity}"] .card`, { hasText: 'Passwordless login' })).toHaveCount(1);

  // ...and a component can be added inside it, from its "No component" header.
  await page.getByTestId(`add-y-${identity}`).click();
  await page.keyboard.type('SSO');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.row-header', { hasText: 'SSO' })).toHaveCount(1);
});

test('a name already in use is explained, and nothing is added', async ({ page }) => {
  await blankPlan(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('add-y').click();
  await page.keyboard.type('Identity');
  await page.keyboard.press('Enter');
  await page.keyboard.type('identity');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('“identity” is already here.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.band-y')).toHaveCount(1);
});

test('quarters can be added from the top-right header, one after another', async ({ page }) => {
  await blankPlan(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('preset-roadmap').click();
  await page.getByTestId('add-x').click();
  await page.keyboard.type('Q1 2027');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Q2 2027');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.band-x', { hasText: 'Q1 2027' })).toHaveCount(1);
  await expect(page.locator('.band-x', { hasText: 'Q2 2027' })).toHaveCount(1);
});

test('double-click renames a header, and undo puts the old name back', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  const q1 = page.locator('.band-x', { hasText: 'Q1 2027' }).locator('.band-toggle');
  await expect(q1).toHaveAttribute('aria-expanded', 'false');
  await q1.dblclick();
  const field = page.getByRole('textbox', { name: 'Rename Q1 2027' });
  await expect(field).toBeFocused();
  await field.fill('Q1 FY27');
  await field.press('Enter');
  await expect(page.locator('.band-x', { hasText: 'Q1 FY27' })).toHaveCount(1);
  // Double-clicking didn't leave the band unfolded.
  await expect(page.locator('.band-x', { hasText: 'Q1 FY27' }).locator('.band-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.band-x', { hasText: 'Q1 2027' })).toHaveCount(1);
});

test('typing in a header never fires board shortcuts', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('preset-roadmap').click();
  await page.getByTestId('add-x').click();
  await page.keyboard.type('Late 2028 / extra');
  await expect(page.getByTestId('find-bar')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'New quarter' })).toHaveValue('Late 2028 / extra');
});
