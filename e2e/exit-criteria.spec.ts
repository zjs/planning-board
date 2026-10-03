import { expect, test, type Page } from '@playwright/test';
import { card, cell, dragTo, expandGroup, foldAll, openApp, pickAxes } from './app.ts';

// Sprint 1's exit criteria (docs/sprint-1.md), end to end, in order. Zoom is gone since sprint 5
// (ADR 0013), so each step uses the gesture that replaced it: expand, the move-out strip, "Add a card
// inside", and unfolding a band.

const RBAC = ['custom-roles', 'least-privilege-default-role', 'role-templates-for-new-workspaces'];
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

  // 2. Add a child to the group, which expands it, rename one, and move one out with the strip.
  await page.keyboard.press('i');
  await page.getByTestId('inspector').getByRole('button', { name: 'Add a card inside' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Role audit trail');
  await page.keyboard.press('Enter');
  await page.keyboard.press('i');
  await expect(page.locator('.card', { hasText: 'Role audit trail' }).locator('.parent-chip')).toHaveText('Role management');
  await card(page, 'custom-roles').dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Custom roles v2');
  await page.keyboard.press('Enter');
  await expect(card(page, 'custom-roles').locator('.card-title')).toHaveText('Custom roles v2');
  await dragTo(page, card(page, 'least-privilege-default-role'), page.getByTestId('move-out'));
  await expect(card(page, 'least-privilege-default-role').locator('.parent-chip')).toHaveCount(0);

  // 3. Collapse the group, and ungroup it.
  await card(page, 'custom-roles').locator('.card-title').click();
  await page.keyboard.press('Shift+E');
  await expect(groupCard(page, 'Role management').locator('.child-count')).toHaveText('3');
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(groupCard(page, 'Role management')).toHaveCount(0);
  await expect(card(page, 'custom-roles')).toHaveCount(1);

  // 4. Unfold Identity to its components, and tag an area-only card with a component.
  await pickAxes(page, 'time', 'system');
  await page.locator('.row-header[data-row="identity"]').getByRole('button').click();
  const areaOnly = card(cell(page, 'identity', 'q2'), 'session-management-overhaul');
  await expect(areaOnly).toBeVisible();
  await dragTo(page, areaOnly, cell(page, 'identity/sso', 'q2'));
  await expect(card(cell(page, 'identity/sso', 'q2'), 'session-management-overhaul')).toBeVisible();
  await page.getByRole('button', { name: 'Fold Identity & Access' }).click();

  // 6. (Before switching to releases.) See a group's faded copies in the lanes its children touch.
  await expect(cell(page, 'billing', 'q2').locator('.card.via-children[data-item="eu-data-residency"]')).toBeVisible();

  // 5. Switch Time to releases.
  await foldAll(page, 'Time', false);
  await expect(page.locator('.column-header').first()).toHaveText('27.1');

  // 7. Spot a mismatch marker on a collapsed group, and expand it to find the child that causes it.
  const marker = card(page, 'eu-data-residency').first().locator('.mismatch');
  await expect(marker).toHaveText('⚠ 4');
  await expandGroup(card(page, 'eu-data-residency').first());
  await expect(card(page, 'region-pinned-directory-sync').first().locator('.mismatch')).toBeVisible();
  await page.keyboard.press('Escape');

  // 8. Undo every step, and reload without losing anything.
  const undo = page.locator('.toolbar').getByRole('button', { name: /Undo/ });
  // The drag, the ungroup, the move out, the rename, the new card's name, the new card, the group's
  // name, the group.
  for (let i = 0; i < 8; i++) await undo.click();
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
