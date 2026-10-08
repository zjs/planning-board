import { expect, test, type Browser, type Page } from '@playwright/test';
import { card, pickAxes } from '../app.ts';

// Presence (sprint 12, slice 1; ADR 0019): people on a shared plan see each other, anchored to cards,
// whatever view each of them is in.

async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

/** Ada loads the sample and shares it; returns the edit link. */
async function sharedSample(ada: Page): Promise<string> {
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-start').click();
  const edit = await ada.getByTestId('edit-link').inputValue();
  await ada.getByRole('button', { name: 'Done' }).click();
  return edit;
}

const id = 'sso-enforcement-per-workspace';
const avatars = (page: Page) => page.getByTestId('avatars').getByTestId('avatar');
async function people(page: Page, entry: string) {
  await page.getByTestId('people-menu').click();
  await page.getByRole('menu').getByRole('menuitem', { name: entry, exact: true }).click();
}

test('see who is here, and what they point at and select, in your own view', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  const link = await sharedSample(ada);
  const bo = await person(browser, 'Bo');
  await bo.goto(link);
  await expect(bo.getByTestId('connection-state')).toHaveText('Live');
  await expect(avatars(bo)).toHaveCount(2);
  await expect(avatars(ada)).toHaveCount(2);
  await expect(avatars(ada).nth(1)).toHaveAttribute('data-person', 'Bo');

  // Different views: Ada on the sample's Roadmap, Bo by Size and Level.
  await pickAxes(bo, 'size', 'level');
  await card(ada, id).first().hover({ position: { x: 20, y: 10 } });
  const pointer = bo.locator('.presence-pointer[data-person="Ada"]');
  await expect(pointer).toHaveCount(1);
  // The pointer sits on that card on Bo's board, wherever the card is there.
  const at = (await pointer.boundingBox())!;
  const target = (await card(bo, id).first().boundingBox())!;
  expect(at.x).toBeGreaterThanOrEqual(target.x - 1);
  expect(at.x).toBeLessThanOrEqual(target.x + target.width);
  expect(at.y).toBeGreaterThanOrEqual(target.y - 1);
  expect(at.y).toBeLessThanOrEqual(target.y + target.height);
  await expect(bo.locator('.presence-tag.pointer[data-person="Ada"]')).toContainText('Ada');

  // A selection is outlined on every copy of the card, in Ada's color.
  await card(ada, id).first().click();
  await expect(bo.locator('.presence-selection[data-person="Ada"]')).toHaveCount(await card(bo, id).count());

  // Moving off the cards takes the pointer away.
  await ada.getByTestId('plan-name').hover();
  await expect(pointer).toHaveCount(0);
});

test('one driver at a time, and pointers quieted to the driver or to nobody', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  const link = await sharedSample(ada);
  const bo = await person(browser, 'Bo');
  const cy = await person(browser, 'Cy');
  await bo.goto(link);
  await cy.goto(link);
  await expect(avatars(ada)).toHaveCount(3);

  await people(cy, 'I’m driving');
  await expect(ada.getByTestId('driving-note')).toHaveText('Cy is driving');
  await expect(cy.getByTestId('driving-note')).toHaveText('You’re driving');
  // A new claim takes over.
  await people(bo, 'I’m driving');
  await expect(ada.getByTestId('driving-note')).toHaveText('Bo is driving');
  await expect(cy.getByTestId('driving-note')).toHaveText('Bo is driving');

  // Driver only: Ada sees Bo's pointer, not Cy's.
  await people(ada, 'Driver only');
  await card(bo, id).first().hover();
  await card(cy, id).first().hover();
  await expect(ada.locator('.presence-pointer[data-person="Bo"]')).toHaveCount(1);
  await expect(ada.locator('.presence-pointer[data-person="Cy"]')).toHaveCount(0);
  // With nobody driving, nobody's pointer shows.
  await people(bo, 'Stop driving');
  await expect(ada.getByTestId('driving-note')).toHaveCount(0);
  await expect(ada.locator('.presence-pointer')).toHaveCount(0);
  // None.
  await people(ada, 'None');
  await people(bo, 'I’m driving');
  await expect(ada.getByTestId('driving-note')).toHaveText('Bo is driving');
  await expect(ada.locator('.presence-pointer')).toHaveCount(0);

  // Leaving takes the avatar away.
  await cy.context().close();
  await expect(avatars(ada)).toHaveCount(2);
});
