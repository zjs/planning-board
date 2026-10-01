import { expect, test, type Page } from '@playwright/test';
import { card, cell, doubleClickEmpty, dragTo, holding, openApp, openGroup, pickAxes } from './app.ts';

// Sprint 1's exit criteria (docs/sprint-1.md), end to end, in order. If this
// passes, the walkthrough in docs/demos/sprint-1.md works.

const RBAC = ['custom-roles', 'least-privilege-default-role', 'role-templates-for-new-workspaces'];
const zoomBar = (page: Page) => page.getByTestId('zoom-bar');
const groupCard = (page: Page, title: string) => page.locator('.card.group:not(.via-children)', { hasText: title });

test('sprint 1 exit criteria', async ({ page }) => {
  await openApp(page);

  // 1. Select three cards, group them, and name the group.
  await card(page, RBAC[0]!).click();
  for (const id of RBAC.slice(1)) await card(page, id).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await page.keyboard.type('Role management');
  await page.keyboard.press('Enter');
  await expect(groupCard(page, 'Role management').locator('.child-count')).toHaveText('3');

  // 2. Zoom into the group, add a child, rename one, and move one out through the breadcrumb.
  await openGroup(groupCard(page, 'Role management'));
  await expect(zoomBar(page)).toContainText('Role management');
  await doubleClickEmpty(page, page.locator('.cell:not(.gap):not(.holding-cell)').first());
  await page.keyboard.type('Role audit trail');
  await page.keyboard.press('Enter');
  await card(page, 'custom-roles').dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Custom roles v2');
  await page.keyboard.press('Enter');
  await expect(card(page, 'custom-roles').locator('.card-title')).toHaveText('Custom roles v2');
  await dragTo(page, card(page, 'least-privilege-default-role'), zoomBar(page).getByRole('button', { name: 'Plan' }));
  await expect(card(page, 'least-privilege-default-role')).toHaveCount(0);

  // 3. Ungroup it.
  await page.keyboard.press('Escape'); // clear the selection
  await page.keyboard.press('Escape'); // zoom out, landing on the group
  await expect(zoomBar(page)).toHaveCount(0);
  await expect(groupCard(page, 'Role management').locator('.child-count')).toHaveText('3');
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(groupCard(page, 'Role management')).toHaveCount(0);
  await expect(card(page, 'custom-roles')).toHaveCount(1);

  // 4. Zoom Identity down to its components, and tag an area-only card with a component.
  await pickAxes(page, 'time', 'system');
  await page.locator('.row-header[data-row="identity"]').getByRole('button').click();
  const areaOnly = card(holding(page, { column: 'q2' }), 'session-management-overhaul');
  await expect(areaOnly).toBeVisible();
  await dragTo(page, areaOnly, cell(page, 'identity/sso', 'q2'));
  await expect(card(cell(page, 'identity/sso', 'q2'), 'session-management-overhaul')).toBeVisible();
  await zoomBar(page).getByRole('button', { name: /Zoom out of/ }).click();

  // 6. (Before switching to releases.) See a group's faded copies in the lanes its children touch.
  await expect(cell(page, 'billing', 'q2').locator('.card.via-children[data-item="eu-data-residency"]')).toBeVisible();

  // 5. Switch Time to releases.
  await page.getByTestId('axis-x').selectOption('time:1');
  await expect(page.locator('.column-header').first()).toHaveText('27.1');

  // 7. Spot a mismatch marker on a collapsed group, and zoom in to find the child that causes it.
  const marker = card(page, 'eu-data-residency').first().locator('.mismatch');
  await expect(marker).toHaveText('⚠ 4');
  await openGroup(card(page, 'eu-data-residency').first());
  await expect(card(page, 'region-pinned-directory-sync').first().locator('.mismatch')).toBeVisible();
  await page.keyboard.press('Escape');

  // 8. Undo every step, and reload without losing anything.
  const undo = page.locator('.toolbar').getByRole('button', { name: /Undo/ });
  // The drag, the ungroup, the move out, the rename, the new card, the group's name, the group.
  for (let i = 0; i < 7; i++) await undo.click();
  await expect(card(page, 'session-management-overhaul')).toBeVisible();
  await pickAxes(page, 'sequence', 'system');
  for (const id of RBAC) await expect(card(page, id)).toHaveCount(1);
  await expect(card(page, 'custom-roles').locator('.card-title')).toHaveText('Custom roles');
  await expect(page.locator('.card', { hasText: 'Role audit trail' })).toHaveCount(0);
  await expect(page.locator('.card', { hasText: 'Role management' })).toHaveCount(0);
  // Only loading the sample plan is left to undo.
  await expect(undo).toBeEnabled();

  await page.reload();
  await page.getByTestId('board').waitFor();
  for (const id of RBAC) await expect(card(page, id)).toHaveCount(1);
  await expect(page.locator('.card', { hasText: 'Role management' })).toHaveCount(0);
});
