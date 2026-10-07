import { expect, test } from '@playwright/test';
import { APP_URL } from './app.ts';

// Sprint 7, slice 1: views and visible pivots (Q52, ADR 0015).

async function openSample(page: import('@playwright/test').Page) {
  await page.goto(APP_URL);
  await page.locator('.empty-state').getByRole('button', { name: 'Load sample plan' }).click();
  await page.getByTestId('board').waitFor();
  const help = page.getByRole('button', { name: 'Close help' });
  if (await help.isVisible()) await help.click();
}

test('the sample opens on Roadmap, and a view is one click away', async ({ page }) => {
  await openSample(page);
  await expect(page.getByTestId('preset-roadmap')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('axis-x')).toHaveValue('time');
  await expect(page.getByTestId('axis-y')).toHaveValue('system');

  await page.getByTestId('preset-sizing').click();
  await expect(page.getByTestId('axis-x')).toHaveValue('size');
  await expect(page.getByTestId('axis-y')).toHaveValue('level');
  await expect(page.getByTestId('preset-sizing')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('preset-roadmap')).toHaveAttribute('aria-pressed', 'false');
});

test('a pair that is no preset marks none, and the pickers still work', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Swap rows and columns' }).click();
  await expect(page.getByTestId('axis-x')).toHaveValue('system');
  await expect(page.getByTestId('view-bar').locator('[aria-pressed="true"]')).toHaveCount(0);
});

test('the toolbar fits on one row at 1280 wide, with the view bar under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSample(page);
  const toolbar = (await page.locator('.toolbar').boundingBox())!;
  expect(toolbar.height).toBeLessThan(60);
  const bar = (await page.getByTestId('view-bar').boundingBox())!;
  expect(bar.height).toBeLessThan(50);
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('cards glide to a new view, and lines wait until they land', async ({ page }) => {
    await openSample(page);
    // The pivot lasts about 320 ms, which a slow runner can spend on one round trip, so the page records
    // what it saw the moment the board started pivoting, rather than the test looking afterwards.
    await page.evaluate(() => {
      const seen = { pivoting: false, running: 0 };
      (window as unknown as { seen: typeof seen }).seen = seen;
      new MutationObserver(() => {
        if (seen.pivoting || !document.querySelector('.board-scroll.pivoting')) return;
        seen.pivoting = true;
        seen.running = document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target instanceof Element).length;
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.getByTestId('preset-sequence').click();
    const seen = await page.evaluate(() => (window as unknown as { seen: { pivoting: boolean; running: number } }).seen);
    expect(seen.pivoting).toBe(true);
    expect(seen.running).toBeGreaterThan(0);
    await expect(page.locator('.board-scroll.pivoting')).toHaveCount(0);
  });
});

test('with reduced motion, a pivot is instant', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('preset-sequence').click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator('.board-scroll.pivoting')).toHaveCount(0);
});

test('after clicking a view, keys act on the card selected next, not on the view button', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('preset-sequence').click();
  const c = page.locator('.card[data-item="custom-roles"]').first();
  await c.locator('.card-title').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.card[data-item="custom-roles"]')).toHaveCount(0);
});
