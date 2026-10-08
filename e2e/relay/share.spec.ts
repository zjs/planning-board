import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { card, cell, dragTo, holding, pickAxes, planList } from '../app.ts';

// Sharing through a real relay (sprint 11, slice 3): the relay serves the app, as it does on a pilot's laptop,
// and each person is a separate browser context, with storage of their own.

async function person(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  // Sharing is behind a switch until the connection pill ships (slice 4).
  await context.addInitScript(() => localStorage.setItem('planning-board:feature:share', '1'));
  return context.newPage();
}

/** Every file the relay has written, as text. */
function relayFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...relayFiles(path));
    else out.push(readFileSync(path).toString('latin1'));
  }
  return out;
}

/** Share the plan on screen and return its links. */
async function share(page: Page, name: string): Promise<{ edit: string; view: string }> {
  await page.getByTestId('share-button').click();
  await page.getByTestId('share-name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('share-start').click();
  const edit = await page.getByTestId('edit-link').inputValue();
  const view = await page.getByTestId('view-link').inputValue();
  await page.getByRole('button', { name: 'Done' }).click();
  return { edit, view };
}

const id = 'sso-enforcement-per-workspace';

test('share a plan, open its links on two other computers, and edit it together', async ({ browser }) => {
  const ada = await person(browser);
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('board').waitFor();
  const links = await share(ada, 'Ada');
  expect(links.edit).toMatch(/^http:\/\/127\.0\.0\.1:18787\/#v=1&room=[\w-]+&key=[\w-]+$/);
  expect(links.view).toMatch(/&view=/);
  await expect(ada.getByTestId('shared-chip')).toContainText('Shared · Ada');
  // The key leaves the address bar once it's saved.
  expect(new URL(ada.url()).hash).toMatch(/^#plan=/);

  // Bo opens the edit link: the whole plan arrives, with its name.
  const bo = await person(browser);
  await bo.goto(links.edit);
  await expect(bo.getByTestId('plan-name')).toHaveText('Sample plan');
  await expect(bo.getByText('SSO enforcement per workspace').first()).toBeVisible();
  expect(new URL(bo.url()).hash).toMatch(/^#plan=/);

  // A drag on one board moves the card on the other, both ways.
  await pickAxes(ada, 'time', 'system');
  await pickAxes(bo, 'time', 'system');
  await dragTo(ada, card(holding(ada, { row: 'identity' }), id), cell(ada, 'billing', 'q3'));
  await expect(card(cell(bo, 'billing', 'q3'), id)).toBeVisible();
  await dragTo(bo, card(cell(bo, 'billing', 'q3'), id), cell(bo, 'billing', 'q4'));
  await expect(card(cell(ada, 'billing', 'q4'), id)).toBeVisible();

  // Cy has the view link: the plan, live, and no way to change it.
  const cy = await person(browser);
  await cy.goto(links.view);
  await expect(cy.getByTestId('read-only-banner')).toContainText('view link');
  await expect(cy.getByTestId('shared-chip')).toContainText('View only');
  await pickAxes(cy, 'time', 'system');
  await expect(card(cell(cy, 'billing', 'q4'), id)).toBeVisible();
  await dragTo(cy, card(cell(cy, 'billing', 'q4'), id), cell(cy, 'billing', 'q2'));
  await expect(card(cell(cy, 'billing', 'q4'), id)).toBeVisible();
  await expect(cy.locator('.toolbar').getByRole('button', { name: 'Undo' })).toBeDisabled();
  await dragTo(ada, card(cell(ada, 'billing', 'q4'), id), cell(ada, 'billing', 'q2'));
  await expect(card(cell(cy, 'billing', 'q2'), id)).toBeVisible();
  // Nothing Cy tried reached the others.
  await expect(card(cell(bo, 'billing', 'q2'), id)).toBeVisible();

  // Renaming the plan renames it for everyone.
  await ada.getByTestId('plan-name').dblclick();
  await ada.getByLabel('Plan name').fill('Q3 platform plan');
  await ada.keyboard.press('Enter');
  await expect(bo.getByTestId('plan-name')).toHaveText('Q3 platform plan');
  await expect(cy.getByTestId('plan-name')).toHaveText('Q3 platform plan');

  // What the relay stored can't be read: no titles, no plan name.
  const stored = relayFiles(process.env.RELAY_E2E_DATA!).join('\n');
  expect(stored.length).toBeGreaterThan(0);
  for (const text of ['SSO enforcement', 'Sample plan', 'Q3 platform plan', 'Billing']) expect(stored).not.toContain(text);
});

test('opening the edit link where only the view link was held lets you edit', async ({ browser }) => {
  const ada = await person(browser);
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  const links = await share(ada, 'Ada');

  const bo = await person(browser);
  await bo.goto(links.view);
  await expect(bo.getByTestId('read-only-banner')).toBeVisible();
  await bo.goto(links.edit);
  await bo.reload();
  await expect(bo.getByTestId('plan-name')).toHaveText('Sample plan');
  await expect(bo.getByTestId('read-only-banner')).toHaveCount(0);
  await expect(bo.getByTestId('shared-chip')).toHaveText('Shared');
  // Still one plan: the link opened the one Bo had.
  expect(await planList(bo)).toEqual(['Sample plan', 'My plan']);
});

test('replacing a shared plan from a file changes it for everyone, and undo puts it back', async ({ browser }) => {
  const ada = await person(browser);
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  const links = await share(ada, 'Ada');
  const bo = await person(browser);
  await bo.goto(links.edit);
  await expect(bo.getByText('SSO enforcement per workspace').first()).toBeVisible();

  const file = {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ format: 'planning-board', version: 1, properties: [], items: [{ id: 'a', title: 'Restored from backup', values: {} }] }),
    ),
  };
  await ada.getByTestId('file-menu').click();
  await ada.getByRole('menuitem', { name: 'Replace this shared plan from a file…' }).click();
  await expect(ada.getByTestId('replace-shared')).toContainText('Everyone with this plan’s link');
  const chooser = ada.waitForEvent('filechooser');
  await ada.getByRole('button', { name: 'Choose a file…' }).click();
  await (await chooser).setFiles(file);
  await expect(bo.getByText('Restored from backup')).toBeVisible();
  await expect(bo.getByText('SSO enforcement per workspace')).toHaveCount(0);
  await ada.getByTestId('notice').getByRole('button', { name: 'Undo' }).click();
  await expect(bo.getByText('SSO enforcement per workspace').first()).toBeVisible();
  await expect(bo.getByText('Restored from backup')).toHaveCount(0);
});
