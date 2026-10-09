import { expect, test } from '@playwright/test';

// Which relay a shared plan goes through: the cheat sheet names its build beside the app's, so a report about
// sharing says both, and the relay says the same at /config.

test('the cheat sheet names the build of the relay a shared plan goes through', async ({ page, request }) => {
  const config = (await (await request.get('/config')).json()) as { build: string };
  expect(config.build).toMatch(/^(dev|[0-9a-f]{7}( \(\d{4}-\d\d-\d\d\))?)$/);

  await page.goto('/');
  await page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await page.getByTestId('board').waitFor();
  await page.getByTestId('share-button').click();
  await page.getByTestId('share-name').fill('Ada');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('share-start').click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByTestId('legend-builds')).toContainText(`Relay ${config.build}`);
});
