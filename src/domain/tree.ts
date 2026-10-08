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
 * groups to expand to show it. Empty for an unknown item. Cycle-safe:
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

/**
 * How a card last moved between groups (ADR 0004): the group it left, and a
 * stamp that orders moves the same way on every computer. `counter` is a
 * Lamport clock, one more than any stamp the mover had seen; `client` breaks
 * ties between moves made at once.
 */
export interface MoveStamp {
  previous: ItemId | null;
  counter: number;
  client: number;
}

/** A card's place in the tree, for loop repair: deleted cards too, so a restore can't bring a loop back. */
export interface TreeNode {
  parent: ItemId | null;
  move?: MoveStamp;
}

/** Whether card a's move outranks card b's: the higher stamp, then the higher card ID, which also orders moves with no stamp. */
function outranks(a: ItemId, am: MoveStamp | undefined, b: ItemId, bm: MoveStamp | undefined): boolean {
  const [ac, al] = am ? [am.counter, am.client] : [-1, -1];
  const [bc, bl] = bm ? [bm.counter, bm.client] : [-1, -1];
  if (ac !== bc) return ac > bc;
  if (al !== bl) return al > bl;
  return a > b;
}

/** One loop of parents, if there is any: the cards on it, in parent order. */
function findLoop(parents: Map<ItemId, ItemId | null>): ItemId[] | null {
  const done = new Set<ItemId>();
  for (const start of parents.keys()) {
    const path: ItemId[] = [];
    const onPath = new Set<ItemId>();
    let current: ItemId | null = start;
    while (current !== null && parents.has(current) && !done.has(current)) {
      if (onPath.has(current)) return path.slice(path.indexOf(current));
      onPath.add(current);
      path.push(current);
      current = parents.get(current) ?? null;
    }
    for (const id of path) done.add(id);
  }
  return null;
}

/** Whether `id` is `ancestor` or below it, following `parents`. */
function isWithin(parents: Map<ItemId, ItemId | null>, id: ItemId | null, ancestor: ItemId): boolean {
  const seen = new Set<ItemId>();
  while (id !== null && !seen.has(id)) {
    if (id === ancestor) return true;
    seen.add(id);
    id = parents.get(id) ?? null;
  }
  return false;
}

/**
 * Settle loops of parents (ADR 0004). Two people can each nest a card
 * inside the other's at the same moment; each move is fine alone, and
 * together they make a loop. In each loop, the move with the highest stamp
 * loses: that card goes back to the group it left, or to the top level if
 * that would loop too, or the group is gone. Every computer reaches the same
 * answer from the same cards, so the repairs they write agree.
 *
 * Returns the new parent of each card that has to move; empty when there's
 * no loop. A group that's deleted still counts: a card sent back to it hides
 * with it (ADR 0016), as any card in a deleted group does.
 */
export function loopRepairs(nodes: Readonly<Record<ItemId, TreeNode>>): Map<ItemId, ItemId | null> {
  const parents = new Map<ItemId, ItemId | null>(Object.entries(nodes).map(([id, node]) => [id, node.parent]));
  const repairs = new Map<ItemId, ItemId | null>();
  for (let loop = findLoop(parents); loop !== null; loop = findLoop(parents)) {
    const loser = loop.reduce((a, b) => (outranks(b, nodes[b]!.move, a, nodes[a]!.move) ? b : a));
    const previous = nodes[loser]!.move?.previous ?? null;
    const back = previous !== null && parents.has(previous) && !isWithin(parents, previous, loser) ? previous : null;
    parents.set(loser, back);
    repairs.set(loser, back);
  }
  return repairs;
}
