import { expect, test, type Browser, type Page } from '@playwright/test';
import { card, reveal } from '../app.ts';

// History (sprint 13; requirement 36, ADR 0020): every change is recorded with who made it and when, and anyone on
// the plan can see it in Activity, and restore what was deleted.

async function person(browser: Browser, name: string, timezoneId?: string): Promise<Page> {
  const context = await browser.newContext(timezoneId ? { timezoneId } : {});
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

async function rename(page: Page, id: string, title: string) {
  await reveal(card(page, id).first());
  await card(page, id).first().dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
}

const rows = (page: Page) => page.getByTestId('activity').getByTestId('activity-row');

test('who changed what: Activity names the person and the time, and restores a deleted group', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-start').click();
  const link = await ada.getByTestId('edit-link').inputValue();
  await ada.getByRole('button', { name: 'Done' }).click();

  // Bo is in another time zone.
  const bo = await person(browser, 'Bo', 'America/New_York');
  await bo.goto(link);
  await expect(bo.getByTestId('connection-state')).toHaveText('Live');

  await rename(ada, 'sso-enforcement-per-workspace', 'SSO enforcement, per workspace');
  await reveal(card(ada, 'passwordless-login').first());
  await card(ada, 'passwordless-login').first().click();
  await ada.keyboard.press('Delete');
  await expect(card(bo, 'passwordless-login')).toHaveCount(0);

  // Bo's Activity names Ada, newest first, and says when, in Bo's own time zone.
  await bo.getByTestId('activity-button').click();
  await expect(rows(bo).first()).toContainText('Ada');
  const activity = bo.getByTestId('activity');
  await expect(activity).toContainText('Ada shared the plan');
  await expect(activity).toContainText('Today');
  // Ada's two changes, close together, are one row (Q74), which opens to show each.
  const burst = rows(bo).filter({ hasText: 'Ada made 2 changes' });
  await expect(burst).toHaveCount(1);
  const [time] = await burst.locator('time').allInnerTexts();
  const expected = await bo.evaluate(() => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
  expect(time).toBe(expected);
  await burst.locator('summary').click();
  await expect(burst).toContainText('renamed “SSO enforcement per workspace” to “SSO enforcement, per workspace”');
  const deleted = burst.locator('.activity-change').filter({ hasText: 'deleted “Passwordless login”, and 3 cards inside' });

  // Bo restores the group, with everything inside it, on both boards.
  await deleted.getByTestId('activity-restore').click();
  await expect(card(ada, 'passwordless-login').first()).toBeAttached();
  await expect(bo.getByTestId('notice')).toContainText('Restored “Passwordless login”');
  await ada.getByTestId('activity-button').click();
  await expect(ada.getByTestId('activity')).toContainText('Bo restored “Passwordless login”, and 3 cards inside');

  // Filter to one person.
  await ada.getByTestId('activity-person').selectOption({ label: 'Bo' });
  await expect(rows(ada)).toHaveCount(1);
});
