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

/**
 * The items shown inside `parent`: its children, or the top level for null.
 * Consistent with topLevelItems and childCounts, so no item shows in two places.
 */
export function childrenOf(plan: Plan, parent: ItemId | null): ItemId[] {
  const topLevel = topLevelItems(plan);
  if (parent === null) return topLevel;
  const surfaced = new Set(topLevel);
  return Object.values(plan.items)
    .filter((item) => item.parent === parent && !surfaced.has(item.id))
    .map((item) => item.id);
}

/**
 * The chain of groups from the top level down to `id`, inclusive: the
 * breadcrumb for zooming into it. Empty for an unknown item. Cycle-safe:
 * the chain stops where topLevelItems would surface the item.
 */
export function ancestry(plan: Plan, id: ItemId): ItemId[] {
  if (!plan.items[id]) return [];
  const surfaced = new Set(topLevelItems(plan));
  const chain: ItemId[] = [id];
  let current = id;
  while (!surfaced.has(current)) {
    const parent = plan.items[current]?.parent;
    if (parent == null || chain.includes(parent)) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/**
 * Whether `id` can be dragged inside `into` (hold to nest): another card,
 * not already its group, and not inside `id`, which would make a loop.
 */
export function canNest(plan: Plan, id: ItemId, into: ItemId): boolean {
  const item = plan.items[id];
  return (
    item !== undefined &&
    plan.items[into] !== undefined &&
    id !== into &&
    item.parent !== into &&
    !wouldCreateCycle(plan, id, into)
  );
}
