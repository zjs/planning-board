import { expect, test, type Page } from '@playwright/test';
import { card, openApp, reveal } from './app.ts';

// Sprint 6's exit criteria (docs/sprint-6.md) 1–6, end to end, in order. If this passes, the
// walkthrough in docs/demos/sprint-6.md works.

const find = (page: Page) => page.getByTestId('find');
const count = (page: Page) => page.getByTestId('find-count');
const bar = (page: Page) => page.getByTestId('find-bar');
const SSO = ['sso-enforcement-per-workspace', 'sso-session-timeout-policy', 'sso-bound-api-tokens'];

test('sprint 6 exit criteria', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);

  // 1. / and "sso": only the SSO cards stay bright, the count says how many, and "processor" stays dim.
  await page.keyboard.press('/');
  await page.keyboard.type('sso');
  await expect(count(page)).toHaveText('3 cards');
  for (const id of SSO) await expect(card(page, id).first()).not.toHaveClass(/dimmed/);
  await expect(card(page, 'second-payment-processor').first()).toHaveClass(/dimmed/);
  await page.keyboard.press('Escape');

  // 2. In Time × System, "webauthn": Passwordless login shows 1 inside; Enter expands it and selects the match.
  await page.getByTestId('axis-x').selectOption('time');
  await page.keyboard.press('/');
  await page.keyboard.type('webauthn');
  const group = card(page, 'passwordless-login').first();
  await reveal(group);
  await expect(group.locator('.found-inside')).toHaveText('1 inside');
  await page.keyboard.press('Enter');
  await expect(card(page, 'webauthn-enrollment').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+E');

  // 3. ↓ and ↑ step through the SSO cards, each scrolled into view.
  await page.keyboard.press('/');
  await page.keyboard.type('sso');
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown');
    const shown = page.locator('.card.selected').first();
    await expect(shown).toBeInViewport();
    seen.add((await shown.getAttribute('data-item'))!);
  }
  expect([...seen].sort()).toEqual([...SSO].sort());
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.card.selected').first()).toBeInViewport();

  // 4. Pivot Rows to Time: the find stays, and the same cards stay bright.
  await page.getByTestId('axis-y').selectOption('time');
  await expect(find(page)).toHaveValue('sso');
  await expect(count(page)).toHaveText('3 cards');
  for (const id of SSO) await expect(card(page, id).first()).not.toHaveClass(/dimmed/);

  // 5. Click a match and press L: a link starts. Esc cancels it, clears the selection, then stops finding.
  const match = card(page, 'sso-bound-api-tokens').first();
  await reveal(match);
  await match.locator('.card-title').click();
  await page.keyboard.press('l');
  await expect(page.getByTestId('link-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card.selected')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator('.card.dimmed')).toHaveCount(0);

  // 6. Typing in the bar never triggers board shortcuts.
  await page.keyboard.press('/');
  await page.keyboard.type('el i');
  await expect(find(page)).toHaveValue('el i');
  await expect(page.getByTestId('link-bar')).toHaveCount(0);
  await expect(page.getByTestId('inspector')).toHaveCount(0);
});
