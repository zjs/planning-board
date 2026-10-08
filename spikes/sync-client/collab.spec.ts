import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { card, cell, dragTo, pickAxes } from '../../e2e/app.ts';
import { DATA } from './playwright.config.ts';

/** With SPIKE_SCREENSHOTS set to a directory, the test saves what each person saw at a few moments. */
const shots = process.env['SPIKE_SCREENSHOTS'];
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
};

async function person(browser: Browser, name: string, color: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(([n, c]) => localStorage.setItem('spike:me', JSON.stringify({ name: n, color: c })), [name, color]);
  return context.newPage();
}

const live = (page: Page) => expect(page.getByTestId('spike-status')).toHaveAttribute('data-status', 'live');

test('two people on one encrypted link: live edits, presence, offline work, and a relay that reads nothing', async ({ browser }) => {
  test.setTimeout(90_000);

  // Ada starts a board and shares it.
  const ada = await person(browser, 'Ada', '#d9480f');
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('board').waitFor();
  await ada.getByTestId('spike-share').click();
  await expect(ada).toHaveURL(/#room=[\w-]+&key=[\w-]+$/);
  await ada.getByTestId('board').waitFor();
  await live(ada);
  const link = ada.url();

  // Bo opens the link and sees the same board.
  const bo = await person(browser, 'Bo', '#2b8a3e');
  await bo.goto(link);
  await bo.getByTestId('board').waitFor();
  await live(bo);
  for (const page of [ada, bo]) await pickAxes(page, 'time', 'system');
  await expect(bo.locator('.card[data-item]')).toHaveCount(await ada.locator('.card[data-item]').count());
  await expect(ada.getByTestId('spike-people')).toContainText('Bo');
  await expect(bo.getByTestId('spike-people')).toContainText('Ada');

  // A drag on Ada's board lands on Bo's.
  await dragTo(ada, card(ada, 'oidc-provider-support').first(), cell(ada, 'identity', 'q3'));
  await expect(card(cell(bo, 'identity', 'q3'), 'oidc-provider-support')).toBeVisible();

  // Bo sees where Ada is pointing, and what she has selected, on his own board.
  await card(ada, 'totp-enrollment-rework').first().hover();
  await expect(bo.locator('[data-testid=spike-overlay] svg[data-cursor="Ada"]')).toHaveCount(1);
  await card(ada, 'totp-enrollment-rework').first().click();
  await expect(bo.locator('[data-selected-by="Ada"][data-item="totp-enrollment-rework"]')).not.toHaveCount(0);
  await card(ada, 'totp-enrollment-rework').first().hover();
  await bo.waitForTimeout(300);
  await shot(bo, 'presence');

  // Bo goes offline. Both keep working.
  await bo.getByTestId('spike-offline').click();
  await expect(bo.getByTestId('spike-status')).toHaveAttribute('data-status', 'offline');
  const renamed = card(ada, 'idp-initiated-login').first();
  await renamed.dblclick();
  await ada.keyboard.press('ControlOrMeta+a');
  await ada.keyboard.type('IdP-initiated SSO');
  await ada.keyboard.press('Enter');
  await dragTo(bo, card(bo, 'totp-enrollment-rework').first(), cell(bo, 'identity', 'q4'));
  await expect(card(bo, 'idp-initiated-login').first().locator('.card-title')).not.toHaveText('IdP-initiated SSO');

  // Bo comes back: both boards have both changes, and Bo is told what changed while he was away.
  await bo.getByTestId('spike-offline').click();
  await live(bo);
  await expect(card(bo, 'idp-initiated-login').first().locator('.card-title')).toHaveText('IdP-initiated SSO');
  await expect(card(cell(ada, 'identity', 'q4'), 'totp-enrollment-rework')).toBeVisible();
  await expect(bo.getByTestId('spike-away-others')).toContainText('IdP-initiated SSO');
  await shot(bo, 'since-you-were-away');

  // The history names who did what.
  await ada.getByTestId('spike-history-toggle').click();
  await expect(ada.getByTestId('spike-history')).toContainText('Bo');
  await shot(ada, 'history');

  // Nothing the relay stored contains plan text.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(DATA);
  const stored = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  expect(stored.length).toBeGreaterThan(1000);
  for (const text of ['IdP-initiated SSO', 'TOTP', 'OIDC', 'Identity']) expect(stored).not.toContain(text);
});
