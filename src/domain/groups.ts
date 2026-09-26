// Grouping and ungrouping (requirements 11, 13, 14), as pure rules over
// plan snapshots. The commands in src/commands/ apply the results.

import { pathTo } from './hierarchy.ts';
import type { Dependency, ItemId, OrderKey, Plan, PropertyId, ValueId } from './model.ts';
import { compareOrderKeys, itemValues } from './model.ts';
import { childCounts, wouldCreateCycle } from './tree.ts';

/**
 * The values a new group takes from its children (sprint 1): for each
 * property, the most precise values every child shares, counting a value's
 * ancestors as shared. Children on Identity/SSO and Identity/MFA share
 * Identity; children in Q1/27.1 and Q1/27.2 share Q1. A property some child
 * has no value for gives the group none, so the group lands where all its
 * children were, or waits in a holding lane.
 *
 * Sequence has no hierarchy: the group starts where its earliest child
 * does, if every child has a position.
 */
export function sharedValues(
  plan: Plan,
  ids: readonly ItemId[],
): { sequence: OrderKey | null; values: Record<PropertyId, ValueId[]> } {
  const items = ids.map((id) => plan.items[id]).filter((item) => item !== undefined);
  if (items.length === 0) return { sequence: null, values: {} };

  const keys = items.map((item) => item.sequence);
  const sequence = keys.every((k) => k !== null) ? [...keys].sort(compareOrderKeys)[0]! : null;

  const values: Record<PropertyId, ValueId[]> = {};
  for (const property of Object.values(plan.properties)) {
    if (property.kind !== 'select') continue;
    // Each child's values plus all their ancestors; the group gets what's in every set.
    const closures = items.map(
      (item) => new Set(itemValues(item, property.id).flatMap((v) => pathTo(property, v).map((n) => n.id))),
    );
    const common = [...closures[0]!].filter((v) => closures.every((c) => c.has(v)));
    // Keep only the most precise: drop any value that's an ancestor of another kept one.
    const ancestors = new Set(common.flatMap((v) => pathTo(property, v).slice(0, -1).map((n) => n.id)));
    const shared = common.filter((v) => !ancestors.has(v));
    const kept = property.multi ? shared : shared.slice(0, 1);
    if (kept.length > 0) values[property.id] = kept;
  }
  return { sequence, values };
}

/** What ⌘G does with a selection. */
export type GroupPlan =
  /** Make a new group under `parent` containing `members`. */
  | { kind: 'new'; parent: ItemId | null; members: ItemId[] }
  /** Move `members` into an existing group. */
  | { kind: 'join'; group: ItemId; members: ItemId[] };

/**
 * If the selection holds exactly one existing group, the other cards join
 * it; otherwise they all go into a new group. Moves that would create a
 * cycle are left out (ADR 0004). Null when there's nothing to do.
 */
export function planGroup(plan: Plan, selection: Iterable<ItemId>): GroupPlan | null {
  const ids = [...new Set(selection)].filter((id) => plan.items[id]);
  const counts = childCounts(plan);
  const groups = ids.filter((id) => counts.has(id));
  if (groups.length === 1 && ids.length > 1) {
    const group = groups[0]!;
    const members = ids.filter((id) => id !== group && !wouldCreateCycle(plan, id, group));
    return members.length > 0 ? { kind: 'join', group, members } : null;
  }
  if (ids.length === 0) return null;
  // The new group sits where its members were: under their shared parent, if they have one.
  const parents = new Set(ids.map((id) => plan.items[id]!.parent));
  const parent = parents.size === 1 ? [...parents][0]! : null;
  return { kind: 'new', parent, members: ids };
}

/** What ungrouping one group does. */
export interface Ungroup {
  group: ItemId;
  /** Its direct children, which move up to `parent`. */
  children: ItemId[];
  parent: ItemId | null;
  /** The group's dependencies, which go away with it... */
  removed: Dependency[];
  /** ...and come back pointing at each child instead, so no ordering is lost (questions.md Q21). */
  added: Dependency[];
}

/**
 * Ungroup every group in the selection, one level each. Cards that aren't
 * groups are ignored. A group's own values go with it.
 */
export function planUngroup(plan: Plan, selection: Iterable<ItemId>): Ungroup[] {
  const counts = childCounts(plan);
  const ids = [...new Set(selection)].filter((id) => plan.items[id] && counts.has(id));
  const dissolved = new Set(ids);
  const key = (d: Dependency) => `${d.from}->${d.to}`;
  const existing = new Set(plan.dependencies.map(key));
  const out: Ungroup[] = [];
  for (const group of ids) {
    const children = Object.values(plan.items)
      .filter((item) => item.parent === group)
      .map((item) => item.id);
    const removed = plan.dependencies.filter((d) => d.from === group || d.to === group);
    const added: Dependency[] = [];
    for (const dep of removed) {
      const froms = dep.from === group ? children : [dep.from];
      const tos = dep.to === group ? children : [dep.to];
      for (const from of froms) {
        for (const to of tos) {
          const next = { from, to };
          // Skip self-links, links to another group being dissolved, and links that already exist.
          if (from === to || dissolved.has(from) || dissolved.has(to) || existing.has(key(next))) continue;
          existing.add(key(next));
          added.push(next);
        }
      }
    }
    out.push({ group, children, parent: plan.items[group]!.parent, removed, added });
  }
  return out;
}
