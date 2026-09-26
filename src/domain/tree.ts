import type { ItemId, Plan } from './model.ts';

/**
 * Direct child count for every item that has children. Items that
 * topLevelItems surfaces (orphans, cycle members) count as nobody's child,
 * so no item is both on the board and hidden inside a group.
 */
export function childCounts(plan: Plan): Map<ItemId, number> {
  const topLevel = new Set(topLevelItems(plan));
  const counts = new Map<ItemId, number>();
  for (const item of Object.values(plan.items)) {
    if (item.parent !== null && !topLevel.has(item.id)) {
      counts.set(item.parent, (counts.get(item.parent) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Whether moving `item` under `newParent` would make an item its own ancestor.
 * Single-user guard; M2's concurrent-move rule is in ADR 0004.
 */
export function wouldCreateCycle(plan: Plan, item: ItemId, newParent: ItemId | null): boolean {
  const seen = new Set<ItemId>();
  let current = newParent;
  while (current !== null && !seen.has(current)) {
    if (current === item) return true;
    seen.add(current);
    current = plan.items[current]?.parent ?? null;
  }
  return false;
}

/**
 * Items shown at the top level of the board: those with no parent, plus
 * items whose parent is missing or that sit on a parent cycle, so bad data
 * never makes an item unreachable.
 */
export function topLevelItems(plan: Plan): ItemId[] {
  return Object.values(plan.items)
    .filter(
      (item) =>
        item.parent === null ||
        !plan.items[item.parent] ||
        wouldCreateCycle(plan, item.id, item.parent),
    )
    .map((item) => item.id);
}
