import { expect, test } from '@playwright/test';
import { card, holding, openApp } from './app.ts';

const RBAC = ['custom-roles', 'least-privilege-default-role', 'role-templates-for-new-workspaces'];

test('⌘G groups the selection under a new card you name, and it lands where they were', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeDisabled();
  await card(page, RBAC[0]!).click();
  for (const id of RBAC.slice(1)) await card(page, id).click({ modifiers: ['Shift'] });

  await page.keyboard.press('ControlOrMeta+g');
  const field = page.getByRole('textbox', { name: 'Card title' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Role management');
  await page.keyboard.press('Enter');

  const group = page.locator('.card.group:not(.via-children)', { hasText: 'Role management' });
  await expect(group.locator('.child-count')).toHaveText('3');
  await expect(group).toHaveClass(/selected/);
  for (const id of RBAC) await expect(card(page, id)).toHaveCount(0);
  // All three share Identity › Roles & Permissions, but not a position, so the group waits in Identity's lane.
  await expect(holding(page, { row: 'identity' }).locator('.card', { hasText: 'Role management' })).toBeVisible();
  await expect(group.locator('.attr[data-property="system"]')).toHaveText('Roles & Permissions');

  // Two undo steps: the name, then the group.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.card.group:not(.via-children)', { hasText: 'New group' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.card.group:not(.via-children)', { hasText: 'New group' })).toHaveCount(0);
  for (const id of RBAC) await expect(card(page, id)).toHaveCount(1);
});

test('with one group in the selection, ⌘G adds the other cards to it', async ({ page }) => {
  await openApp(page);
  const group = card(page, 'eu-data-residency');
  await expect(group.locator('.child-count')).toHaveText('4');
  await group.click();
  await card(page, 'custom-roles').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(group.locator('.child-count')).toHaveText('5');
  await expect(card(page, 'custom-roles')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('⇧⌘G ungroups: children come back, selected, and undo puts the group back', async ({ page }) => {
  await openApp(page);
  const group = card(page, 'eu-data-residency');
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeDisabled();
  await group.click();
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+g');

  await expect(group).toHaveCount(0);
  // Its four children are back on the board and selected; one of them is itself a group.
  await expect(page.locator('.card.selected')).not.toHaveCount(0);
  const released = await page
    .locator('.card.selected')
    .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLElement).dataset.item))]);
  expect(released).toHaveLength(4);
  await expect(card(page, 'eu-kafka-cluster')).toHaveCount(0); // a grandchild stays inside its own group

  await page.keyboard.press('ControlOrMeta+z');
  await expect(group.locator('.child-count')).toHaveText('4');
});
