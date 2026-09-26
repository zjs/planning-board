// Conflict detection (requirements 13, 16, 17), as pure functions. Sprint 0
// has no conflict UI; these exist so sprint 1 starts from tested rules.
// Conflicts are highlights for discussion, never constraints (requirement 19).
// Open semantic choices are listed in questions.md Q12.

import { ancestorAtLevel, depthOf, pathTo, valuesAtLevel } from './hierarchy.ts';
import type { Item, ItemId, Plan, SelectProperty, ValueId } from './model.ts';
import { itemValues, SIZE, SYSTEM, TIME } from './model.ts';
import { topLevelItems } from './tree.ts';

export type Conflict =
  /** A prerequisite placed after its dependent (requirement 16). */
  | { kind: 'dependency-order'; axis: 'sequence' | 'time'; prerequisite: ItemId; dependent: ItemId }
  /** More items on one component in one time bucket than its limit allows (requirement 17). */
  | { kind: 'contention'; component: ValueId; bucket: ValueId; items: ItemId[]; limit: number }
  /** A child that doesn't fit its group (requirement 13). */
  | { kind: 'group-size' | 'group-time' | 'group-system'; group: ItemId; child: ItemId };

export interface ConflictOptions {
  /** Time hierarchy level that counts as one bucket. Default 0 (quarter). */
  timeLevel?: number;
  /** Concurrency limit per component. */
  limits?: Record<ValueId, number>;
  /** Limit for components without their own. Default: none, so no contention is ever reported. */
  defaultLimit?: number | null;
}

function select(plan: Plan, id: string): SelectProperty | null {
  const p = plan.properties[id];
  return p?.kind === 'select' ? p : null;
}

/**
 * The span of time buckets (indexes at `level`, in tree order) an item's
 * date covers. A date at or below the level covers one bucket; a coarser
 * date (a quarter, in a release view) covers all the buckets inside it.
 */
function timeSpans(plan: Plan, level: number): (item: Item) => { first: number; last: number } | null {
  const time = select(plan, TIME);
  if (!time) return () => null;
  const buckets = valuesAtLevel(time, level);
  const index = new Map(buckets.map((node, i) => [node.id, i]));
  return (item) => {
    const value = itemValues(item, TIME)[0];
    if (value === undefined) return null;
    const depth = depthOf(time, value);
    if (depth < 0) return null;
    if (depth >= level) {
      const i = index.get(ancestorAtLevel(time, value, level) ?? '');
      return i === undefined ? null : { first: i, last: i };
    }
    const inside = buckets.flatMap((node, i) => (ancestorAtLevel(time, node.id, depth) === value ? [i] : []));
    return inside.length ? { first: inside[0]!, last: inside[inside.length - 1]! } : null;
  };
}

/**
 * Prerequisites placed strictly after their dependents. In time, only when
 * the order is certain: every bucket the prerequisite could be in comes after
 * every bucket the dependent could be in.
 */
export function dependencyConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  const span = timeSpans(plan, options.timeLevel ?? 0);
  const out: Conflict[] = [];
  for (const { from, to } of plan.dependencies) {
    const a = plan.items[from];
    const b = plan.items[to];
    if (!a || !b) continue;
    if (a.sequence !== null && b.sequence !== null && a.sequence > b.sequence) {
      out.push({ kind: 'dependency-order', axis: 'sequence', prerequisite: from, dependent: to });
    }
    const ta = span(a);
    const tb = span(b);
    if (ta && tb && ta.first > tb.last) {
      out.push({ kind: 'dependency-order', axis: 'time', prerequisite: from, dependent: to });
    }
  }
  return out;
}

/** Parent links that the board honors: orphans and cycle members count as top-level, as in tree.ts. */
function effectiveParents(plan: Plan): Map<ItemId, ItemId> {
  const topLevel = new Set(topLevelItems(plan));
  const parents = new Map<ItemId, ItemId>();
  for (const item of Object.values(plan.items)) {
    if (item.parent !== null && !topLevel.has(item.id)) parents.set(item.id, item.parent);
  }
  return parents;
}

/**
 * Components with more items in one time bucket than their limit. Counts
 * items tagged at the deepest system level with a definite bucket. A group
 * counts too, unless one of its descendants already counts on the same
 * component in the same bucket: children refine their group's estimate,
 * and counting both would double-count (Q12). Untagged and unscheduled
 * items are skipped (requirement 21).
 */
export function contentionConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  const system = select(plan, SYSTEM);
  if (!system) return [];
  const span = timeSpans(plan, options.timeLevel ?? 0);
  const time = select(plan, TIME);
  const buckets = time ? valuesAtLevel(time, options.timeLevel ?? 0) : [];
  const deepest = system.levels.length - 1;
  const load = new Map<string, { component: ValueId; bucket: ValueId; items: ItemId[] }>();
  for (const item of Object.values(plan.items)) {
    const s = span(item);
    if (!s || s.first !== s.last) continue;
    const bucket = buckets[s.first]!.id;
    for (const component of new Set(itemValues(item, SYSTEM))) {
      if (depthOf(system, component) !== deepest) continue;
      const key = `${component}\u0000${bucket}`;
      const entry = load.get(key) ?? { component, bucket, items: [] };
      entry.items.push(item.id);
      load.set(key, entry);
    }
  }

  const parents = effectiveParents(plan);
  const ancestors = (id: ItemId): Set<ItemId> => {
    const out = new Set<ItemId>();
    for (let p = parents.get(id); p !== undefined && !out.has(p); p = parents.get(p)) out.add(p);
    return out;
  };
  const out: Conflict[] = [];
  for (const { component, bucket, items } of load.values()) {
    const refined = new Set(items.flatMap((id) => [...ancestors(id)]));
    const counted = items.filter((id) => !refined.has(id)).sort();
    const limit = options.limits?.[component] ?? options.defaultLimit ?? null;
    if (limit !== null && counted.length > limit) {
      out.push({ kind: 'contention', component, bucket, items: counted, limit });
    }
  }
  return out;
}

/** Whether two known values overlap: one is the other or contains it. */
function overlaps(property: SelectProperty, a: ValueId, b: ValueId): boolean {
  const pa = pathTo(property, a).map((n) => n.id);
  const pb = pathTo(property, b).map((n) => n.id);
  const n = Math.min(pa.length, pb.length);
  return pa.slice(0, n).every((id, i) => id === pb[i]);
}

/**
 * Children that don't fit their group: larger than it, dated in a
 * different time bucket, or in a system area the group doesn't touch.
 * Only flagged when both sides have known values, and never "fixed"
 * (requirement 13). A child dated more loosely than its group (Q1 against
 * the group's release) might still fit, so only disjoint dates count (Q12).
 */
export function groupConflicts(plan: Plan): Conflict[] {
  const size = select(plan, SIZE);
  const time = select(plan, TIME);
  const system = select(plan, SYSTEM);
  const sizeRank = new Map(size ? valuesAtLevel(size, 0).map((node, i) => [node.id, i]) : []);
  const areaCache = new Map<ItemId, Set<ValueId>>();
  const areas = (item: Item): Set<ValueId> => {
    let set = areaCache.get(item.id);
    if (!set) {
      set = new Set(system ? itemValues(item, SYSTEM).flatMap((v) => ancestorAtLevel(system, v, 0) ?? []) : []);
      areaCache.set(item.id, set);
    }
    return set;
  };
  const knownTime = (item: Item) => {
    const value = itemValues(item, TIME)[0];
    return time && value !== undefined && depthOf(time, value) >= 0 ? value : undefined;
  };

  const out: Conflict[] = [];
  for (const [childId, groupId] of effectiveParents(plan)) {
    const child = plan.items[childId]!;
    const group = plan.items[groupId]!;
    const pair = { group: groupId, child: childId };

    const cs = sizeRank.get(itemValues(child, SIZE)[0] ?? '');
    const gs = sizeRank.get(itemValues(group, SIZE)[0] ?? '');
    if (cs !== undefined && gs !== undefined && cs > gs) out.push({ kind: 'group-size', ...pair });

    const ct = knownTime(child);
    const gt = knownTime(group);
    if (time && ct !== undefined && gt !== undefined && !overlaps(time, ct, gt)) {
      out.push({ kind: 'group-time', ...pair });
    }

    const childAreas = areas(child);
    const groupAreas = areas(group);
    if (childAreas.size > 0 && groupAreas.size > 0 && [...childAreas].some((a) => !groupAreas.has(a))) {
      out.push({ kind: 'group-system', ...pair });
    }
  }
  return out;
}

export function allConflicts(plan: Plan, options: ConflictOptions = {}): Conflict[] {
  return [...dependencyConflicts(plan, options), ...contentionConflicts(plan, options), ...groupConflicts(plan)];
}
