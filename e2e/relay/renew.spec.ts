import { expect, test, type Browser, type Page } from '@playwright/test';

// Making new links (sprint 12, slice 3; Q62): the old links turn read-only and say why, people who had them keep what
// they saw, and the new links open the plan as it is.

async function person(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('planning-board:me', n), name);
  return context.newPage();
}

test('make new links: old ones show the plan read-only and say why; the new ones work', async ({ browser }) => {
  const ada = await person(browser, 'Ada');
  await ada.goto('/');
  await ada.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await ada.getByTestId('share-button').click();
  await ada.getByTestId('share-start').click();
  const oldEdit = await ada.getByTestId('edit-link').inputValue();
  const oldView = await ada.getByTestId('view-link').inputValue();

  const bo = await person(browser, 'Bo');
  await bo.goto(oldEdit);
  await expect(bo.getByTestId('connection-state')).toHaveText('Live');
  const cards = await bo.locator('.card').count();

  // Ada makes new links, after a second step that says what happens to the old ones.
  await ada.getByTestId('renew-links').click();
  await expect(ada.getByTestId('share-dialog')).toContainText('Both links stop working');
  await ada.getByTestId('renew-confirm').click();
  await expect(ada.getByTestId('edit-link')).not.toHaveValue(oldEdit);
  const newEdit = await ada.getByTestId('edit-link').inputValue();
  await expect(ada.getByTestId('connection-state')).toHaveText('Live');

  // Bo, on the old link, is told at once, keeps the plan, and can't change it.
  await expect(bo.getByTestId('connection-state')).toHaveText('Link replaced');
  await expect(bo.getByTestId('read-only-banner')).toContainText('Ask whoever shared it for the new link');
  await expect(bo.locator('.card')).toHaveCount(cards);

  // Opening an old link later reads the plan as it was, and says the same.
  const cy = await person(browser, 'Cy');
  await cy.goto(oldView);
  await expect(cy.getByTestId('connection-state')).toHaveText('Link replaced');
  await expect(cy.locator('.card').first()).toBeVisible();

  // The new link opens the plan, live, and can change it.
  const di = await person(browser, 'Di');
  await di.goto(newEdit);
  await expect(di.getByTestId('connection-state')).toHaveText('Live');
  await expect(di.locator('.card')).toHaveCount(cards);
  await expect(di.getByTestId('read-only-banner')).toHaveCount(0);
});
