import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

export const APP_URL = pathToFileURL(new URL('../dist/index.html', import.meta.url).pathname).href;

export async function openApp(page: Page) {
  await page.goto(APP_URL);
  await page.getByTestId('board').waitFor();
}

export async function pickAxes(page: Page, x: string, y: string) {
  // Pick Y first when X is currently Y's value, so the swap rule doesn't interfere.
  await page.getByTestId('axis-y').selectOption(y);
  await page.getByTestId('axis-x').selectOption(x);
}

export function cell(page: Page, row: string, column: string) {
  return page.locator(`.cell[data-row="${row}"][data-column="${column}"]`);
}
