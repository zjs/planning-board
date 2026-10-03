// Creating and deleting items, as pure rules over plan snapshots. The
// commands in src/commands/ apply the results to the Yjs document.

import { SEQUENCE, type Dependency, type Item, type ItemId, type OrderKey, type Plan, type PropertyId, type ValueId } from './model.ts';
import { planDrop, type DropTarget } from './move.ts';
import { cellOf, layoutView, type ViewSpec } from './view.ts';

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
  return { sequence: change?.sequence ?? null, values };
}

/**
 * Where a card made at `target` will sit, so the next card typed after it
 * (Q51) goes beside it. Usually `target` itself; for a gap between
 * sequence columns, the new column the card starts. Null if the card
 * wouldn't be on the board.
 */
export function newItemSpot(plan: Plan, view: ViewSpec, target: DropTarget): DropTarget | null {
  const probe = '\u0000new';
  const { sequence, values } = valuesForNewItem(plan, view, target);
  const withProbe: Plan = {
    ...plan,
    items: { ...plan.items, [probe]: { id: probe, title: '', description: '', parent: null, sequence, values } },
  };
  return cellOf(layoutView(withProbe, view), probe);
}

/**
 * The values a card added inside `parent` starts with: the parent's values
 * on the view's two axes, so it appears where the parent was. Nothing else
 * is copied: a child's size or level is its own.
 */
export function valuesForChild(parent: Item, view: ViewSpec): NewItemValues {
  let sequence: OrderKey | null = null;
  const values: Record<PropertyId, ValueId[]> = {};
  for (const axis of [view.x, view.y]) {
    if (axis.property === SEQUENCE) sequence = parent.sequence;
    else if ((parent.values[axis.property] ?? []).length > 0) values[axis.property] = [...parent.values[axis.property]!];
  }
  return { sequence, values };
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
