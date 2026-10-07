import { expect, test, type Page } from '@playwright/test';
import { card, frameName, openApp, reveal } from './app.ts';

// Sprint 7, slice 4: a card's actions, with their keys (Q54).

const menu = (page: Page) => page.getByTestId('card-menu');
const item = (page: Page, name: string | RegExp) => menu(page).getByRole('menuitem', { name });

async function rightClick(page: Page, id: string) {
  const c = card(page, id).first();
  await reveal(c);
  await c.locator('.card-title').click({ button: 'right' });
}

test('right-clicking a card shows its actions with their keys, and selects it', async ({ page }) => {
  await openApp(page);
  await rightClick(page, 'custom-roles');
  await expect(menu(page)).toBeVisible();
  await expect(card(page, 'custom-roles').first()).toHaveClass(/selected/);
  for (const name of ['Rename', 'Inspect', 'Add a card inside', 'Expand', 'Collapse', 'Put in a new group', 'Ungroup', 'Start a link from here', 'Delete']) {
    await expect(item(page, new RegExp(`^${name}`))).toBeVisible();
  }
  await expect(item(page, /^Inspect/).locator('.menu-key')).toHaveText('I');
  await expect(item(page, /^Expand/)).toBeDisabled();
  await item(page, /^Inspect/).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('inspector')).toBeVisible();
});

test('the menu acts on the whole selection, and Esc closes it', async ({ page }) => {
  await openApp(page);
  const a = card(page, 'custom-roles').first();
  const b = card(page, 'least-privilege-default-role').first();
  await reveal(a);
  await a.locator('.card-title').click();
  await b.locator('.card-title').click({ modifiers: ['Shift'] });
  await b.locator('.card-title').click({ button: 'right' });
  await expect(menu(page)).toHaveAttribute('aria-label', 'Actions for 2 cards');
  await expect(item(page, /^Link: first comes before second/)).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  // Esc closed only the menu: the selection stays.
  await expect(a).toHaveClass(/selected/);
});

test('the "⋯" on a card opens the same menu; Delete there is undoable', async ({ page }) => {
  await openApp(page);
  const c = card(page, 'custom-roles').first();
  await reveal(c);
  await c.hover();
  await c.getByRole('button', { name: 'Actions for Custom roles' }).click();
  await item(page, /^Delete/).click();
  await expect(card(page, 'custom-roles')).toHaveCount(0);
  await page.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'custom-roles')).not.toHaveCount(0);
});

test('Expand from the menu shows what is inside a group', async ({ page }) => {
  await openApp(page);
  await rightClick(page, 'passwordless-login');
  await item(page, /^Expand/).click();
  await expect(page.locator('.frame-open[data-frame="passwordless-login"]').first()).toBeAttached();
  await expect(frameName(card(page, 'webauthn-enrollment').first())).toHaveText('Passwordless login');
});
