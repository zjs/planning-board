import { expect, test, type Page } from '@playwright/test';
import { card, openApp, reveal } from './app.ts';

// Finding cards (questions.md Q50, ADR 0014): / and a few words dim every card that doesn't match.

const find = (page: Page) => page.getByTestId('find');
const count = (page: Page) => page.getByTestId('find-count');
const bar = (page: Page) => page.getByTestId('find-bar');
const SSO = ['sso-enforcement-per-workspace', 'sso-session-timeout-policy', 'sso-bound-api-tokens'];

test('/ finds cards by the start of their words, and dims the rest without moving anything', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('/');
  await expect(find(page)).toBeFocused();
  // The bar opens above the board; typing moves nothing.
  const before = await card(page, 'sso-bound-api-tokens').first().boundingBox();
  await page.keyboard.type('sso');
  await expect(count(page)).toHaveText('3 cards');
  for (const id of SSO) await expect(card(page, id).first()).not.toHaveClass(/dimmed/);
  // "sso" is inside "processor", but not at the start of a word.
  await expect(card(page, 'second-payment-processor').first()).toHaveClass(/dimmed/);
  expect(await card(page, 'sso-bound-api-tokens').first().boundingBox()).toEqual(before);

  // Typing in the field never triggers board shortcuts: L would start a link, E would expand.
  await find(page).fill('');
  await page.keyboard.type('qle');
  await expect(find(page)).toHaveValue('qle');
  await expect(count(page)).toHaveText('No cards');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // With words typed, the find stays while you work with the cards, and the board's shortcuts act on them.
  await find(page).fill('sso');
  await card(page, 'sso-bound-api-tokens').first().locator('.card-title').click();
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByTestId('link-bar')).toBeVisible();
  await expect(find(page)).toHaveValue('sso');

  // Esc cancels the link, then clears the selection, then stops finding.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(0);
  await expect(bar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator('.card.dimmed')).toHaveCount(0);
  await page.keyboard.press('/');
  await expect(find(page)).toBeFocused();
  await expect(find(page)).toHaveValue('');

  // The toolbar's button does the same, for anyone who doesn't know /. An empty bar closes when you click away.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(find(page)).toBeFocused();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(find(page)).toBeFocused();
  await card(page, 'sso-bound-api-tokens').first().locator('.card-title').click();
  await expect(bar(page)).toHaveCount(0);
});

test('a match inside a collapsed group shows on the group; Enter expands it and selects every match', async ({ page }) => {
  await openApp(page);
  // In Time × System, WebAuthn enrollment (no quarter yet) is folded inside Passwordless login, with no frame of its own.
  await page.getByTestId('axis-x').selectOption('time');
  await page.keyboard.press('/');
  await page.keyboard.type('webauthn');
  await expect(count(page)).toHaveText('1 card · 1 inside a collapsed group');
  const group = card(page, 'passwordless-login').first();
  await reveal(group);
  await expect(group).not.toHaveClass(/dimmed/);
  await expect(group.locator('.found-inside')).toHaveText('1 inside');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('notice')).toContainText('Selected 1 card matching “webauthn”, and expanded 1 group');
  const webauthn = card(page, 'webauthn-enrollment').first();
  await expect(webauthn).toHaveAttribute('aria-selected', 'true');
  await expect(webauthn).not.toHaveClass(/dimmed/);
  await expect(webauthn.locator('.parent-chip')).toHaveText('Passwordless login');
  // Focus is back on the board, so its shortcuts act on the matches: ⇧E collapses the group again.
  await expect(find(page)).not.toBeFocused();
  await page.keyboard.press('Shift+E');
  await expect(card(page, 'passwordless-login').first().locator('.found-inside')).toHaveText('1 inside');
});

test('↓ and ↑ go from one match to the next, and the find survives a pivot', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('/');
  await page.keyboard.type('sso');
  const selected = () => page.locator('.card.selected').first().getAttribute('data-item');
  await page.keyboard.press('ArrowDown');
  const first = await selected();
  expect(SSO).toContain(first);
  await page.keyboard.press('ArrowDown');
  const second = await selected();
  expect(SSO).toContain(second);
  expect(second).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  expect(await selected()).toBe(first);
  // The shown match is on screen.
  await expect(page.locator('.card.selected').first()).toBeInViewport();

  await page.getByTestId('axis-y').selectOption('time');
  await expect(find(page)).toHaveValue('sso');
  await expect(count(page)).toHaveText('3 cards');
  const bright = card(page, 'sso-bound-api-tokens').first();
  await reveal(bright);
  await expect(bright).not.toHaveClass(/dimmed/);
  expect(await page.locator('.card.dimmed').count()).toBeGreaterThan(20);
});

test('/ typed while renaming a card is part of the title, not a shortcut', async ({ page }) => {
  await openApp(page);
  const target = card(page, 'sso-bound-api-tokens').first();
  await reveal(target);
  await target.locator('.card-title').dblclick();
  await page.keyboard.type(' a/b');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Card title' })).toHaveValue(/ a\/b$/);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
});
