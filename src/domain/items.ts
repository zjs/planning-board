// Creating and deleting items, as pure rules over plan snapshots. The
// commands in src/commands/ apply the results to the Yjs document.

import type { Dependency, ItemId, OrderKey, Plan, PropertyId, ValueId } from './model.ts';
import { planDrop, type DropTarget } from './move.ts';
import type { ViewSpec } from './view.ts';

/** The values a new card gets. */
export interface NewItemValues {
  sequence: OrderKey | null;
  values: Record<PropertyId, ValueId[]>;
}

/**
 * The values a card created in a cell or holding lane starts with: exactly
 * what dropping an empty card there would write. The same rule as a drag,
 * so a new card lands where it was made.
 */
export function valuesForNewItem(plan: Plan, view: ViewSpec, target: DropTarget): NewItemValues {
  const probe = '\u0000new';
  const withProbe: Plan = {
    ...plan,
    items: {
      ...plan.items,
      [probe]: { id: probe, title: '', description: '', parent: null, sequence: null, values: {} },
    },
  };
  const change = planDrop(withProbe, view, { itemId: probe, x: null, y: null }, target);
  const values: Record<PropertyId, ValueId[]> = {};
  for (const [property, ids] of Object.entries(change?.values ?? {})) if (ids.length > 0) values[property] = ids;
  // In a lane zoom, the holding lane means "the zoomed value, nothing more precise" (Q22),
  // so a card made there gets that value and stays in view.
  for (const [axis, key] of [
    [view.x, target.x],
    [view.y, target.y],
  ] as const) {
    if (key === null && axis.within) values[axis.property] = [axis.within];
  }
  return { sequence: change?.sequence ?? null, values };
}

/**
 * Everything deleting `ids` removes (questions.md Q17): the items, every
 * item inside them at any depth, and every dependency touching one of
 * those. Cycle-safe, so bad parent data can't loop forever.
 */
export function deletionOf(plan: Plan, ids: Iterable<ItemId>): { items: ItemId[]; dependencies: Dependency[] } {
  const children = new Map<ItemId, ItemId[]>();
  for (const item of Object.values(plan.items)) {
    if (item.parent === null) continue;
    const siblings = children.get(item.parent);
    if (siblings) siblings.push(item.id);
    else children.set(item.parent, [item.id]);
  }
  const doomed = new Set<ItemId>();
  const stack = [...ids].filter((id) => plan.items[id]);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (doomed.has(id)) continue;
    doomed.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return {
    items: [...doomed],
    dependencies: plan.dependencies.filter((d) => doomed.has(d.from) || doomed.has(d.to)),
  };
}

/** Titles are trimmed; an empty title means "no change" for a rename and "cancel" for a new card. */
export function cleanTitle(title: string): string | null {
  const trimmed = title.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}
