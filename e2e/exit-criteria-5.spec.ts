import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, foldAll, holdOver, openApp, pickAxes, reveal } from './app.ts';

// Sprint 5's exit criteria (docs/sprint-5.md) 1–9, end to end, in order. If this passes, the
// walkthrough in docs/demos/sprint-5.md works.

const OLD_PLAN = new URL('../src/domain/__fixtures__/compat/sprint-2.plan.json', import.meta.url);
const notice = (page: Page) => page.getByTestId('notice');
const inspector = (page: Page) => page.getByTestId('inspector');
const chip = (page: Page, id: string) => card(page, id).first().locator('.parent-chip');

async function select(page: Page, ...ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const c = card(page, id).first();
    await reveal(c);
    await c.locator('.card-title').click(i === 0 ? {} : { modifiers: ['Shift'] });
  }
}

interface PlanFile {
  items: { id: string; title: string; parent?: string }[];
  dependencies: unknown[];
}

async function save(page: Page): Promise<PlanFile> {
  const download = page.waitForEvent('download');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Save plan to file' }).click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8')) as PlanFile;
}

test('sprint 5 exit criteria', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  // 1. A plan file saved by an earlier build opens, and saves again with nothing lost.
  const old = JSON.parse(await readFile(OLD_PLAN, 'utf8')) as PlanFile;
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('open-plan-input').setInputFiles(OLD_PLAN.pathname);
  await expect(notice(page)).toContainText('Opened “sprint-2.plan.json”');
  const saved = await save(page);
  expect(saved.items.map((i) => [i.id, i.title, i.parent ?? null]).sort()).toEqual(
    old.items.map((i) => [i.id, i.title, i.parent ?? null]).sort(),
  );
  expect(saved.dependencies).toHaveLength(old.dependencies.length);
  // Back to this build's sample, with levels.
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: 'Load sample plan' }).click();
  await expect(card(page, 'eu-data-residency').locator('.attr[data-property="level"]')).toHaveText('Initiative');

  // 2. Expand an initiative, then one of its epics: both stay expanded. ⇧E on a story folds only its epic.
  await select(page, 'eu-data-residency');
  await page.keyboard.press('e');
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('e');
  await expect(chip(page, 'eu-kafka-cluster')).toHaveText('Regional pipeline shards');
  await expect(chip(page, 'eu-invoice-storage')).toHaveText('EU data residency');
  await select(page, 'eu-kafka-cluster');
  await page.keyboard.press('Shift+E');
  await expect(chip(page, 'regional-pipeline-shards')).toHaveText('EU data residency');
  await select(page, 'regional-pipeline-shards');
  await page.keyboard.press('Shift+E');
  await expect(card(page, 'eu-data-residency')).toHaveCount(1);

  // 3. ⇧-click an Initiative badge: every initiative is selected. E expands them all.
  await card(page, 'eu-data-residency').locator('.attr[data-property="level"]').click({ modifiers: ['Shift'] });
  await expect(notice(page)).toContainText('Selected 3 cards with Initiative');
  await page.keyboard.press('e');
  for (const id of ['eu-data-residency', 'usage-based-pricing', 'public-api-v2']) await expect(card(page, id)).toHaveCount(0);
  await expect(chip(page, 'usage-dashboard')).toHaveText('Usage-based pricing');
  await expect(chip(page, 'rate-limiting-v2')).toHaveText('Public API v2');
  // Fold them again for the next steps.
  await select(page, 'usage-dashboard', 'rate-limiting-v2', 'eu-invoice-storage');
  await page.keyboard.press('Shift+E');
  await expect(card(page, 'public-api-v2')).toHaveCount(1);

  // 4. Hold a dragged card over an epic: it highlights, and dropping nests it with its values unchanged.
  const roles = card(page, 'custom-roles');
  const size = await roles.locator('.attr[data-property="size"]').textContent();
  await holdOver(page, roles, card(page, 'passwordless-login'));
  await expect(card(page, 'passwordless-login')).toHaveClass(/nest-target/);
  await page.mouse.up();
  await expect(notice(page)).toContainText('Put “Custom roles” inside “Passwordless login”');
  await page.keyboard.press('e');
  await expect(chip(page, 'custom-roles')).toHaveText('Passwordless login');
  await expect(card(page, 'custom-roles').locator('.attr[data-property="size"]')).toHaveText(size!);
  // Undo puts it back. (Expanding isn't an edit, so the undo is the nest.)
  await page.keyboard.press('ControlOrMeta+z');
  await expect(chip(page, 'custom-roles')).toHaveCount(0);
  // A quick drop still lands in the cell.
  await dragTo(page, card(page, 'custom-roles'), card(page, 'saml-metadata-auto-refresh'));
  await expect(chip(page, 'custom-roles')).toHaveCount(0);

  // 5. Drag a child: "Move out of …" appears, and dropping there moves it up a level.
  await dragTo(page, card(page, 'webauthn-enrollment'), page.getByTestId('move-out'));
  await expect(notice(page)).toContainText('Moved “WebAuthn enrollment” out of “Passwordless login”');
  await expect(chip(page, 'webauthn-enrollment')).toHaveCount(0);

  // 6. The inspector: move a card into a group, and give a plain card its first child.
  await select(page, 'webauthn-enrollment');
  await page.keyboard.press('i');
  await inspector(page).getByRole('searchbox', { name: 'Move into a group' }).fill('passwordless');
  await inspector(page).getByRole('list', { name: 'Groups to move into' }).getByRole('button', { name: /Passwordless login/ }).click();
  await expect(notice(page)).toContainText('Moved “WebAuthn enrollment” into “Passwordless login”');
  await select(page, 'custom-roles');
  await inspector(page).getByRole('button', { name: 'Add a card inside' }).click();
  const field = page.getByRole('textbox', { name: 'Card title' }).first();
  await field.fill('Role templates v2');
  await field.press('Enter');
  await expect(page.locator('.card', { hasText: 'Role templates v2' }).locator('.parent-chip')).toHaveText('Custom roles');
  await page.keyboard.press('i');

  // 7. No zoom anywhere. Rows → System shows areas folded; Unfold all, Fold all, and unfold one area.
  await expect(page.getByTestId('zoom-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);
  await expect(page.getByTestId('axis-y').locator('option')).toHaveCount(await page.getByTestId('axis-x').locator('option').count());
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(4);
  await foldAll(page, 'System', false);
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(0);
  await foldAll(page, 'System', true);
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(4);
  await page.locator('.row-header.lane-collapsed[data-row="identity"]').getByRole('button', { name: /4 components/ }).click();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(3);

  // 8. Hover a card with copies: dashed lines join them, and every copy is outlined.
  const seatSync = card(page, 'seat-sync-from-directory');
  await reveal(seatSync.first());
  await seatSync.first().hover();
  await expect(page.locator('.copy-line[data-item="seat-sync-from-directory"]')).toHaveCount(await seatSync.count() - 1);
  await expect(page.locator('.card.copy-focus[data-item="seat-sync-from-directory"]')).toHaveCount(await seatSync.count());

  // 9. Reload without losing anything: the plan, folded and unfolded bands, and expanded groups.
  await page.reload();
  await page.getByTestId('board').waitFor();
  await expect(page.locator('.row-header.lane-collapsed')).toHaveCount(3);
  await expect(page.locator('.row-header[data-row="identity/rbac"]')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Role templates v2' }).locator('.parent-chip')).toHaveText('Custom roles');
  await expect(chip(page, 'webauthn-enrollment')).toHaveText('Passwordless login');
  await pickAxes(page, 'time', 'system');
  await expect(cell(page, 'identity', 'q1')).toBeVisible();
});
